# Authentication Quick Start Guide

This guide will help you quickly set up and use the authentication system.

## Step 1: Set Up API Keys

Add your API keys to your environment file (`.env.development`, `.env.production`, etc.):

```bash
API_KEY=your-api-key-here
API_SECRET=your-very-long-secret-key-minimum-32-characters-recommended
```

Generate a secure secret:
```bash
openssl rand -base64 32
```

## Step 2: Protect a Route

Add the `authenticate()` middleware to any route you want to protect:

```typescript
// app/modules/indexing/routes/reindex.ts
import { authenticate } from '@core/security/auth.middleware';

export const middleware = [
  authenticate(), // Add this line to protect the route
  validateShopDomain(),
  rateLimit({ /* ... */ }),
];
```

## Step 3: Keep Public Routes Unprotected

Storefront endpoints should remain public (no authentication):

```typescript
// app/modules/storefront/routes/products.ts
export const middleware = [
  validateShopDomain(),
  rateLimit({ /* ... */ }),
  // No authenticate() - endpoint remains public
];
```

## Step 4: Make Authenticated Requests

Use the client helper or implement the authentication in your client:

```typescript
import { makeAuthenticatedRequest } from '@core/security/auth-client.example';

const config = {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  baseUrl: 'https://api.example.com',
};

// GET request
const response = await makeAuthenticatedRequest(
  config,
  'GET',
  '/admin/reindex',
  { query: { shop: 'shop.myshopify.com' } }
);
```

## That's It!

Your routes are now protected with strong cryptographic authentication.

For more details, see [AUTHENTICATION.md](./AUTHENTICATION.md).

