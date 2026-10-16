# ============================================================
# ZengLian AI Tutor v1.5.5 Production Container Image
# Production Server Runtime (Ubuntu 24.04 LTS - Native GLIBC 2.39)
# ============================================================
FROM ubuntu:24.04
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=8080

# Install official Node.js 22 LTS on Ubuntu 24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy backend dependency declarations
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy pre-built frontend distribution
COPY client/dist ./client/dist

# Copy server source code, maintenance scripts, and data definitions
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY data/ ./data/

# Ensure runtime directories exist
RUN mkdir -p data/lancedb logs

# Pre-build LanceDB and canonical questions database during Docker image build
RUN node scripts/seed_demo_data.js \
    && node -e "const { initDB, closeDB } = require('./server/db/init'); (async () => { await initDB(); await closeDB(); })()" \
    && rm -f data/textbooks_k9_seed.json.gz

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node scripts/health-check.js || exit 1

# Launch the modular backend server directly
CMD ["node", "server/index.js"]
