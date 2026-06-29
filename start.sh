#!/bin/bash
set -e

echo "============================================"
echo "  曾练专属私教 AI Tutor Launcher"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found! Please install Node.js first."
    echo "        Download: https://nodejs.org/"
    exit 1
fi

# Install server dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[1/3] Installing server dependencies..."
    npm install
else
    echo "[1/3] Server dependencies OK."
fi

# Build frontend if needed
if [ ! -d "client/dist" ]; then
    echo "[2/3] Building frontend..."
    cd client
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    npm run build
    cd ..
else
    echo "[2/3] Frontend build OK."
fi

# Start server
echo "[3/3] Starting AI Tutor server..."
echo ""
echo "   Access: http://localhost:3001"
echo "   Press Ctrl+C to stop"
echo "============================================"
echo ""

node start.js
