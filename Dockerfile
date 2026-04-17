# syntax=docker/dockerfile:1.4
# Openbentt: Vite SPA (LaTeX compiles in-browser via WASM) + nginx + research proxy.
#
# First build is slow (~3–8 min): `npm ci` + BusyTeX assets (~175MB). After that, layers cache.
# Faster local builds: run `npm run download:busytex` once so `public/core/busytex/` exists — the
# conditional step below skips the download when `busytex.wasm` is present in the build context.
#
# Build:
#   DOCKER_BUILDKIT=1 docker build -t openbentt .
# Run:
#   docker run --rm -p 8080:8080 -e BRAVE_SEARCH_API_KEY=optional openbentt

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

ARG VITE_RESEARCH_PROXY_URL=/api
ENV VITE_RESEARCH_PROXY_URL=${VITE_RESEARCH_PROXY_URL}

# Skip ~175MB download when BusyTeX is already in context (e.g. after `npm run download:busytex`).
RUN if [ ! -f public/core/busytex/busytex.wasm ]; then \
      echo "[docker] BusyTeX assets missing — downloading (~175MB, one-time)…"; \
      npx texlyre-busytex download-assets public/core; \
    else \
      echo "[docker] Using public/core/busytex from build context — skipping download."; \
    fi

RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    nginx \
    ca-certificates \
  && rm -f /etc/nginx/sites-enabled/default \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY server/research-proxy.mjs /app/server/
COPY docker/nginx-docker.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
