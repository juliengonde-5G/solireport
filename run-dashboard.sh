#!/usr/bin/env bash
# Lance le proxy Pennylane. Exemple: PORT=8765 ./run-dashboard.sh
cd "$(dirname "$0")"
export PORT="${PORT:-8765}"
export CORS_ALLOW_ORIGIN="${CORS_ALLOW_ORIGIN:-*}"
exec python -m flask --app pennylane_proxy run --host 0.0.0.0 --port "$PORT"
