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

### Une fois sur le serveur

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

Variables utiles :

- `CORS_ALLOW_ORIGIN` : origine autorisée ou `*` (défaut réfléchit l’`Origin` du navigateur si `*`).
- `PENNYLANE_API_BASE` : URL de base API (défaut Pennylane V2).
- `PENNYLANE_PROXY_MIN_INTERVAL` : délai minimal entre requêtes proxy (défaut 0,22 s).

## Fichiers

| Fichier | Rôle |
|--------|------|
| `solidarite-textile.html` / `frip-and-co.html` | Instances par société (`data-company-slug`) |
| `pennylane_proxy.py` | Proxy Flask (équivalent opérationnel du nom « pennylane-proxy ») |
| `public/css/solireport.css` | Charte visuelle (navy / slate, reporting) |
| `public/js/*.js` | Parsers GL / banque, stockage, API, graphiques, application |

## État fonctionnel

- Import xlsx GL et banque, persistance par année, journal d’import.
- Synthèse (KPI P&amp;L axe Analyse, graphique produits), trésorerie 512 + famille Trésorerie, contrôles de base, appels API (test `/me`, diagnostic, lancement export GL async).
- Onglets Dettes, P&amp;L centres / analytique, Bilan, DRC : structure prête, logique métier à enrichir selon le cahier des charges.
