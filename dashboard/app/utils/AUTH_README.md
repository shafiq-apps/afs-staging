# Authentication in Remix App

This document explains how authentication works in the Remix app for making authenticated requests to the backend API.

## Overview

The Remix app automatically adds HMAC-SHA256 authentication headers to API requests when:
1. API credentials are configured in environment variables
2. The endpoint requires authentication (admin/indexing endpoints)

If authentication is not configured, the app continues to work normally without authentication (backward compatible).

## Setup

### 1. Add API Credentials to Environment

Add these to your `.env` file (or `.env.production`, `.env.development`, etc.):

```bash
API_KEY=your-api-key-here
API_SECRET=your-very-long-secret-key-minimum-32-characters-recommended
```

**Note:** If these are not set, the app will work without authentication (backward compatible).

### 2. Generate Secure Secret

Generate a secure secret:
```bash
openssl rand -base64 32
```

## How It Works

### Automatic Authentication

The authentication system is integrated into:
- `graphql.server.ts` - All GraphQL requests
- `app.api.graphql.tsx` - GraphQL API route

When making requests, the system:
1. Checks if API credentials are configured
2. Determines if the endpoint requires authentication
3. Automatically adds authentication headers if needed
4. Falls back to regular requests if authentication is not configured

### Endpoint Protection Rules

- **Protected (uses authentication if configured):**
  - `/graphql` - GraphQL endpoint
  - `/admin/*` - Admin endpoints
  - `/indexing/*` - Indexing endpoints
  - `/app/events` - App events endpoint

- **Public (never uses authentication):**
  - `/storefront/*` - Storefront endpoints (products, filters, search)

### Usage in Code

The authentication is automatic - you don't need to change your code:

```typescript
// This automatically uses authentication if configured
import { graphqlRequest } from "app/graphql.server";

const result = await graphqlRequest(query, { shop });
```

Or in API routes:

```typescript
// app/routes/app.api.graphql.tsx
// Authentication is automatically added if configured
const response = await authenticatedFetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables }),
});
```

## Manual Usage

If you need to make authenticated requests manually:

```typescript
import { authenticatedFetch, shouldAuthenticate } from "app/utils/auth.server";

const url = "https://api.example.com/admin/reindex";

if (shouldAuthenticate(url)) {
  const response = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop: "shop.myshopify.com" }),
  });
} else {
  // Public endpoint - use regular fetch
  const response = await fetch(url, { /* ... */ });
}
```

## Backward Compatibility

The authentication system is **completely optional**:
- If `API_KEY` and `API_SECRET` are not set, the app works without authentication
- Existing code continues to work without changes
- No breaking changes to existing functionality

## Testing

1. **Without Authentication (Default):**
   - Don't set `API_KEY` and `API_SECRET`
   - App works normally
   - Requests are made without authentication headers

2. **With Authentication:**
   - Set `API_KEY` and `API_SECRET` in environment
   - Protected endpoints automatically use authentication
   - Public endpoints remain public

## Troubleshooting

### "Authentication required" errors

- Check that `API_KEY` and `API_SECRET` are set in environment
- Verify the secret matches the backend configuration
- Check that the endpoint requires authentication

### Requests failing

- Ensure backend endpoints are protected with `authenticate()` middleware
- Verify API keys match between Remix app and backend
- Check server logs for authentication errors

## Security Notes

- API secrets are **never exposed to the client** (server-side only)
- Authentication headers are added server-side in Remix routes
- Storefront endpoints remain public (no authentication)
- Use HTTPS in production to protect credentials in transit

