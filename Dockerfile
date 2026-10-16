# ============================================================
# ZengLian AI Tutor v1.5.5 Production Container Image
# Official Node.js 22 LTS (Debian Bookworm) - Native GLIBC
# ============================================================
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

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
