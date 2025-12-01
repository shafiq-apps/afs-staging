# Deployment Checklist

Use this checklist when deploying to production for the first time or after major changes.

## Pre-Deployment

- [ ] Server has Node.js >= 20.19 (or >= 22.12) installed
- [ ] PM2 is installed globally (`npm install -g pm2`)
- [ ] Nginx is installed and running
- [ ] Domain DNS is pointing to server IP
- [ ] Firewall allows ports 80, 443 (and optionally 22 for SSH)

## Environment Setup

- [ ] Created `app/.env` from `env.production.template`
- [ ] Created `dashboard/.env` from `dashboard/env.production.template`
- [ ] Set `PORT=3554` in `app/.env`
- [ ] Set `PORT=3000` in `dashboard/.env`
- [ ] Set `NODE_ENV=production` in both `.env` files
- [ ] Configured Elasticsearch connection in `app/.env`
- [ ] Configured Shopify credentials in `dashboard/.env`
- [ ] Configured database URL in `dashboard/.env`
- [ ] Set `API_URL` in `dashboard/.env` (use `http://localhost:3554` for same server)

## Build & Deploy

- [ ] Code is pushed to server (via git pull or deployment method)
- [ ] Dependencies installed: `cd app && npm ci && cd ../dashboard && npm ci`
- [ ] Built applications: `./build-production.sh`
- [ ] Verified `app/dist/index.js` exists
- [ ] Verified `dashboard/build/server/index.js` exists
- [ ] Created `logs/` directory: `mkdir -p logs`

## PM2 Setup

- [ ] Started PM2: `pm2 start ecosystem.config.js`
- [ ] Verified both processes running: `pm2 status`
- [ ] Checked logs for errors: `pm2 logs`
- [ ] Saved PM2 config: `pm2 save`
- [ ] Setup PM2 startup: `pm2 startup` (follow instructions)

## Nginx Configuration

- [ ] Updated `nginx.conf` with your domain name
- [ ] Copied config: `sudo cp nginx.conf /etc/nginx/sites-available/kore`
- [ ] Created symlink: `sudo ln -s /etc/nginx/sites-available/kore /etc/nginx/sites-enabled/`
- [ ] Tested config: `sudo nginx -t`
- [ ] Restarted Nginx: `sudo systemctl restart nginx`

## SSL Certificate

- [ ] Installed Certbot: `sudo apt-get install -y certbot python3-certbot-nginx`
- [ ] Obtained certificate: `sudo certbot --nginx -d your-domain.com -d www.your-domain.com`
- [ ] Verified HTTPS redirect works

## Verification

- [ ] Remix app loads: `https://your-domain.com`
- [ ] API endpoint works: `https://your-domain.com/api/health` (or your health endpoint)
- [ ] GraphQL endpoint accessible: `https://your-domain.com/graphql`
- [ ] PM2 processes stable: `pm2 monit` (watch for a few minutes)
- [ ] No errors in logs: `pm2 logs` and `sudo tail -f /var/log/nginx/error.log`

## Post-Deployment

- [ ] Documented any custom configurations
- [ ] Set up log rotation (PM2 has built-in, but verify)
- [ ] Set up monitoring/alerts (optional)
- [ ] Tested critical user flows
- [ ] Verified file-based routing works for API

## Troubleshooting Commands

```bash
# Check PM2 status
pm2 status
pm2 logs

# Check if ports are listening
sudo netstat -tulpn | grep -E ':(3000|3554)'

# Check Nginx status
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# Test API directly
curl http://localhost:3554/api/health

# Test Remix directly
curl http://localhost:3000

# Restart everything
pm2 restart all
sudo systemctl restart nginx
```

