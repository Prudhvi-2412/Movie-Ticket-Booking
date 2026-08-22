# =====================================================================
# CineWave backend
#
# Built from the REPOSITORY ROOT, not from ./backend:
#   docker build -f backend/Dockerfile .
#
# The migration runner reads the .sql files under MovieBookingSystem/, so
# they have to be inside the build context. With a ./backend context the
# image shipped without them and AUTO_MIGRATE failed on first boot.
# =====================================================================
FROM node:20-alpine

# tini reaps zombies and forwards SIGTERM, which is what makes the graceful
# shutdown in server.js actually run inside a container.
RUN apk add --no-cache tini

WORKDIR /app

# Dependencies first so a source-only change reuses the install layer.
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/src ./src
COPY backend/scripts ./scripts
COPY MovieBookingSystem ./sql

# Drop root. `node` exists in the base image already.
RUN chown -R node:node /app
USER node

# The repo layout puts the SQL a level above backend/; in the image it lives
# alongside the app, so the runner is told where to look rather than relying
# on a relative path that only holds in one of the two layouts.
ENV SQL_ROOT=/app/sql
ENV NODE_ENV=production
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
