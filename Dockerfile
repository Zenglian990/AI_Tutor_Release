# Use Debian-based Node.js base image
FROM node:20-bookworm

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies (Python, pip, OpenCV dependencies)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./
COPY requirements.txt ./

# Install Python packages globally using system packages flag (safe in container)
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Install Node.js packages
RUN npm ci

# Copy the entire release package
COPY . .

# Build the React frontend
RUN npm run build:client && rm -rf client/node_modules client/src

# Clean up apt caches
RUN apt-get clean && rm -rf /var/cache/apt/archives/*

# Expose backend port
EXPOSE 3001

# Environment variables default
ENV PORT=3001
ENV NODE_ENV=production

# Start backend server
CMD ["node", "start.js"]
