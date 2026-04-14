# Cogerphere: Vite SPA + nginx + pdflatex (Notebook) + research proxy — one container.
#
# Build:
#   docker build -t cogerphere .
# Run:
#   docker run --rm -p 8080:8080 -e BRAVE_SEARCH_API_KEY=optional cogerphere
#
# Then open http://localhost:8080 — LaTeX compile and research proxy are same-origin under /api/*.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Same-origin API in the browser (nginx proxies /api → internal services)
ARG VITE_RESEARCH_PROXY_URL=/api
ENV VITE_RESEARCH_PROXY_URL=${VITE_RESEARCH_PROXY_URL}
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    nginx \
    ca-certificates \
    texlive-latex-recommended \
    texlive-fonts-recommended \
  && rm -f /etc/nginx/sites-enabled/default \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY server/latex-compile.mjs server/research-proxy.mjs /app/server/
COPY docker/nginx-docker.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
