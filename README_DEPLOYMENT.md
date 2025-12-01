# Production Deployment Setup - Summary

This production setup allows you to run both your Node.js API server and Remix app on a single domain using PM2 and Nginx.

## What Was Created

### Configuration Files

1. **`ecosystem.config.js`** - PM2 configuration for both applications
   - `kore-api`: Node.js server on port 3554
   - `kore-remix`: Remix app on port 3000

2. **`nginx.conf`** - Nginx reverse proxy configuration
   - Routes `/api/*` and `/graphql` to Node.js server (port 3554)
   - Routes all other traffic to Remix app (port 3000)
   - React Router v7 serves static files directly (no separate nginx config needed)

3. **`build-production.sh`** - Build script for both applications
   - Builds Node.js API to `app/dist/`
   - Builds Remix app to `dashboard/build/`

4. **`deploy.sh`** - Complete deployment script
   - Builds both apps
   - Stops/starts PM2 processes
   - Saves PM2 configuration

### Documentation

1. **`PRODUCTION_DEPLOYMENT.md`** - Complete deployment guide
2. **`QUICK_START.md`** - Quick reference for common tasks
3. **`DEPLOYMENT_CHECKLIST.md`** - Step-by-step checklist
4. **`env.production.template`** - Environment template for Node.js API
5. **`dashboard/env.production.template`** - Environment template for Remix

## Quick Start

1. **On your server, after pushing code:**
   ```bash
   ./deploy.sh
   ```

2. **First time setup:**
   - Copy environment templates to `.env` files
   - Update `nginx.conf` with your domain
   - Configure Nginx and SSL

## Architecture

```
Internet Request
       ↓
   Nginx (Port 80/443)
       ├── /api/* → Node.js API (Port 3554)
       ├── /graphql → Node.js API (Port 3554)
       └── /* → Remix App (Port 3000)
```

## Key Points

- **Node.js API** runs from `app/dist/index.js` via PM2
- **Remix App** runs from `dashboard/build/server/index.js` via PM2
- Both apps run as separate PM2 processes
- Nginx handles routing and SSL
- File-based routing in Node.js API works automatically
- Environment variables loaded from `.env` files in respective directories

## File Locations

- **PM2 Config**: `ecosystem.config.js` (root)
- **Nginx Config**: `nginx.conf` (root)
- **Logs**: `logs/` directory (root)
- **Node.js .env**: `app/.env`
- **Remix .env**: `dashboard/.env`

## Commands

```bash
# Build
./build-production.sh

# Deploy
./deploy.sh

# PM2 Management
pm2 start ecosystem.config.js
pm2 status
pm2 logs
pm2 restart all
```

For detailed instructions, see [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

