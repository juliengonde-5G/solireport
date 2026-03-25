"""
Proxy CORS pour l'API Pennylane External V2 (equivalent operationnel de pennylane-proxy.py).
Ne stocke pas la cle API : elle est transmise par le client (header Authorization).
Limite de debit : ~5 requetes/seconde (espacement minimal entre requetes).
"""
from __future__ import annotations

import json
import os
import threading
import time

import requests
from flask import Flask, Response, request

PENNYLANE_BASE = os.environ.get(
    "PENNYLANE_API_BASE", "https://app.pennylane.com/api/external/v2"
).rstrip("/")

MIN_INTERVAL = float(os.environ.get("PENNYLANE_PROXY_MIN_INTERVAL", "0.22"))

app = Flask(__name__)

_lock = threading.Lock()
_last_ts = 0.0


def _throttle():
    global _last_ts
    with _lock:
        now = time.monotonic()
        wait = MIN_INTERVAL - (now - _last_ts)
        if wait > 0:
            time.sleep(wait)
        _last_ts = time.monotonic()


def _forward(method: str, path: str) -> Response:
    _throttle()
    qs = request.query_string.decode("utf-8") if request.query_string else ""
    url = f"{PENNYLANE_BASE}/{path}"
    if qs:
        url = f"{url}?{qs}"

    headers = {}
    auth = request.headers.get("Authorization")
    if auth:
        headers["Authorization"] = auth
    accept = request.headers.get("Accept")
    if accept:
        headers["Accept"] = accept
    content_type = request.headers.get("Content-Type")
    if content_type:
        headers["Content-Type"] = content_type

    data = request.get_data() if method in ("POST", "PUT", "PATCH") else None

    try:
        r = requests.request(
            method,
            url,
            headers=headers,
            data=data,
            timeout=120,
        )
    except requests.RequestException as e:
        body = json.dumps({"error": "proxy_upstream", "detail": str(e)})
        return Response(body, status=502, mimetype="application/json")

    excluded = {"content-encoding", "transfer-encoding", "connection"}
    out_headers = [
        (k, v)
        for k, v in r.headers.items()
        if k.lower() not in excluded
    ]
    return Response(r.content, status=r.status_code, headers=out_headers)


@app.after_request
def add_cors(resp: Response):
    origin = request.headers.get("Origin")
    allowed = os.environ.get("CORS_ALLOW_ORIGIN", "*")
    if allowed == "*" and origin:
        resp.headers["Access-Control-Allow-Origin"] = origin
    else:
        resp.headers["Access-Control-Allow-Origin"] = allowed
    resp.headers["Access-Control-Allow-Headers"] = (
        "Authorization, Content-Type, Accept"
    )
    resp.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    )
    resp.headers["Access-Control-Max-Age"] = "86400"
    return resp


@app.route("/health")
def health():
    return {"status": "ok", "base": PENNYLANE_BASE}


@app.route("/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
def proxy(subpath: str):
    if request.method == "OPTIONS":
        return Response(status=204)
    return _forward(request.method, subpath)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
