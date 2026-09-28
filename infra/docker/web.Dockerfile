# APIx dashboard: React 18 + Vite + TypeScript, built to static files and served by
# nginx as a non-root user.

# ------------------------------------------------------------------- builder ----
FROM node:22-bookworm-slim AS builder

WORKDIR /build

COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci || npm install

COPY apps/web/ ./
# Vite inlines import.meta.env at BUILD time, so the API URL must be a build argument —
# an environment variable set on the running container is never seen by the bundle.
# (It used to be set under compose's `environment:`, where it silently did nothing and
# was masked by client.ts's matching localhost fallback.) To point an already-built
# image elsewhere, mount a config.js over /usr/share/nginx/html/config.js instead:
#   window.__APIX_CONFIG__ = { apiUrl: "https://api.example.org" };
ARG VITE_APIX_API_URL=http://localhost:8000
ENV VITE_APIX_API_URL=${VITE_APIX_API_URL}
RUN npm run build

# ------------------------------------------------------------------ runtime ----
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# The unprivileged image already runs as uid 101 and listens on 8080.
COPY --from=builder /build/dist /usr/share/nginx/html
COPY infra/docker/web-nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost:8080/ || exit 1
