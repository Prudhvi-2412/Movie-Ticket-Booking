# =====================================================================
# CineWave frontend — build with Vite, serve the static bundle with nginx.
# Build context is ./frontend.
# =====================================================================
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
# `npm ci` needs the dev dependencies: vite and tailwind are what do the build.
RUN npm ci

COPY . .

# Baked in at build time. Same-origin by default, because nginx proxies /api
# to the backend container — see nginx.conf.
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

# ---------------------------------------------------------------------
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
