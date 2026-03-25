# Guide pas à pas : afficher SoliReport sur `dashboard.solidata.online`

SoliReport écoute en **HTTP sur le port 8088** de la machine. Le navigateur utilise **HTTPS** sur le port **443** : c’est **un autre programme** (reverse proxy) qui doit recevoir `https://dashboard.solidata.online` et **transférer** la requête vers `http://127.0.0.1:8088` (ou l’équivalent vu depuis un conteneur).

Suivez les étapes **dans l’ordre**. Notez sur papier le nom du conteneur proxy repéré à l’étape 2.

---

## Étape 0 — SSH sur le serveur

```bash
ssh root@votre-serveur
```

---

## Étape 1 — DNS et SoliReport OK

```bash
dig +short dashboard.solidata.online
curl -sS -H "Host: dashboard.solidata.online" http://127.0.0.1:8088/live
```

- La commande `dig` doit afficher **l’IP de ce serveur** (celui où vous êtes connecté).
- La commande `curl` doit afficher **`ok`**.

Si `curl` ne répond pas : corrigez d’abord `docker compose` dans `/var/www/solireport` (ce guide ne suffit pas).

---

## Étape 2 — Quel reverse proxy gère le HTTPS ?

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
```

Repérez une ligne avec **`0.0.0.0:443->`** ou **`:::443->`**.

| Si l’image / le nom ressemble à… | Allez à… |
|----------------------------------|----------|
| `traefik` | **Étape 3 — Traefik** |
| `caddy` | **Étape 4 — Caddy** |
| `nginxproxy/nginx-proxy` ou `jwilder/nginx-proxy` | **Étape 5 — nginx-proxy** |
| `nginx` (seul mot ou officiel) | **Étape 6 — Nginx dans Docker** |
| Rien en 443 sur Docker | Nginx ou Caddy **sur l’hôte** : **Étape 7** |

Si vous hésitez, copiez-collez la **sortie complète** de `docker ps` dans un message à votre interlocuteur technique.

---

## Cas réel : `solidata-proxy` (nginx:alpine) + stack SoliReport

Si `docker ps` ressemble à :

- `solidata-proxy` → `nginx:alpine` avec **80** et **443**
- `solireport-web` → port **8088** sur l’hôte

alors **tout le routage public** se configure dans **nginx au sein de `solidata-proxy`**, pas dans SoliReport.

### A. Mettre `solireport-web` sur le réseau Docker de Solidata

Sans cela, le nom `solireport-web` ne se résout pas depuis le proxy.

```bash
docker inspect solidata-proxy --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

Notez le nom de réseau (ex. `solidata_default`, `solidataonline_default`, etc.).

```bash
docker network connect <CE_NOM> solireport-web
```

Vérification :

```bash
docker exec solidata-proxy wget -qO- http://solireport-web/live
```

Attendu : `ok`.

### B. Pourquoi **HTTPS** affiche encore l’autre appli

Sur le port **443**, Nginx choisit un `server` avec `server_name` qui correspond. **S’il n’existe aucun bloc `listen 443 ssl` pour `dashboard.solidata.online`**, la requête tombe sur le **`default_server`** du 443 — en général **Solidata**. Le réseau Docker ne change rien à cela : il **faut** un vhost **HTTPS** dédié + certificat valide pour le dashboard.

### C. Installer le vhost (HTTP puis HTTPS)

**1.** `git pull` dans SoliReport, puis copier le fichier **déjà prêt** dans le proxy :

```bash
cd /var/www/solireport && git pull origin main
docker cp /var/www/solireport/deploy/dashboard.solidata.online.conf solidata-proxy:/etc/nginx/conf.d/dashboard.solidata.online.conf
docker exec solidata-proxy nginx -t && docker exec solidata-proxy nginx -s reload
```

Si Docker répond **`mounted volume is marked read-only`** : le `conf.d` du conteneur est un volume **hôte → conteneur** en **ro**. Ne pas utiliser `docker cp` vers le conteneur. Trouvez le **chemin sur l’hôte** et copiez-y le fichier :

```bash
docker inspect solidata-proxy --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

Repérez la ligne dont la **destination** est `.../conf.d` ou `/etc/nginx/conf.d` (le chemin exact peut varier). Puis, en remplaçant `/chemin/sur/hote/conf.d` par ce **Source** :

```bash
sudo cp /var/www/solireport/deploy/dashboard.solidata.online.conf /chemin/sur/hote/conf.d/dashboard.solidata.online.conf
docker exec solidata-proxy nginx -t && docker exec solidata-proxy nginx -s reload
```

Le fichier apparaît alors dans le conteneur sans écrire dans un volume **ro**.

**2.** Vérifier en **HTTP** (sans « s ») :

```bash
curl -sI http://dashboard.solidata.online/live | head -5
```

Vous devez voir **200** (pas une redirection vers `solidata.online` seul).

**3.** **Certificat Let’s Encrypt** pour `dashboard.solidata.online` : même procédure que pour `solidata.online` (souvent conteneur `certbot` + webroot `/var/www/certbot` sur le port 80). Exemple type (à adapter aux noms de services/volumes de **votre** compose Solidata) :

```bash
# depuis le repertoire du docker-compose Solidata
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d dashboard.solidata.online
```

**4.** Dans `/var/www/solireport/deploy/dashboard.solidata.online.conf`, **décommentez** tout le bloc `server { listen 443 ssl http2; ... }`, vérifiez les chemins `ssl_certificate` / `ssl_certificate_key`, recopiez le fichier dans le conteneur (ou éditez sur l’hôte), puis :

```bash
docker exec solidata-proxy nginx -t && docker exec solidata-proxy nginx -s reload
```

**5.** Tester **HTTPS** :

```bash
curl -sI https://dashboard.solidata.online/live | head -5
```

---

## Étape 3 — Traefik

### 3.1 Retrouver le nom du `certificatesResolver`

Sur le serveur :

```bash
sudo find /root /home /opt /var -name "traefik.yml" -o -name "traefik.toml" 2>/dev/null | head -20
```

Ouvrez le fichier trouvé (souvent dans le dossier du projet qui lance Traefik) et cherchez `certificatesResolvers`. Notez le **nom** (ex. `letsencrypt`, `myresolver`, `cloudflare`).

```bash
grep -R "certificatesResolvers" -n . 2>/dev/null | head -20
```

*(À lancer depuis le répertoire où se trouve votre `docker-compose` principal, ex. `cd /chemin/vers/solidata`.)*

### 3.2 Retrouver le nom de l’`entrypoint` HTTPS

Dans le même fichier Traefik, cherchez `entryPoints`. Le point d’entrée TLS s’appelle souvent **`websecure`** ou **`https`**. Notez-le.

### 3.3 Créer la règle dynamique

1. Copiez le fichier d’exemple du dépôt :

   `deploy/traefik-solireport-dynamic.example.yml`

2. Sur le serveur, placez-le dans le dossier que Traefik charge en **file provider** (souvent `./dynamic`, `./traefik/dynamic`, etc. — regardez dans `traefik.yml` la clé `providers.file.directory`).

3. Éditez le fichier :

   - `certResolver: letsencrypt` → remplacez par **votre** nom d’étape 3.1.
   - `entryPoints: - websecure` → remplacez si besoin par **votre** entrée HTTPS (3.2).

4. URL du backend : gardez d’abord `http://172.17.0.1:8088`.  
   Si après reload ça ne marche pas, testez `http://host.docker.internal:8088` (nécessite parfois `extra_hosts` sur le service Traefik).

### 3.4 Recharger Traefik

```bash
docker restart <nom_du_conteneur_traefik>
```

*(Ou `docker compose restart traefik` depuis le bon répertoire.)*

### 3.5 Vérifier

```bash
curl -sI https://dashboard.solidata.online/live | head -5
```

Vous voulez voir **HTTP/2 200** (ou 301 uniquement si vous redirigez HTTP→HTTPS une seule fois, pas vers solidata.online).

---

## Étape 4 — Caddy

Ouvrez le **Caddyfile** utilisé par votre conteneur ou service Caddy et ajoutez **un bloc dédié** (en dehors du bloc `solidata.online` s’il force une redirection) :

```caddyfile
dashboard.solidata.online {
    reverse_proxy 127.0.0.1:8088
}
```

Rechargez Caddy (`docker restart …` ou `caddy reload` selon votre install), puis testez comme en **3.5**.

---

## Étape 5 — nginx-proxy (jwilder)

Il faut un conteneur sur le **même réseau Docker** que nginx-proxy, avec les variables :

```yaml
environment:
  - VIRTUAL_HOST=dashboard.solidata.online
  - LETSENCRYPT_HOST=dashboard.solidata.online
  - VIRTUAL_PORT=80
```

Le plus simple est souvent d’**attacher** le service `web` SoliReport au réseau de nginx-proxy (réseau externe dans `docker-compose` SoliReport) et d’exposer le conteneur `solireport-web` avec ces labels/variables selon la variante (nginx-proxy + companion). Si votre stack utilise **un seul** `docker-compose` pour tout, demandez l’aide de la personne qui l’a écrite : l’intégration dépend du fichier exact.

---

## Étape 6 — Nginx (conteneur)

Dans le `server` qui écoute en **443** pour `dashboard.solidata.online`, ajoutez :

```nginx
location / {
    proxy_pass http://172.17.0.1:8088;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Adaptez `172.17.0.1` si votre passerelle Docker n’est pas l’IP par défaut (`ip -4 addr show docker0`).

---

## Étape 7 — Pas de Docker sur 443 (Nginx sur l’hôte)

Si c’est **nginx** installé avec `apt` qui écoute sur 443, créez un nouveau site :

```nginx
server {
    listen 443 ssl http2;
    server_name dashboard.solidata.online;
    ssl_certificate     /etc/letsencrypt/live/dashboard.solidata.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.solidata.online/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Émettez le certificat (`certbot certonly` ou `--nginx`), `nginx -t`, `systemctl reload nginx`.

---

## Si ça échoue encore

1. `curl -sI https://dashboard.solidata.online/` — noter **Location:** si redirection.
2. Vérifier qu’aucune règle **wildcard** `*.solidata.online` ne prend le dessus.
3. Essayer l’autre URL backend : `172.17.0.1:8088` ↔ `127.0.0.1:8088` selon que le proxy est **dans** ou **hors** Docker.
