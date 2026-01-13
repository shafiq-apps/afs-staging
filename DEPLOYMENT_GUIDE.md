# Production Deployment Guide

This guide provides step-by-step instructions for deploying the complete project to a new server.

## Prerequisites

- A fresh server running Ubuntu 20.04 LTS or later (or similar Debian-based distribution)
- Root or sudo access to the server
- A domain name pointing to your server's IP address
- SSH access to the server

## Table of Contents

1. [Initial Server Setup](#1-initial-server-setup)
2. [Install Required Software](#2-install-required-software)
3. [Setup Elasticsearch](#3-setup-elasticsearch)
4. [Configure Firewall](#4-configure-firewall)
5. [Setup Application User](#5-setup-application-user)
6. [Clone and Configure Project](#6-clone-and-configure-project)
7. [Configure Environment Variables](#7-configure-environment-variables)
8. [Build Applications](#8-build-applications)
9. [Setup Nginx](#9-setup-nginx)
10. [Setup SSL Certificate](#10-setup-ssl-certificate)
11. [Configure PM2](#11-configure-pm2)
12. [Start Services](#12-start-services)
13. [Post-Deployment Verification](#13-post-deployment-verification)
14. [Maintenance and Updates](#14-maintenance-and-updates)

---

## 1. Initial Server Setup

### Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### Install Essential Tools

```bash
sudo apt install -y curl wget git build-essential software-properties-common
```

---

## 2. Install Required Software

### Install Node.js (v20.x or later)

```bash
# Install Node.js using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### Install PM2 Globally

```bash
sudo npm install -g pm2

# Setup PM2 to start on system boot
pm2 startup systemd
# Follow the instructions provided by the command above
```

### Install Nginx

```bash
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## 3. Setup Elasticsearch

### Install Java (Required for Elasticsearch)

```bash
sudo apt install -y openjdk-17-jdk

# Verify installation
java -version
```

### Install Elasticsearch

```bash
# Add Elasticsearch repository
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -
echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee /etc/apt/sources.list.d/elastic-8.x.list

# Update and install
sudo apt update
sudo apt install -y elasticsearch
```

### Configure Elasticsearch

```bash
# Edit Elasticsearch configuration
sudo nano /etc/elasticsearch/elasticsearch.yml
```

Add or modify the following settings:

```yaml
network.host: 0.0.0.0
http.port: 9200
discovery.type: single-node
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
```

### Setup Elasticsearch Security

```bash
# Generate passwords for built-in users
sudo /usr/share/elasticsearch/bin/elasticsearch-setup-passwords interactive
```

**Important:** Save the generated passwords securely. You'll need the `elastic` user password for your application.

### Start Elasticsearch

```bash
# Start and enable Elasticsearch
sudo systemctl start elasticsearch
sudo systemctl enable elasticsearch

# Verify Elasticsearch is running
curl -X GET "localhost:9200" -u elastic:YOUR_PASSWORD
```

---

## 4. Configure Firewall

```bash
# Install UFW if not already installed
sudo apt install -y ufw

# Allow SSH (important - do this first!)
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'

# Allow Elasticsearch (only if needed from external sources)
# sudo ufw allow 9200/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## 5. Setup Application User

```bash
# Create a dedicated user for the application
sudo adduser --disabled-password --gecos "" appuser

# Add user to sudo group (optional, for convenience)
sudo usermod -aG sudo appuser

# Switch to the application user
sudo su - appuser
```

---

## 6. Clone and Configure Project

### Clone Repository

```bash
# Navigate to home directory
cd ~

# Clone your repository (replace with your actual repository URL)
git clone git@github.com:shafiq-apps/afs-staging.git afsv2

# Navigate to project directory
cd afsv2
```

### Install Root Dependencies

```bash
npm install
```

---

## 7. Configure Environment Variables

### Backend API Environment Variables

Create the environment file for the backend:

```bash
cd ~/afsv2/app
nano .env
```

Add the following configuration (adjust values according to your setup):

```env
# Server Configuration
NODE_ENV=production
PORT=3555

# Elasticsearch Configuration
ELASTICSEARCH_HOST=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=YOUR_ELASTICSEARCH_PASSWORD
ELASTICSEARCH_REJECT_UNAUTHORIZED=true
ELASTICSEARCH_PING_TIMEOUT=5000
ELASTICSEARCH_REQUEST_TIMEOUT=30000
ELASTICSEARCH_MAX_RETRIES=3

# Shopify Configuration
SHOPIFY_API_VERSION=2024-01
SHOPIFY_API_MAX_RETRIES=10
SHOPIFY_API_BACKOFF_MS=500
SHOPIFY_API_MAX_WAIT_MS=10000

# Indexing Configuration
INDEXER_BATCH_SIZE=2000
INDEXER_MAX_CONCURRENT_BATCHES=3
INDEXER_CHECKPOINT_DEBOUNCE_MS=2000

# Logging
LOG_LEVEL=info
DEBUG=false
```

### Dashboard Environment Variables

Create the environment file for the dashboard:

```bash
cd ~/afsv2/dashboard
nano .env
```

Add the following configuration:

```env
NODE_ENV=production
PORT=3556

# Shopify App Configuration
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
SCOPES=read_locales,read_online_store_pages,read_products,read_themes,write_online_store_pages,write_products
SHOPIFY_APP_URL=https://your-domain.com
SHOPIFY_APP_HANDLE=your-app-handle

# GraphQL Endpoint
GRAPHQL_ENDPOINT=https://your-domain.com/graphql
```

**Important:** Replace all placeholder values with your actual credentials and domain.

---

## 8. Build Applications

### Build Backend API

```bash
cd ~/afsv2/app

# Install dependencies
npm install

# Build the application
npm run build
```

### Build Dashboard

```bash
cd ~/afsv2/dashboard

# Install dependencies
npm install

# Build the application
npm run build
```

### Alternative: Use Build Script

You can also use the provided build script:

```bash
cd ~/afsv2
bash build-production.sh
```

---

## 9. Setup Nginx

### Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/afsv2
```

Copy the contents of your `nginx.conf` file and modify the `server_name` to match your domain:

```nginx
# Upstream definitions
upstream api_server {
    server localhost:3555;
    keepalive 64;
}

upstream remix_app {
    server localhost:3556;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;  # Replace with your actual domain

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # Client body size limit
    client_max_body_size 10M;

    # API routes - proxy to Node.js server
    location /api/ {
        proxy_pass http://api_server/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # GraphQL endpoint - proxy to Node.js server
    location /graphql {
        proxy_pass http://api_server/graphql;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # All other routes - proxy to dashboard app
    location / {
        proxy_pass http://remix_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

### Enable Site and Test Configuration

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/afsv2 /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

---

## 10. Setup SSL Certificate

### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain SSL Certificate

```bash
sudo certbot --nginx -d your-domain.com
```

Follow the prompts to:
- Enter your email address
- Agree to terms of service
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

### Auto-Renewal Setup

Certbot automatically sets up a cron job for renewal. Verify it:

```bash
sudo certbot renew --dry-run
```

---

## 11. Configure PM2

### Update PM2 Ecosystem Configuration

Edit the `ecosystem.config.js` file in the project root:

```bash
cd ~/afsv2
nano ecosystem.config.js
```

Ensure the configuration points to the correct paths and uses the correct environment variables. The file should already be configured, but verify:

- `server` app points to `app/dist/index.js`
- `dashboard` app points to `dashboard/build/server/index.js`
- Environment variables are correctly set
- Log file paths are correct

### Create Logs Directory

```bash
cd ~/afsv2
mkdir -p logs
```

---

## 12. Start Services

### Start Applications with PM2

```bash
cd ~/afsv2

# Start both applications
pm2 start ecosystem.config.js

# Save PM2 configuration for auto-start on reboot
pm2 save

# Check status
pm2 status

# View logs
pm2 logs
```

### Verify Services are Running

```bash
# Check if backend API is responding
curl http://localhost:3555/health

# Check if dashboard is responding
curl http://localhost:3556

# Check PM2 processes
pm2 list
```

---

## 13. Post-Deployment Verification

### Test Application Endpoints

1. **Health Check:**
   ```bash
   curl https://your-domain.com/health
   ```

2. **GraphQL Endpoint:**
   ```bash
   curl -X POST https://your-domain.com/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"{ __typename }"}'
   ```

3. **Dashboard:**
   - Open `https://your-domain.com` in your browser
   - Verify the dashboard loads correctly

### Check Logs

```bash
# PM2 logs
pm2 logs

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Elasticsearch logs
sudo tail -f /var/log/elasticsearch/elasticsearch.log
```

### Monitor System Resources

```bash
# PM2 monitoring
pm2 monit

# System resources
htop
# or
top
```

---

## 14. Maintenance and Updates

### Update Application Code

```bash
cd ~/afsv2

# Pull latest changes
git pull

# Install/update dependencies
npm install
cd app && npm install && cd ..
cd dashboard && npm install && cd ..

# Rebuild applications
bash build-production.sh

# Restart PM2 processes
pm2 restart ecosystem.config.js

# Or use the deployment script
bash deploy.sh
```

### PM2 Management Commands

```bash
# View status
pm2 status

# View logs
pm2 logs
pm2 logs server      # Backend logs only
pm2 logs dashboard   # Dashboard logs only

# Restart applications
pm2 restart all
pm2 restart server
pm2 restart dashboard

# Stop applications
pm2 stop all

# Delete applications
pm2 delete all

# Monitor resources
pm2 monit
```

### Backup Important Data

#### Backup Elasticsearch

```bash
# Create backup directory
sudo mkdir -p /backup/elasticsearch

# Backup Elasticsearch indices (example)
curl -X PUT "localhost:9200/_snapshot/backup_repo" -H 'Content-Type: application/json' -d'
{
  "type": "fs",
  "settings": {
    "location": "/backup/elasticsearch"
  }
}'
```

#### Backup Environment Files

```bash
# Backup environment files
tar -czf ~/backup-env-$(date +%Y%m%d).tar.gz \
  ~/afsv2/app/.env \
  ~/afsv2/dashboard/.env
```

### Monitor Disk Space

```bash
# Check disk usage
df -h

# Check directory sizes
du -sh ~/afsv2/*
```

### Set Up Log Rotation

PM2 handles log rotation automatically, but you can configure it:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Troubleshooting

### Application Not Starting

1. **Check PM2 logs:**
   ```bash
   pm2 logs
   ```

2. **Check if ports are in use:**
   ```bash
   sudo netstat -tulpn | grep -E '3555|3556'
   ```

3. **Verify environment variables:**
   ```bash
   cat ~/afsv2/app/.env
   cat ~/afsv2/dashboard/.env
   ```

### Nginx Issues

1. **Test configuration:**
   ```bash
   sudo nginx -t
   ```

2. **Check error logs:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Reload Nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

### Elasticsearch Issues

1. **Check status:**
   ```bash
   sudo systemctl status elasticsearch
   ```

2. **Check logs:**
   ```bash
   sudo tail -f /var/log/elasticsearch/elasticsearch.log
   ```

3. **Test connection:**
   ```bash
   curl -X GET "localhost:9200" -u elastic:YOUR_PASSWORD
   ```

### SSL Certificate Issues

1. **Check certificate status:**
   ```bash
   sudo certbot certificates
   ```

2. **Renew certificate:**
   ```bash
   sudo certbot renew
   ```

---

## Security Recommendations

1. **Keep system updated:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Use strong passwords** for all services

3. **Restrict SSH access** (consider key-based authentication only)

4. **Regular backups** of environment files and Elasticsearch data

5. **Monitor logs** regularly for suspicious activity

6. **Keep Node.js and dependencies updated**

7. **Use firewall** to restrict unnecessary ports

8. **Regular security audits** of your application

---

## Additional Resources

- PM2 Documentation: https://pm2.keymetrics.io/
- Nginx Documentation: https://nginx.org/en/docs/
- Elasticsearch Documentation: https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
- Let's Encrypt Documentation: https://letsencrypt.org/docs/

---

## Support

For issues or questions, refer to:
- Project documentation in `docs/` directory
- Application-specific README files
- Environment setup guide: `app/ENV_SETUP.md`

---

**Note:** This guide assumes a fresh Ubuntu server. Adjust commands as needed for other Linux distributions.

