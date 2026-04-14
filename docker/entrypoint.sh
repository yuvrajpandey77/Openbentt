#!/bin/sh
set -e
echo "[entry] starting LaTeX compile service on 127.0.0.1:8788"
PORT=8788 HOST=127.0.0.1 node /app/server/latex-compile.mjs &
echo "[entry] starting research proxy on 127.0.0.1:8787"
PORT=8787 node /app/server/research-proxy.mjs &
sleep 1
echo "[entry] nginx on :8080 (static + /api/* proxies)"
exec nginx -g "daemon off;"
