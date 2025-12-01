# Deployment Guide - Fixing Cloudflare Tunnel URL Issue

## Problem
After deploying, the app still uses the old Cloudflare tunnel URL (`douglas-reliable-qualify-butler.trycloudflare.com`) instead of your server domain (`fstaging.digitalcoo.com`).

## Solution Steps

### 1. Push Configuration to Shopify Partners Dashboard

Run this command to sync your `shopify.app.toml` configuration to Shopify:

```bash
shopify app config push
```

This will update the app configuration in your Shopify Partners dashboard with the URLs from `shopify.app.toml`.

### 2. Set Environment Variables on Your Server

On your production server, make sure you have these environment variables set:

```bash
export SHOPIFY_APP_URL=https://fstaging.digitalcoo.com
export SHOPIFY_API_KEY=your-api-key
export SHOPIFY_API_SECRET=your-api-secret
export SCOPES=read_online_store_pages,read_products,read_themes,write_online_store_pages,write_products
export DATABASE_URL=your-database-url
export NODE_ENV=production
```

**Important:** The `SHOPIFY_APP_URL` must match the `application_url` in your `shopify.app.toml` file.

### 3. Update App Configuration in Shopify Partners Dashboard (Manual Check)

1. Go to [Shopify Partners Dashboard](https://partners.shopify.com/)
2. Navigate to your app: **FilterStagingApp**
3. Go to **App setup** → **App URL**
4. Verify it shows: `https://fstaging.digitalcoo.com`
5. If it shows the old Cloudflare URL, update it manually to: `https://fstaging.digitalcoo.com`
6. Go to **App setup** → **Allowed redirection URL(s)**
7. Verify it includes: `https://fstaging.digitalcoo.com/auth/callback`
8. Save changes

### 4. Redeploy Your App

After updating the configuration:

```bash
# From your local machine
shopify app deploy

# Or if you're deploying manually on the server:
npm run build
npm run start
```

### 5. Verify the Fix

1. Check your app in the Shopify Partners dashboard - the App URL should show your domain
2. Test installing the app on a development store
3. The app should now use `https://fstaging.digitalcoo.com` instead of the Cloudflare tunnel

## Troubleshooting

### If the URL still doesn't update:

1. **Clear Shopify CLI cache:**
   ```bash
   shopify app config link --reset
   ```

2. **Re-link your app:**
   ```bash
   shopify app config link
   ```

3. **Force push the config:**
   ```bash
   shopify app config push --force
   ```

### Check Server Environment Variables

On your server, verify the environment variable is set correctly:

```bash
echo $SHOPIFY_APP_URL
# Should output: https://fstaging.digitalcoo.com
```

If using a process manager like PM2, make sure to set environment variables in your ecosystem file or restart the process after setting them.

## Notes

- The `shopify.app.toml` file is the source of truth for your app configuration
- Always ensure `SHOPIFY_APP_URL` on the server matches `application_url` in `shopify.app.toml`
- The redirect URL format should be `/auth/callback` (not `/app/auth/callback`) based on your `authPathPrefix` setting

