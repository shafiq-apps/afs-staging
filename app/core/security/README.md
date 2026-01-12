# Security Module

This module provides comprehensive security middleware and utilities for the application.

## Features

- **HMAC-SHA256 Authentication** - Strong cryptographic request authentication
- **Rate Limiting** - Protection against DoS and brute force attacks
- **CSRF Protection** - Cross-site request forgery prevention
- **Security Headers** - Standard security HTTP headers
- **Request Size Limits** - Protection against large payload attacks

## Authentication System

The authentication system uses HMAC-SHA256 signatures with timestamp-based nonces to provide enterprise-grade security.

### Quick Start

1. **Set up API keys** in your environment:
   ```bash
   API_KEY=your-api-key
   API_SECRET=your-very-long-secret-key
   ```

2. **Protect a route**:
   ```typescript
   import { authenticate } from '@core/security/auth.middleware';
   
   export const middleware = [
     authenticate(),
     // ... other middleware
   ];
   ```

3. **Keep public routes unprotected** (like storefront endpoints):
   ```typescript
   // No authenticate() middleware = public endpoint
   export const middleware = [
     validateShopDomain(),
     rateLimit({ /* ... */ }),
   ];
   ```

### Documentation

- **[AUTH_QUICK_START.md](./AUTH_QUICK_START.md)** - Quick start guide
- **[AUTHENTICATION.md](./AUTHENTICATION.md)** - Complete authentication documentation
- **[auth-client.example.ts](./auth-client.example.ts)** - Client implementation examples
- **[EXAMPLE_PROTECTED_ROUTE.ts](./EXAMPLE_PROTECTED_ROUTE.ts)** - Route protection examples

## Security Features

### HMAC-SHA256 Authentication

- **Algorithm**: HMAC-SHA256 (industry-standard, cryptographically secure)
- **Replay Attack Prevention**: Timestamp validation (5-minute window)
- **Tampering Prevention**: Request body hashing
- **Timing Attack Resistance**: Constant-time signature comparison
- **Nonce**: Cryptographically secure random nonce per request

### Rate Limiting

Protects against:
- DoS attacks
- Brute force attacks
- API abuse

### CSRF Protection

Prevents cross-site request forgery attacks using token-based validation.

### Security Headers

Automatically sets security headers:
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security
- And more...

## Files

- `auth.middleware.ts` - Main authentication middleware
- `auth.helper.ts` - Authentication utility functions
- `api-keys.helper.ts` - API key management
- `rate-limit.middleware.ts` - Rate limiting middleware
- `csrf.middleware.ts` - CSRF protection middleware
- `security-headers.middleware.ts` - Security headers middleware
- `request-size.middleware.ts` - Request size limiting
- `default-security.middleware.ts` - Combined security middleware stack

## Usage Examples

### Protect an Admin Route

```typescript
import { authenticate } from '@core/security/auth.middleware';

export const middleware = [
  authenticate(),
  validateShopDomain(),
  rateLimit({ max: 10, windowMs: 60000 }),
];

export const POST = handler(async (req: HttpRequest) => {
  // Only authenticated requests reach here
  const apiKey = (req as any).authenticatedApiKey;
  // ... your logic
});
```

### Public Storefront Route

```typescript
// No authenticate() middleware = public
export const middleware = [
  validateShopDomain(),
  rateLimit({ max: 100, windowMs: 60000 }),
];

export const GET = handler(async (req: HttpRequest) => {
  // Public endpoint - no authentication required
  // ... your logic
});
```

## Security Best Practices

1. **Use HTTPS** - Always use TLS/SSL in production
2. **Long Secrets** - Use secrets with 32+ characters (64+ recommended)
3. **Rotate Keys** - Periodically rotate API keys
4. **Environment Separation** - Use different keys for dev/staging/production
5. **Monitor** - Log and monitor authentication attempts
6. **Rate Limit** - Always combine authentication with rate limiting

## Testing

Generate test credentials:
```bash
openssl rand -base64 32
```

See [AUTHENTICATION.md](./AUTHENTICATION.md) for complete testing instructions.

