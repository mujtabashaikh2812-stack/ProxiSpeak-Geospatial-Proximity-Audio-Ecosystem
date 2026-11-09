# ProxiSpeak Geospatial Proximity Audio Ecosystem - Production Container
# Multi-stage lightweight Node.js 20 Alpine image with security hardening

FROM node:20-alpine AS base

# Install dumb-init for proper signal handling and zombie process reaping
RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

# Set production environment flags
ENV NODE_ENV=production \
    PORT=5000 \
    HOST=0.0.0.0

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies cleanly
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source code
COPY . .

# Security: run application as unprivileged 'node' user instead of root
USER node

# Expose internal application HTTP & WebSocket port
EXPOSE 5000

# Native Docker healthcheck probe targeting /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# Launch server with dumb-init for graceful SIGTERM/SIGINT teardown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
