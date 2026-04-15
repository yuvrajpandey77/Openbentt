#!/bin/sh
set -e
echo "[entry] research proxy on 127.0.0.1:8787"
PORT=8787 node /app/server/research-proxy.mjs &
sleep 1
echo "[entry] nginx on :8080 (static + /api/research; LaTeX runs in-browser WASM)"
exec nginx -g "daemon off;"
