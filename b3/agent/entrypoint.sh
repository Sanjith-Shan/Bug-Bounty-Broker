#!/usr/bin/env bash
set -euo pipefail

# Start FastAPI on internal port; Caddy reverse-proxies and terminates TLS.
uvicorn app.main:app --host 0.0.0.0 --port "${APP_PORT:-3000}" &
UVICORN_PID=$!

# Caddy is optional in local dev. Only start it if a DOMAIN is set
# (EigenCompute injects DOMAIN once `ecloud compute app configure tls` runs).
if [ -n "${DOMAIN:-}" ]; then
  echo "Starting Caddy for domain: ${DOMAIN}"
  caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
  CADDY_PID=$!
fi

wait "${UVICORN_PID}"
