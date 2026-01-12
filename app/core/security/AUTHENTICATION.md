# HMAC-SHA256 Authentication System

This document describes the strong cryptographic authentication system implemented for protecting API endpoints.

## Overview

The authentication system uses **HMAC-SHA256** signatures with timestamp-based nonces to provide:
- **Strong cryptographic security** - Uses industry-standard HMAC-SHA256
- **Replay attack prevention** - Timestamp validation with 5-minute window
- **Request tampering prevention** - Request body is hashed and included in signature
- **Timing attack resistance** - Uses constant-time comparison for signature validation
- **Selective protection** - Can be applied to specific routes, leaving public endpoints unprotected

## Security Features

### 1. HMAC-SHA256 Signing
- Uses SHA-256 hash function (considered secure and resistant to known attacks)
- HMAC (Hash-based Message Authentication Code) prevents signature forgery
- Base64 encoding for safe transmission

### 2. Timestamp-Based Nonce
- Each request includes a Unix timestamp (milliseconds)
- Server validates timestamp is within 5 minutes of current time
- Prevents replay attacks by rejecting old requests
- Prevents clock skew attacks by rejecting future-dated requests

### 3. Random Nonce
- Each request includes a cryptographically secure random nonce
- Prevents signature reuse even if timestamp is identical
- Minimum 16 bytes (128 bits) of entropy

### 4. Request Body Hashing
- Request body is hashed using SHA-256
- Hash is included in signature calculation
- Prevents tampering with request payload
- Empty string for GET requests (no body)

### 5. Query String Normalization
- Query parameters are sorted alphabetically
- Ensures deterministic signature calculation
- Prevents parameter reordering attacks

### 6. Constant-Time Comparison
- Uses `crypto.timingSafeEqual()` for signature comparison
- Prevents timing attacks that could reveal signature bits
- Industry-standard security practice

## Setup

### 1. Environment Variables

Add your API keys to your environment file (`.env.development`, `.env.production`, etc.):

```bash
# Primary API key
API_KEY=your-api-key-here
API_SECRET=your-very-long-secret-key-minimum-32-characters-recommended

# Optional: Additional API keys
API_KEY_1=key1:secret1
API_KEY_2=key2:secret2
```

**Security Recommendations:**
- Use long, random secrets (minimum 32 characters, 64+ recommended)
- Generate secrets using: `openssl rand -base64 32`
- Never commit secrets to version control
- Rotate secrets periodically
- Use different keys for different environments

### 2. Apply Middleware to Routes

```typescript
import { authenticate } from '@core/security/auth.middleware';

// Protect a route
export const middleware = [
  authenticate(), // Add authentication
  // ... other middleware
];

export const POST = handler(async (req: HttpRequest) => {
  // This endpoint is now protected
  // req.authenticatedApiKey contains the API key used
  return { success: true };
});
```

### 3. Skip Authentication for Public Endpoints

Storefront endpoints remain public (no authentication required):

```typescript
// app/modules/storefront/routes/products.ts
export const middleware = [
  validateShopDomain(),
  rateLimit({ /* ... */ }),
  // No authenticate() middleware - endpoint remains public
];
```

## Client Implementation

### JavaScript/TypeScript Example

```typescript
import crypto from 'crypto';

interface AuthConfig {
  apiKey: string;
  apiSecret: string;
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

function hashBody(body: any): string {
  if (!body) return '';
  
  const bodyStr = typeof body === 'string' 
    ? body 
    : JSON.stringify(body, Object.keys(body).sort());
  
  const hash = crypto.createHash('sha256');
  hash.update(bodyStr, 'utf8');
  return hash.digest('base64');
}

function buildQueryString(query: Record<string, any>): string {
  if (!query || Object.keys(query).length === 0) return '';
  
  const sortedKeys = Object.keys(query).sort();
  return sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join('&');
}

function generateSignature(
  secret: string,
  method: string,
  path: string,
  queryString: string,
  bodyHash: string,
  timestamp: number,
  nonce: string
): string {
  const payload = [
    method.toUpperCase(),
    path,
    queryString || '',
    bodyHash || '',
    timestamp.toString(),
    nonce,
  ].join('\n');

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('base64');
}

async function makeAuthenticatedRequest(
  config: AuthConfig,
  method: string,
  url: string,
  body?: any
): Promise<Response> {
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const query: Record<string, any> = {};
  
  urlObj.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  
  const queryString = buildQueryString(query);
  const timestamp = Date.now();
  const nonce = generateNonce();
  const bodyHash = hashBody(body);
  
  const signature = generateSignature(
    config.apiSecret,
    method,
    path,
    queryString,
    bodyHash,
    timestamp,
    nonce
  );
  
  const authHeader = `HMAC-SHA256 apiKey=${config.apiKey},timestamp=${timestamp},nonce=${nonce},signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
  };
  
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  
  return fetch(url, options);
}

// Usage
const config = {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
};

// GET request
const response1 = await makeAuthenticatedRequest(
  config,
  'GET',
  'https://api.example.com/admin/reindex?shop=shop.myshopify.com'
);

// POST request
const response2 = await makeAuthenticatedRequest(
  config,
  'POST',
  'https://api.example.com/app/events',
  { event: 'APP_INSTALLED', shop: 'shop.myshopify.com' }
);
```

### Python Example

```python
import hmac
import hashlib
import base64
import json
import time
import secrets
import urllib.parse
from typing import Dict, Any, Optional

class AuthenticatedClient:
    def __init__(self, api_key: str, api_secret: str, base_url: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url
    
    def _generate_nonce(self) -> str:
        """Generate a cryptographically secure random nonce"""
        return base64.b64encode(secrets.token_bytes(16)).decode('utf-8')
    
    def _hash_body(self, body: Optional[Any]) -> str:
        """Hash request body using SHA-256"""
        if not body:
            return ''
        
        if isinstance(body, str):
            body_str = body
        elif isinstance(body, dict):
            body_str = json.dumps(body, sort_keys=True)
        else:
            body_str = str(body)
        
        hash_obj = hashlib.sha256(body_str.encode('utf-8'))
        return base64.b64encode(hash_obj.digest()).decode('utf-8')
    
    def _build_query_string(self, query: Dict[str, Any]) -> str:
        """Build sorted query string"""
        if not query:
            return ''
        
        sorted_items = sorted(query.items())
        pairs = [f"{urllib.parse.quote(k)}={urllib.parse.quote(str(v))}" 
                 for k, v in sorted_items]
        return '&'.join(pairs)
    
    def _generate_signature(
        self,
        method: str,
        path: str,
        query_string: str,
        body_hash: str,
        timestamp: int,
        nonce: str
    ) -> str:
        """Generate HMAC-SHA256 signature"""
        payload = '\n'.join([
            method.upper(),
            path,
            query_string or '',
            body_hash or '',
            str(timestamp),
            nonce,
        ])
        
        hmac_obj = hmac.new(
            self.api_secret.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        )
        return base64.b64encode(hmac_obj.digest()).decode('utf-8')
    
    def request(
        self,
        method: str,
        path: str,
        body: Optional[Any] = None,
        query: Optional[Dict[str, Any]] = None
    ) -> Any:
        """Make an authenticated request"""
        import requests
        
        query = query or {}
        query_string = self._build_query_string(query)
        timestamp = int(time.time() * 1000)  # milliseconds
        nonce = self._generate_nonce()
        body_hash = self._hash_body(body)
        
        signature = self._generate_signature(
            method,
            path,
            query_string,
            body_hash,
            timestamp,
            nonce
        )
        
        auth_header = (
            f"HMAC-SHA256 apiKey={self.api_key},"
            f"timestamp={timestamp},"
            f"nonce={nonce},"
            f"signature={signature}"
        )
        
        url = f"{self.base_url}{path}"
        if query_string:
            url += f"?{query_string}"
        
        headers = {
            'Authorization': auth_header,
            'Content-Type': 'application/json',
        }
        
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=body if body else None
        )
        
        return response

# Usage
client = AuthenticatedClient(
    api_key='your-api-key',
    api_secret='your-api-secret',
    base_url='https://api.example.com'
)

# GET request
response = client.request('GET', '/admin/reindex', query={'shop': 'shop.myshopify.com'})

# POST request
response = client.request('POST', '/app/events', body={
    'event': 'APP_INSTALLED',
    'shop': 'shop.myshopify.com'
})
```

## Security Considerations

### Known Attack Vectors and Mitigations

1. **Replay Attacks**
   - **Mitigation**: Timestamp validation (5-minute window)
   - **Mitigation**: Random nonce prevents signature reuse

2. **Timing Attacks**
   - **Mitigation**: Constant-time signature comparison using `crypto.timingSafeEqual()`

3. **Request Tampering**
   - **Mitigation**: Request body is hashed and included in signature
   - **Mitigation**: Query parameters are sorted for deterministic ordering

4. **Signature Forgery**
   - **Mitigation**: HMAC requires knowledge of secret key
   - **Mitigation**: SHA-256 is cryptographically secure

5. **Man-in-the-Middle Attacks**
   - **Mitigation**: Use HTTPS/TLS in production
   - **Mitigation**: Never transmit secrets in requests

6. **Key Compromise**
   - **Mitigation**: Rotate keys periodically
   - **Mitigation**: Use different keys for different environments
   - **Mitigation**: Monitor for suspicious activity

### Best Practices

1. **Secret Management**
   - Use environment variables (never hardcode)
   - Use a secrets management service in production (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Rotate secrets regularly
   - Use different keys per environment

2. **Key Length**
   - Minimum 32 characters
   - Recommended 64+ characters
   - Generate using cryptographically secure random: `openssl rand -base64 32`

3. **HTTPS/TLS**
   - Always use HTTPS in production
   - Never send authenticated requests over HTTP

4. **Error Handling**
   - Don't reveal which part of authentication failed
   - Log security events for monitoring
   - Rate limit authentication attempts

5. **Monitoring**
   - Log all authentication attempts (success and failure)
   - Monitor for suspicious patterns
   - Alert on repeated authentication failures

## Testing

### Generate Test Credentials

```bash
# Generate a secure API secret
openssl rand -base64 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Test Authentication

```bash
# Test with curl (requires building the auth header manually)
# For production, use the client libraries shown above
```

## Troubleshooting

### Common Issues

1. **"Invalid signature" error**
   - Check that query parameters are sorted
   - Verify body hash matches (for POST/PUT requests)
   - Ensure timestamp is current (within 5 minutes)
   - Verify API secret matches

2. **"Timestamp validation failed" error**
   - Check server and client clocks are synchronized
   - Ensure timestamp is in milliseconds (not seconds)
   - Verify timestamp is within 5-minute window

3. **"Missing authorization header" error**
   - Verify Authorization header is included
   - Check header format matches expected format
   - Ensure header value is not empty

## Migration Guide

To migrate existing endpoints to use authentication:

1. Add API keys to environment variables
2. Import `authenticate` middleware
3. Add to route's middleware array
4. Update clients to include authentication headers
5. Test thoroughly
6. Monitor for authentication errors

Public endpoints (like `/storefront/*`) should NOT include the authentication middleware.

