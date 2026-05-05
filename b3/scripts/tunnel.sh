#!/usr/bin/env bash
# Keep a localtunnel up, auto-restart on drops.
#
# Tunnels the developer's local Anvil (chain 84532, port 8545) to a stable
# public URL the deployed EigenCompute agent can reach. The deployed
# agent's `.env.production` references this URL as `BASE_SEPOLIA_RPC_URL`.
#
# Usage:  ./scripts/tunnel.sh
# Stop:   Ctrl+C

set -uo pipefail

SUBDOMAIN="${LT_SUBDOMAIN:-icy-loops-film}"
PORT="${LT_PORT:-8545}"

trap 'echo; echo "tunnel stopping"; exit 0' INT TERM

while true; do
  echo "[$(date +%H:%M:%S)] starting localtunnel → https://${SUBDOMAIN}.loca.lt → :${PORT}"
  npx --yes localtunnel --port "$PORT" --subdomain "$SUBDOMAIN" || true
  echo "[$(date +%H:%M:%S)] tunnel exited, restarting in 2s…"
  sleep 2
done
