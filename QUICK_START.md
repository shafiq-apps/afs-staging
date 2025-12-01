# Quick Start Guide - Production Deployment

## One-Command Deployment

After pushing code to your server:

```bash
./deploy.sh
```

This will:
1. Build both applications
2. Stop existing PM2 processes
3. Start new PM2 processes
4. Save PM2 configuration

## Manual Start (if needed)

```bash
# From the root directory
pm2 start ecosystem.config.js
```

## First Time Setup

1. **Copy environment templates:**
   ```bash
   cp env.production.template app/.env
   cp dashboardp/env.production.template dashboard/.env
   ```
   
   **Note:** The Node.js API server's `.env` file should be in `app/.env` (PM2 runs from `app/` directory).

2. **Edit environment files:**
   ```bash
   nano app/.env
   nano dashboard/.env
   ```

3. **Build and deploy:**
   ```bash
   ./deploy.sh
   ```

4. **Setup Nginx:**
   ```bash
   # Edit nginx.conf with your domain
   nano nginx.conf
   
   # Copy to Nginx
   sudo cp nginx.conf /etc/nginx/sites-available/kore
   sudo ln -s /etc/nginx/sites-available/kore /etc/nginx/sites-enabled/
   
   # Test and restart
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## Important Notes

- **Node.js API** runs on port **3554** (configured in PM2)
- **Remix App** runs on port **3000** (configured in PM2)
- **Nginx** routes:
  - `/api/*` → Port 3554
  - `/graphql` → Port 3554
  - `/*` → Port 3000

## PM2 Commands

```bash
pm2 status              # Check status
pm2 logs                # View logs
pm2 restart all         # Restart both apps
pm2 stop all           # Stop both apps
```

## File Structure

```
Kore/
├── app/
│   └── dist/index.js   ← PM2 runs this
├── dashboard/
│   └── build/server/index.js  ← PM2 runs this
├── ecosystem.config.js  ← PM2 config
└── logs/                ← PM2 logs
```

For detailed instructions, see [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

