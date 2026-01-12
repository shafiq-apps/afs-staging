#!/bin/bash

cd /var/www/staging

echo "Pulling latest changes..."
git pull origin staging

echo "Installing dependencies..."
npm install

echo "Building the project..."
npm run build

echo "Restarting the application with PM2..."
pm2 list
pm2 reload all

# pm2 logs

echo "Amazing Shafiq! Deployment complete!"