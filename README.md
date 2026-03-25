# SoliReport

Tableau de bord financier autonome (navigateur) pour **Solidarité Textile** et **Frip and Co** : deux fichiers HTML distincts, proxy Pennylane partagé, logique et styles communs dans `public/`.

## Prérequis

- Python 3.10+
- Accès CDN (SheetJS 0.18.5, Chart.js 4.4.1, Google Fonts) depuis le navigateur

## Développement local

1. Créer un environnement et installer les dépendances :

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

2. Lancer le proxy Pennylane (contourne CORS, ~5 req/s côté proxy) :

```bash
python -m flask --app pennylane_proxy run --host 0.0.0.0 --port 8765
```

Sous PowerShell : `.\run-dashboard.ps1`

3. Servir les fichiers statiques (obligatoire pour `fetch` vers le proxy, éviter `file://`) :

```bash
python -m http.server 8080
```

4. Ouvrir par exemple `http://localhost:8080/solidarite-textile.html` ou `frip-and-co.html`. Dans **Paramètres**, indiquer l’URL du proxy : `http://localhost:8765` (sans slash final obligatoire).

La clé API Pennylane n’est pas injectée dans le HTML : saisie dans le formulaire, jamais via gabarit côté serveur.

## Déploiement (dashboard.solidata.online)

### Option A — Docker Compose (**recommandé** si les ports 80/443 sont déjà pris par Docker)

Un stack **Nginx + Gunicorn** sert l’appli sur le port **8088** (HTTP). Vous ne touchez pas aux ports 80/443 : votre reverse proxy existant (Traefik, Caddy, etc.) envoie le trafic HTTPS de `dashboard.solidata.online` vers `http://127.0.0.1:8088` ou `http://172.17.0.1:8088` (depuis un autre conteneur sur Linux).

**Sur le serveur :**

```bash
cd /var/www/solireport
# Si Git refuse le depot (proprietaire different, ex. deploy vs root) :
sudo git config --global --add safe.directory /var/www/solireport
git pull origin main
# Verifier que le fichier compose est bien la :
test -f docker-compose.yml && echo OK || echo "docker-compose.yml manquant — git pull / deploiement incomplet"
docker compose -f /var/www/solireport/docker-compose.yml build --pull
docker compose -f /var/www/solireport/docker-compose.yml up -d
curl -sS http://127.0.0.1:8088/health
```

Si `docker compose` n’existe pas, essayez l’ancienne CLI : `docker-compose` (paquet `docker-compose-plugin` ou `docker-compose-v2` selon la distro).

**Dépannage rapide**

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| `detected dubious ownership` | Répertoire déployé par un autre utilisateur que celui qui lance `git` | `sudo git config --global --add safe.directory /var/www/solireport` (une fois), ou harmoniser `chown` du dossier |
| `no configuration file provided: not found` | Pas de `docker-compose.yml` dans le répertoire courant, ou mauvais `cd` | `cd /var/www/solireport` puis `ls docker-compose.yml`, ou `git pull` après `safe.directory` |
| `curl ... 8088 ... Failed to connect` | Les conteneurs ne tournent pas | `docker compose -f /var/www/solireport/docker-compose.yml ps` et `docker compose ... logs` |
| `curl: (56) Recv failure: Connection reset by peer` | Souvent **HTTPS sur un port HTTP** (8088), proxy frontal mal configuré, ou conteneur qui coupe la connexion | Voir encadre ci-dessous |

**Si `curl` affiche « Connection reset by peer »**

1. Utiliser **HTTP** (pas HTTPS) sur le port Docker : `curl -v --http1.1 http://127.0.0.1:8088/live` puis `http://127.0.0.1:8088/health`.
2. Si **`/live`** répond `ok` mais **`/health`** reset : le backend Python ne répond pas — `docker compose logs pennylane-proxy`.
3. Si **`/live`** reset aussi : port ou pare-feu — `docker ps`, `ss -tlnp | grep 8088`, `docker compose logs web`.
4. Depuis l’Internet, tester **HTTPS** sur le domaine (pas `:8088` en TLS) : le certificat est sur le reverse proxy, pas sur ce stack.
5. Forcer IPv4 : `curl -4 http://127.0.0.1:8088/live`.

Ensuite, configurez le **proxy frontal** (celui qui écoute déjà en 443) pour router le host `dashboard.solidata.online` vers **http://`IP_DU_SERVEUR`:8088** (ou `http://172.17.0.1:8088` depuis un conteneur sur le réseau bridge par défaut). Le TLS reste géré par ce frontal.

Dans l’appli (**Paramètres**), **URL du proxy** : `https://dashboard.solidata.online/api/pennylane`.

Variable optionnelle : `CORS_ALLOW_ORIGIN` dans `docker compose` (fichier `.env` à côté du compose ou `export` avant `up`).

**Mises à jour :** `git pull && docker compose up -d --build`

La config Nginx est dans **`deploy/docker/nginx.conf`** (fichier principal complet, pas seul `conf.d`), copiée dans l’image **`Dockerfile.web`**. Après changement de config : **`docker compose build web --no-cache && docker compose up -d`**.

**Si `curl` sur 8088 donne « Connection reset »** : tester dans l’ordre — `curl -4 --http1.0 -H "Connection: close" http://127.0.0.1:8088/live` ; **`curl http://127.0.0.1:18765/health`** (Gunicorn exposé en local sur l’hôte, sans passer par Nginx) ; **`docker exec solireport-web wget -qO- http://127.0.0.1/live`** ; **`docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' solireport-web`** puis `curl http://<IP>/live`. Cela distingue un bug **docker-proxy / port publish** (IP conteneur OK, 127.0.0.1:8088 KO) d’un souci **Nginx**.

---

### Option B — Nginx + systemd sur l’hôte (sans Docker pour SoliReport)

À utiliser seulement si **rien** n’écoute sur 80/443 sur la machine, ou si vous dédiez ces ports à Nginx hôte.

1. Répertoire déployé (ex. `/var/www/solireport`) : HTML à la racine, `public/`, `pennylane_proxy.py`, `requirements.txt`.

2. Environnement Python et service Gunicorn :

```bash
cd /var/www/solireport
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Puis systemd : voir deploy/solireport-proxy.service.example (adapter WorkingDirectory et ExecStart)
```

3. Nginx : fichiers statiques + `/api/pennylane/` vers Gunicorn — voir `deploy/nginx-dashboard.example.conf`.

4. Dans l’application (**Paramètres**), **URL du proxy** : `https://dashboard.solidata.online/api/pennylane` (sans chemin supplémentaire ; les appels ajoutent `me`, `exports/...`, etc.).

### Le sous-domaine ouvre solidata.online au lieu du dashboard

Cela arrive quand **Nginx ne possède pas encore un `server` dont le `server_name` est exactement `dashboard.solidata.online`**. Les requêtes tombent alors sur le **vhost par défaut** (`default_server`), souvent celui de `solidata.online`, avec redirection ou autre appli.

**À vérifier :**

1. **DNS** : `dashboard.solidata.online` doit avoir un enregistrement **A** (ou **AAAA**) vers l’IP du serveur qui héberge SoliReport (commande : `dig +short dashboard.solidata.online`).
2. **Nginx** : ajouter un fichier de site dédié (voir `deploy/nginx-dashboard.example.conf`), avec uniquement `server_name dashboard.solidata.online;`, `root /var/www/solireport;`, et les blocs `location` pour `/api/pennylane/` et les fichiers statiques. Activer le site, tester `sudo nginx -t`, puis `sudo systemctl reload nginx`.
3. **Certificat TLS** : émettre un certificat pour `dashboard.solidata.online` (ex. `certbot --nginx -d dashboard.solidata.online`).
4. **Pas de catch-all indésirable** : si le vhost `solidata.online` utilise `server_name solidata.online *.solidata.online`, il peut **aussi** prendre `dashboard.solidata.online`. Dans ce cas, retirez le wildcard du site principal ou assurez-vous que le vhost **dashboard** est chargé et prioritaire (fichier séparé avec `server_name` explicite suffit en général : Nginx choisit le `server_name` le plus précis).

### Déploiement automatique depuis GitHub

Le workflow `.github/workflows/deploy-production.yml` pousse le contenu du dépôt vers le serveur par **rsync** à chaque push sur `main` (ou déclenchement manuel *workflow_dispatch*).

Configurer les secrets du dépôt (**Settings → Secrets and variables → Actions**) :

| Secret | Description |
|--------|-------------|
| `PROD_SSH_KEY` | Clé privée SSH (déploiement), tout le bloc PEM |
| `PROD_HOST` | Hôte SSH du serveur |
| `PROD_USER` | Utilisateur SSH (ex. `deploy`) |
| `PROD_REMOTE_PATH` | Chemin absolu distant, **sans** slash final (ex. `/var/www/solireport`) |
| `PROD_SSH_PORT` | (Optionnel) Port SSH, défaut `22` |

Sur le serveur : clé publique dans `~/.ssh/authorized_keys` de `PROD_USER`, droits en écriture sur `PROD_REMOTE_PATH`. Après le premier sync, redémarrer le service Gunicorn si nécessaire (`sudo systemctl restart solireport-proxy` ou équivalent).

### Script d’installation systemd (option B uniquement)

Inutile si vous utilisez **Docker Compose** (option A). Sinon, une fois les fichiers du dépôt sur le serveur :

```bash
cd /var/www/solireport   # ou votre PROD_REMOTE_PATH
sudo bash deploy/install-server.sh
```

Variables optionnelles : `INSTALL_DIR`, `SERVICE_USER` (défaut `www-data`), `LISTEN_HOST` (défaut `127.0.0.1`), `LISTEN_PORT` (défaut `8765`). Le script crée le venv, installe les paquets Python, installe et démarre le service systemd `solireport-proxy`.

Variables utiles :

- `CORS_ALLOW_ORIGIN` : origine autorisée ou `*` (défaut réfléchit l’`Origin` du navigateur si `*`).
- `PENNYLANE_API_BASE` : URL de base API (défaut Pennylane V2).
- `PENNYLANE_PROXY_MIN_INTERVAL` : délai minimal entre requêtes proxy (défaut 0,22 s).

## Fichiers

| Fichier | Rôle |
|--------|------|
| `docker-compose.yml` + `Dockerfile` | Déploiement simple (Nginx + proxy sur le port 8088) |
| `solidarite-textile.html` / `frip-and-co.html` | Instances par société (`data-company-slug`) |
| `pennylane_proxy.py` | Proxy Flask (équivalent opérationnel du nom « pennylane-proxy ») |
| `public/css/solireport.css` | Charte visuelle (navy / slate, reporting) |
| `public/js/*.js` | Parsers GL / banque, stockage, API, graphiques, application |

## État fonctionnel

- Import xlsx GL et banque, persistance par année, journal d’import.
- Synthèse (KPI P&amp;L axe Analyse, graphique produits), trésorerie 512 + famille Trésorerie, contrôles de base, appels API (test `/me`, diagnostic, lancement export GL async).
- Onglets Dettes, P&amp;L centres / analytique, Bilan, DRC : structure prête, logique métier à enrichir selon le cahier des charges.
