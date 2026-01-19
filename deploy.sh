#!/bin/bash

# Production Deployment Script
# Run this script on your production server after pushing code

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color


if ! true; then
    pm2 delete ecosystem.config.js || true
    echo -e "${YELLOW} Starting PM2 processes...${NC}"
    pm2 start ecosystem.config.js
    pm2 save
    echo "DONE"
    exit 1
fi


echo -e "${YELLOW} Starting deployment process...${NC}"

# Get the script directory and navigate to the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Pull the latest code from Git
echo -e "${YELLOW} Pulling latest changes from Git...${NC}"
git pull;

# Step 2: Install root level dependencies (like dotenv)
echo -e "${YELLOW} Installing root level npm dependencies...${NC}"
npm install

# Step 3: Check if PM2 is installed globally (optional check, assuming global install)
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED} PM2 is not installed globally. Installing PM2...${NC}"
    npm install -g pm2
fi

# Step 4: Build both applications (This script handles sub-module installs and builds)
echo -e "${YELLOW} Building applications (via build-production.sh)...${NC}"
bash ./build-production.sh

# Step 5: Stop and Delete existing PM2 processes
echo -e "${YELLOW} Stopping and deleting existing PM2 processes...${NC}"
# Use || true to prevent the script from exiting if PM2 processes aren't running yet
pm2 delete ecosystem.config.js || true

# Step 6: Start PM2 processes (Reads the fresh config and uses the new builds)
echo -e "${YELLOW} Starting PM2 processes...${NC}"
# Assuming your ecosystem file handles NODE_ENV=production internally via 'env_file' or 'env' block
pm2 start ecosystem.config.js

# Step 7: Save PM2 configuration for persistence across reboots
pm2 save

# Step 8: Show status and finish
echo -e "${GREEN} Deployment completed successfully!${NC}"

echo ""

pm2 status
