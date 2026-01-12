#!/bin/bash

# Production Build Script for AFS Staging
# Builds both Node.js API server and Remix app

set -e  # Exit on error immediately if a command fails

echo "🚀 Starting production build process..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory and navigate to the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Build Node.js API Server
echo -e "${YELLOW}📦 Building Node.js API server...${NC}"
cd "$SCRIPT_DIR/app"
if [ ! -d "node_modules" ]; then
    echo "Installing Node.js API dependencies using npm ci..."
    # Install all dependencies required for building
    npm ci --production=false
fi

npm install

npm run build
cd "$SCRIPT_DIR" # Return to root directory

# Step 2: Build Remix App (Dashboard)
echo -e "${YELLOW}📦 Building Remix app (Dashboard)...${NC}"
cd "$SCRIPT_DIR/dashboard"
if [ ! -d "node_modules" ]; then
    echo "Installing Remix app dependencies using npm ci..."
    # Install all dependencies required for building
    npm ci --production=false
fi

npm install

npm run build

cd "$SCRIPT_DIR" # Return to root directory

# Step 3: Create logs directory if it doesn't exist (relative to root)
mkdir -p logs

echo -e "${GREEN} Production build completed successfully!${NC}"


