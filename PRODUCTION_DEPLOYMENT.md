# Production Deployment Guide

This guide explains how to deploy both the Node.js API server and Remix app on a single domain using PM2 and Nginx.

## Architecture Overview

```
Internet
   ↓
Nginx (Port 80/443)
   ├── /api/* → Node.js API Server (Port 3554)
   ├── /graphql → Node.js API Server (Port 3554)
   └── /* → Remix App (Port 3000)
```

## Prerequisites

1. **Server Requirements:**
   - Ubuntu/Debian Linux server
   - Node.js >= 20.19 (or >= 22.12)
   - Nginx installed
   - PM2 installed globally
   - Git installed

2. **Domain Configuration:**
   - Domain name pointing to your server's IP address
   - SSL certificate (Let's Encrypt recommended)

## Step 1: Server Setup

### Install Node.js (if not already installed)

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### Install PM2

```bash
sudo npm install -g pm2
```

### Install Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

## Step 2: Clone and Setup Project

```bash
# Clone your repository
cd /var/www  # or your preferred directory
git clone <your-repo-url> Kore
cd Kore

# Install dependencies for both apps
cd app
npm ci
cd ../dashboard
npm ci
cd ..
```

## Step 3: Configure Environment Variables

### Node.js API Server

```bash
cd app
cp ../env.production.template .env
# Or create .env.production for production-specific overrides
nano .env  # Edit with your production values
```

**Important variables:**
- `PORT=3554` (must be 3554)
- `NODE_ENV=production`
- Elasticsearch connection details
- Any other required environment variables

**Note:** The env loader will look for `.env` or `.env.production` in the `app/` directory. Since PM2 runs from `app/` directory, place your `.env` file there.

### Remix App

```bash
cd dashboard
cp env.production.template .env
nano .env  # Edit with your production values
```

**Important variables:**
- `PORT=3000` (must be 3000)
- `NODE_ENV=production`
- Shopify app credentials
- Database URL
- `API_URL=http://localhost:3554` or `https://your-domain.com/api`

**Note:** Place your `.env` file in the `dashboard/` directory.

## Step 4: Build Applications

```bash
# From the root directory
chmod +x build-production.sh
./build-production.sh
```

This will:
1. Build the Node.js API server to `app/dist/`
2. Build the Remix app to `dashboard/build/`

## Step 5: Configure Nginx

1. **Update nginx.conf:**
   ```bash
   nano nginx.conf
   ```
   
   Replace `your-domain.com` with your actual domain name.

2. **Note:** React Router v7 serves all static files through its server, so no separate static files configuration is needed in nginx.

3. **Copy Nginx configuration:**
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/kore
   sudo ln -s /etc/nginx/sites-available/kore /etc/nginx/sites-enabled/
   ```

4. **Test Nginx configuration:**
   ```bash
   sudo nginx -t
   ```

5. **Restart Nginx:**
   ```bash
   sudo systemctl restart nginx
   ```

## Step 6: Setup SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Certbot will automatically update your Nginx configuration
```

## Step 7: Start Applications with PM2

### Option 1: Using the deployment script (Recommended)

```bash
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Manual PM2 setup

```bash
# Start both applications
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions provided by PM2
```

## Step 8: Verify Deployment

1. **Check PM2 status:**
   ```bash
   pm2 status
   pm2 logs
   ```

2. **Check Nginx status:**
   ```bash
   sudo systemctl status nginx
   ```

3. **Test endpoints:**
   - Visit `https://your-domain.com` - Should show Remix app
   - Visit `https://your-domain.com/api/health` - Should show API response
   - Visit `https://your-domain.com/graphql` - Should show GraphQL endpoint

## File-Based Routing in Node.js API

Your Node.js server uses file-based routing. The routes are automatically loaded from:
- `app/modules/*/routes/*.ts` - Module routes
- `app/routes/*.ts` - Root routes

All routes will be accessible via:
- `https://your-domain.com/api/<route-path>`

## PM2 Management Commands

```bash
# View logs
pm2 logs                    # All apps
pm2 logs kore-api          # API server only
pm2 logs kore-remix        # Remix app only

# Monitor processes
pm2 monit

# Restart applications
pm2 restart all            # Restart all
pm2 restart kore-api       # Restart API only
pm2 restart kore-remix     # Restart Remix only

# Stop applications
pm2 stop all
pm2 stop kore-api

# Delete applications
pm2 delete all
pm2 delete kore-api

# Reload applications (zero-downtime)
pm2 reload all
```

## Updating the Application

When you push new code to the server:

```bash
# Pull latest code
git pull origin main  # or your branch name

# Rebuild and redeploy
./deploy.sh
```

Or manually:

```bash
# Build
./build-production.sh

# Restart PM2
pm2 restart all
```

## Troubleshooting

### PM2 processes not starting

1. Check logs:
   ```bash
   pm2 logs
   ```

2. Check if ports are in use:
   ```bash
   sudo netstat -tulpn | grep -E ':(3000|3554)'
   ```

3. Verify environment variables are set correctly

### Nginx 502 Bad Gateway

1. Check if PM2 processes are running:
   ```bash
   pm2 status
   ```

2. Check if ports are listening:
   ```bash
   sudo netstat -tulpn | grep -E ':(3000|3554)'
   ```

3. Check Nginx error logs:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

### Remix app not loading

1. Verify Remix build exists:
   ```bash
   ls -la dashboard/build/
   ```

2. Check Remix logs:
   ```bash
   pm2 logs kore-remix
   ```

3. Verify PORT environment variable is set to 3000

### API routes not working

1. Check API server logs:
   ```bash
   pm2 logs kore-api
   ```

2. Verify PORT environment variable is set to 3554

3. Test API directly:
   ```bash
   curl http://localhost:3554/api/health
   ```

## Directory Structure

```
Kore/
├── app/                          # Node.js API Server
│   ├── dist/                     # Built files (PM2 runs from here)
│   │   └── index.js
│   ├── .env                      # Production environment variables
│   └── ...
├── dashboard/                    # Remix App
│   ├── build/                    # Built files
│   │   ├── server/
│   │   └── client/
│   ├── .env                      # Production environment variables
│   └── ...
├── logs/                         # PM2 logs
│   ├── api-error.log
│   ├── api-out.log
│   ├── remix-error.log
│   └── remix-out.log
├── ecosystem.config.js           # PM2 configuration
├── nginx.conf                    # Nginx configuration
├── build-production.sh           # Build script
├── deploy.sh                     # Deployment script
└── PRODUCTION_DEPLOYMENT.md      # This file
```

## Security Considerations

1. **Firewall:**
   ```bash
   # Allow only HTTP/HTTPS
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

2. **Environment Variables:**
   - Never commit `.env` files
   - Use strong passwords and API keys
   - Rotate credentials regularly

3. **Nginx Security:**
   - Keep Nginx updated
   - Use SSL/TLS (HTTPS)
   - Configure security headers (already in nginx.conf)

4. **PM2 Security:**
   - Run PM2 as a non-root user when possible
   - Monitor logs for suspicious activity

## Monitoring

### Setup PM2 Monitoring

```bash
# Install PM2 Plus (optional, for advanced monitoring)
pm2 link <secret-key> <public-key>
```

### Setup Log Rotation

PM2 has built-in log rotation. Configure it:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Support

For issues or questions:
1. Check PM2 logs: `pm2 logs`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify environment variables are correct
4. Ensure all dependencies are installed

