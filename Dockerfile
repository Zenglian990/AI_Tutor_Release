# ============================================================
# Stage 1: Build React Frontend
# ============================================================
FROM node:22-noble AS frontend-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ============================================================
# Stage 2: Production Server Runtime (Ubuntu 24.04 LTS Noble - GLIBC 2.39)
# ============================================================
FROM node:22-noble-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy backend dependency declarations
COPY package*.json ./

# Install production dependencies (runs cleanly on Node 22 with Ubuntu 24.04 GLIBC)
RUN npm ci --omit=dev

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
