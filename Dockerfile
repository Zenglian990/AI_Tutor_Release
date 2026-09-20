# ============================================================
# Stage 1: Build React Frontend
# ============================================================
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci || npm install

COPY client/ ./
RUN npm run build

# ============================================================
# Stage 2: Production Server Runtime (Ubuntu 24.04 LTS - Native GLIBC 2.39)
# ============================================================
FROM ubuntu:24.04
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3001

# Install official Node.js 22 LTS on Ubuntu 24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy backend dependency declarations
COPY package*.json ./

# Install production dependencies (prebuilt binaries run natively on Ubuntu 24.04)
RUN npm ci --omit=dev || npm install --omit=dev

# Copy server source code, maintenance scripts, and data definitions
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY data/ ./data/

# Ensure runtime directories exist
RUN mkdir -p data/lancedb logs

# Copy built frontend from Stage 1 for static hosting
COPY --from=frontend-builder /app/client/dist ./client/dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node scripts/health-check.js || exit 1

# Launch the modular backend server directly
CMD ["node", "server/index.js"]
