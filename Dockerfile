# Cogerphere: Vite SPA (LaTeX compiles in-browser via WASM) + nginx + research proxy.
#
# Builder downloads BusyTeX assets (~175MB) so `public/core/busytex` is baked into dist.
#
# Build:
#   docker build -t cogerphere .
# Run:
#   docker run --rm -p 8080:8080 -e BRAVE_SEARCH_API_KEY=optional cogerphere

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npx texlyre-busytex download-assets public/core

COPY . .
ARG VITE_RESEARCH_PROXY_URL=/api
ENV VITE_RESEARCH_PROXY_URL=${VITE_RESEARCH_PROXY_URL}
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
