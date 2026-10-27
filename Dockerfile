# ============================================================
# ZengLian AI Tutor v1.5.5 Production Container Image
# Official Node.js 22 LTS (Debian Bookworm - with native C++ build tools)
# ============================================================
# Use Google Cloud internal mirror for ultra-fast pulls inside Cloud Shell (avoids docker.io TCP stalls)
FROM mirror.gcr.io/library/node:22-bookworm
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Ensure build essentials and python3 exist for node-gyp native sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy backend dependency declarations
COPY package*.json ./

# Install production dependencies and compile sqlite3 natively for Node 22 to fix ERR_DLOPEN_FAILED
RUN npm install --omit=dev && npm rebuild sqlite3 --build-from-source

# Copy pre-built frontend distribution
COPY client/dist ./client/dist

# Copy server source code, maintenance scripts, and data definitions
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY data/ ./data/

# Ensure runtime directories exist
RUN mkdir -p data/lancedb logs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node scripts/health-check.js || exit 1

# Launch the modular backend server directly
CMD ["node", "server/index.js"]
