#!/bin/bash

# Production Build Script for AFS Staging
# Builds Node.js API server and/or Remix app based on user choice

set -e  # Exit immediately on error

echo "Starting production build process..."

# ---------------------------------
# CONFIGURATION (CHANGE HERE ONLY)
# ---------------------------------
APP_DIR="app"                 # Node.js API folder name
DASHBOARD_DIR="dashboard"     # Remix dashboard folder name
LOGS_DIR="logs"
# ---------------------------------

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory and navigate to the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# -------------------------------
# Build functions
# -------------------------------
build_app() {
    echo -e "${YELLOW} Building Node.js API server...${NC}"
    cd "$SCRIPT_DIR/$APP_DIR"

    if [ ! -d "node_modules" ]; then
        echo "Installing Node.js API dependencies using npm ci..."
        npm ci --production=false
    fi

    npm install
    npm run build

    cd "$SCRIPT_DIR"
}

build_dashboard() {
    echo -e "${YELLOW} Building Remix app (Dashboard)...${NC}"
    cd "$SCRIPT_DIR/$DASHBOARD_DIR"

    if [ ! -d "node_modules" ]; then
        echo "Installing Remix app dependencies using npm ci..."
        npm ci --production=false
    fi

    npm install
    npm run build

    cd "$SCRIPT_DIR"
}

# -------------------------------
# User selection
# -------------------------------
echo ""
echo "Select build option:"
echo "  0) BOTH ($APP_DIR + $DASHBOARD_DIR)"
echo "  1) APP only ($APP_DIR)"
echo "  2) DASHBOARD only ($DASHBOARD_DIR)"
echo ""
read -p "Press 0, 1, or 2 (default: 1): " BUILD_OPTION

case "$BUILD_OPTION" in
    0)
        build_app
        build_dashboard
        ;;
    1)
        build_app
        ;;
    2)
        build_dashboard
        ;;
    *)
        build_app
        ;;
esac

# -------------------------------
# Logs directory
# -------------------------------
mkdir -p "$SCRIPT_DIR/$LOGS_DIR"

echo -e "${GREEN} Production build completed successfully!${NC}"
