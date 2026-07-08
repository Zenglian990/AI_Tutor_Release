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

# Check if .env has GEMINI_API_KEY
has_key=0
if [ -f ".env" ]; then
    if grep -q "GEMINI_API_KEY=" .env; then
        has_key=1
    fi
fi

if [ "$has_key" -eq 0 ]; then
    echo "============================================================"
    echo "  Welcome to EduAgent (曾练专属私教 AI Tutor)!"
    echo "============================================================"
    echo "  First-time setup requires your Gemini API Key."
    echo "  You can get one for free at Google AI Studio (https://aistudio.google.com/)."
    echo "============================================================"
    echo ""
    read -p "Please enter your Gemini API Key: " user_key
    
    # Write to .env
    if ! grep -q "GEMINI_API_KEY=" .env 2>/dev/null; then
        echo "" >> .env
        echo "GEMINI_API_KEY=$user_key" >> .env
        echo "[INFO] Successfully saved your Gemini API Key to .env file."
    else
        echo "[INFO] GEMINI_API_KEY already exists in .env, skipping."
    fi
    echo ""
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
