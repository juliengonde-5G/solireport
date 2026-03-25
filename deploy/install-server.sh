#!/usr/bin/env bash
#
# Installation SoliReport sur le serveur de production (a lancer en SSH).
#
# Usage (sur le serveur, depuis la racine du depot deja present) :
#   sudo bash deploy/install-server.sh
#
# Ou avec repertoires personnalises :
#   sudo INSTALL_DIR=/var/www/solireport SERVICE_USER=www-data bash deploy/install-server.sh
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/var/www/solireport}"
SERVICE_USER="${SERVICE_USER:-www-data}"
VENV_DIR="${VENV_DIR:-${INSTALL_DIR}/.venv}"
LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
LISTEN_PORT="${LISTEN_PORT:-8765}"

log() { echo "[solireport] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  log "Relancez avec sudo : sudo bash deploy/install-server.sh"
  exit 1
fi

if [[ ! -f "${INSTALL_DIR}/pennylane_proxy.py" ]]; then
  log "Erreur : pennylane_proxy.py introuvable dans ${INSTALL_DIR}"
  log "Clonez ou rsync le depot ici, puis relancez."
  exit 1
fi

log "Repertoire : ${INSTALL_DIR}"
cd "${INSTALL_DIR}"

log "Dependances systeme (python3-venv, python3-pip)..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq python3 python3-venv python3-pip rsync
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y python3 python3-pip rsync
else
  log "Aucun apt-get/dnf detecte : installez python3 et venv manuellement."
fi

log "Creation venv : ${VENV_DIR}"
python3 -m venv "${VENV_DIR}"
# shellcheck source=/dev/null
source "${VENV_DIR}/bin/activate"
pip install --upgrade pip -q
pip install -r "${INSTALL_DIR}/requirements.txt"

log "Permissions (proprietaire ${SERVICE_USER} pour Gunicorn + fichiers statiques)..."
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"
find "${INSTALL_DIR}" -type d -exec chmod 755 {} \;
find "${INSTALL_DIR}" -type f -exec chmod 644 {} \;
chmod 755 "${VENV_DIR}/bin"/* 2>/dev/null || true

UNIT_DST="/etc/systemd/system/solireport-proxy.service"
log "Ecriture ${UNIT_DST}"
cat >"${UNIT_DST}" <<EOF
[Unit]
Description=SoliReport proxy Pennylane (Gunicorn)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=PORT=${LISTEN_PORT}
Environment=CORS_ALLOW_ORIGIN=https://dashboard.solidata.online
ExecStart=${VENV_DIR}/bin/gunicorn -w 2 -b ${LISTEN_HOST}:${LISTEN_PORT} pennylane_proxy:app
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable solireport-proxy.service
systemctl restart solireport-proxy.service

if systemctl is-active --quiet solireport-proxy.service; then
  log "Service solireport-proxy : actif."
else
  log "Attention : le service ne semble pas actif. Journal : journalctl -u solireport-proxy -n 50 --no-pager"
fi

log "Termine."
log "Verifier : curl -sS http://${LISTEN_HOST}:${LISTEN_PORT}/health"
log "Nginx : proxifier /api/pennylane/ vers http://${LISTEN_HOST}:${LISTEN_PORT}/ (voir deploy/nginx-dashboard.example.conf)"
log "Dans le dashboard, URL proxy : https://dashboard.solidata.online/api/pennylane"
