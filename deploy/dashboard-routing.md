# Router `dashboard.solidata.online` vers SoliReport (port 8088)

Tant que le **reverse proxy** qui gère le HTTPS (souvent dans Docker sur 80/443) n’a **pas une règle dédiée** pour `dashboard.solidata.online` vers `http://127.0.0.1:8088`, le navigateur continuera d’afficher **l’autre appli** (même `server` par défaut, wildcard `*.solidata.online`, ou redirection).

## 1. Vérifications rapides

Sur votre PC ou le serveur :

```bash
dig +short dashboard.solidata.online
```

L’IP doit être celle du serveur où tourne `docker compose` SoliReport.

Prouver que SoliReport répond **si le bon Host est envoyé** (sans toucher au DNS) :

```bash
curl -sS -H "Host: dashboard.solidata.online" http://127.0.0.1:8088/live
```

Attendu : `ok`. Si oui, il ne manque que la config du **proxy frontal**.

## 2. Où configurer ?

Sur le serveur :

```bash
docker ps --format "{{.Names}}\t{{.Image}}\t{{.Ports}}"
```

Repérez le conteneur qui publie **443** (Traefik, nginx-proxy, Caddy, etc.). C’est **lui** qu’il faut compléter (fichier dynamic, labels `docker-compose`, etc.).

## 3. Exemple Traefik (fichier dynamic)

Adaptez `entrypoints`, `certificatesResolvers` et l’URL du serveur (souvent `http://172.17.0.1:8088` depuis Traefik sur Linux, ou `http://host.docker.internal:8088` si activé).

Fichier à inclure dans `providers.file.directory` de Traefik, par ex. `dynamic/solireport.yml` :

```yaml
http:
  routers:
    solireport-dashboard:
      rule: Host(`dashboard.solidata.online`)
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      service: solireport-dashboard
  services:
    solireport-dashboard:
      loadBalancer:
        servers:
          - url: "http://172.17.0.1:8088"
```

Remplacez `letsencrypt` par le nom de **votre** resolver ACME dans `traefik.yml`.

Redémarrage / reload Traefik selon votre installation.

## 4. Exemple Caddy (bloc sur le serveur hôte ou conteneur Caddy)

```caddyfile
dashboard.solidata.online {
    reverse_proxy 127.0.0.1:8088
}
```

## 5. Piège fréquent : wildcard

Si un site est déclaré avec `*.solidata.online` ou une règle « catch-all », il peut **prendre** `dashboard` avant SoliReport. Il faut soit :

- une règle **plus spécifique** pour `dashboard.solidata.online` **en priorité**, soit  
- retirer le wildcard, soit  
- exclure explicitement le sous-domaine dashboard.

## 6. Redirection côté « autre appli »

Si `curl -I https://dashboard.solidata.online` renvoie un **301/302** vers `solidata.online`, cherchez dans la config Nginx/Caddy/Traefik de **l’appli principale** une règle du type « tout sauf X → redirect » et corrigez-la.
