#!/usr/bin/env python3
"""
Proxy Flask pour l'API Pennylane V2.
Contourne les restrictions CORS pour les appels depuis le navigateur.
"""

import time
import threading
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

PENNYLANE_BASE = "https://app.pennylane.com/api/external/v2"
RATE_LIMIT_DELAY = 0.22  # ~4.5 req/sec pour rester sous la limite de 5/sec
_last_request_time = 0
_lock = threading.Lock()


def _rate_limit():
    """Enforce rate limiting across all requests."""
    global _last_request_time
    with _lock:
        now = time.time()
        elapsed = now - _last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            time.sleep(RATE_LIMIT_DELAY - elapsed)
        _last_request_time = time.time()


def _get_headers():
    """Extract and forward the Authorization header."""
    auth = request.headers.get("Authorization", "")
    return {
        "Authorization": auth,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


@app.route("/api/<path:endpoint>", methods=["GET", "POST", "PUT", "DELETE"])
def proxy(endpoint):
    """Proxy all API requests to Pennylane."""
    _rate_limit()
    url = f"{PENNYLANE_BASE}/{endpoint}"
    headers = _get_headers()

    try:
        if request.method == "GET":
            resp = requests.get(url, headers=headers, params=request.args, timeout=30)
        elif request.method == "POST":
            resp = requests.post(url, headers=headers, json=request.get_json(silent=True), timeout=60)
        elif request.method == "PUT":
            resp = requests.put(url, headers=headers, json=request.get_json(silent=True), timeout=30)
        elif request.method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=30)
        else:
            return jsonify({"error": "Method not allowed"}), 405

        content_type = resp.headers.get("Content-Type", "")

        if "application/json" in content_type:
            return jsonify(resp.json()), resp.status_code
        elif "spreadsheet" in content_type or "octet-stream" in content_type:
            return Response(
                resp.content,
                status=resp.status_code,
                content_type=content_type,
                headers={"Content-Disposition": resp.headers.get("Content-Disposition", "")}
            )
        else:
            return Response(resp.content, status=resp.status_code, content_type=content_type)

    except requests.exceptions.Timeout:
        return jsonify({"error": "Timeout connecting to Pennylane API"}), 504
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Cannot connect to Pennylane API"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/exports/analytical_general_ledgers/<export_id>/download", methods=["GET"])
def download_export(export_id):
    """Download an export file (binary)."""
    _rate_limit()
    url = f"{PENNYLANE_BASE}/exports/analytical_general_ledgers/{export_id}/download"
    headers = _get_headers()

    try:
        resp = requests.get(url, headers=headers, timeout=120, stream=True)
        return Response(
            resp.content,
            status=resp.status_code,
            content_type=resp.headers.get("Content-Type", "application/octet-stream"),
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5555, debug=False)
