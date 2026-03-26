#!/bin/bash
# Lanceur du tableau de bord financier
# Usage: ./start.sh [port_proxy] [port_http]

PROXY_PORT=${1:-5555}
HTTP_PORT=${2:-8080}
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Tableau de Bord Financier ==="
echo ""

# Check Python dependencies
if ! python3 -c "import flask, flask_cors, requests" 2>/dev/null; then
    echo "[*] Installation des dependances Python..."
    pip3 install -r "$DIR/requirements.txt"
fi

# Start proxy
echo "[*] Demarrage du proxy Pennylane sur le port $PROXY_PORT..."
python3 "$DIR/pennylane-proxy.py" &
PROXY_PID=$!

# Start HTTP server
echo "[*] Demarrage du serveur HTTP sur le port $HTTP_PORT..."
cd "$DIR"
python3 -m http.server "$HTTP_PORT" &
HTTP_PID=$!

echo ""
echo "=== Dashboards disponibles ==="
echo "  Solidarite Textile : http://localhost:$HTTP_PORT/solidarite-textile.html"
echo "  Frip and Co        : http://localhost:$HTTP_PORT/fripandco.html"
echo "  Proxy Pennylane    : http://localhost:$PROXY_PORT/health"
echo ""
echo "Appuyez sur Ctrl+C pour arreter."

cleanup() {
    echo ""
    echo "[*] Arret..."
    kill $PROXY_PID 2>/dev/null
    kill $HTTP_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM
wait
