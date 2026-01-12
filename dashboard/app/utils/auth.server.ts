/**
 * Server-Side Authentication Utility for Remix
 * Provides HMAC-SHA256 authentication for API requests
 * 
 * This runs on the server side only (never exposed to client)
 */

import crypto from 'crypto';

/**
 * Get API credentials from environment variables
 */
export function getApiCredentials(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.API_KEY;
  const apiSecret = process.env.API_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  return { apiKey, apiSecret };
}

/**
 * Check if authentication is configured
 */
export function isAuthConfigured(): boolean {
  return getApiCredentials() !== null;
}

/**
 * Generate a cryptographically secure random nonce
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Hash request body using SHA-256
 */
function hashBody(body: any): string {
  if (!body) return '';
  
  let bodyStr: string;
  if (typeof body === 'string') {
    bodyStr = body;
  } else if (typeof body === 'object') {
    // Sort keys for deterministic hashing
    bodyStr = JSON.stringify(body, Object.keys(body).sort());
  } else {
    bodyStr = String(body);
  }
  
  if (!bodyStr || bodyStr.length === 0) {
    return '';
  }
  
  const hash = crypto.createHash('sha256');
  hash.update(bodyStr, 'utf8');
  return hash.digest('base64');
}

/**
 * Build query string from URL or query object (sorted)
 */
function buildQueryString(url: string | URL, query?: Record<string, any>): string {
  if (query && Object.keys(query).length > 0) {
    const sortedKeys = Object.keys(query).sort();
    return sortedKeys
      .map(key => {
        const value = query[key];
        if (Array.isArray(value)) {
          return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`).join('&');
        }
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
      })
      .join('&');
  }

  // Extract query string from URL
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    const params = new URLSearchParams(urlObj.search);
    if (params.toString()) {
      // Sort query parameters
      const sorted = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
      return sorted.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    }
  } catch {
    // Invalid URL, return empty
  }

  return '';
}

/**
 * Generate HMAC-SHA256 signature for a request
 */
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

/**
 * Create authentication header for a request
 */
export function createAuthHeader(
  method: string,
  url: string | URL,
  body?: any,
  query?: Record<string, any>
): string | null {
  const credentials = getApiCredentials();
  if (!credentials) {
    return null;
  }

  const { apiKey, apiSecret } = credentials;

  // Parse URL to get path
  let urlObj: URL;
  try {
    urlObj = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }

  const path = urlObj.pathname;
  const queryString = buildQueryString(urlObj, query);
  const timestamp = Date.now();
  const nonce = generateNonce();
  
  // Hash the body
  // If body is a string, parse it first (backend will receive it as parsed object)
  // If body is already an object, hash it directly (with sorted keys)
  let bodyHash: string;
  if (typeof body === 'string') {
    try {
      // Parse the string to match what Express will do
      const parsed = JSON.parse(body);
      bodyHash = hashBody(parsed); // Hash the parsed object (will be sorted)
    } catch {
      // If parsing fails, hash the string as-is (shouldn't happen normally)
      bodyHash = hashBody(body);
    }
  } else {
    // Body is already an object, hash it directly (will be sorted)
    bodyHash = hashBody(body);
  }

  const signature = generateSignature(
    apiSecret,
    method,
    path,
    queryString,
    bodyHash,
    timestamp,
    nonce
  );

  return `HMAC-SHA256 apiKey=${apiKey},timestamp=${timestamp},nonce=${nonce},signature=${signature}`;
}

/**
 * Extended RequestInit with optional bodyForAuth for authentication
 */
interface AuthenticatedFetchOptions extends RequestInit {
  bodyForAuth?: any; // Parsed object for authentication (will be hashed with sorted keys)
}

/**
 * Make an authenticated fetch request
 * Automatically adds authentication headers if credentials are configured
 * Falls back to regular fetch if authentication is not configured
 */
export async function authenticatedFetch(
  url: string | URL,
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  const { method = 'GET', body, bodyForAuth, headers = {}, ...restOptions } = options;

  // Only add authentication if credentials are configured
  if (isAuthConfigured()) {
    // Use bodyForAuth if provided (parsed object), otherwise use body (string)
    // This ensures we hash the same representation that Express will parse
    const authBody = bodyForAuth !== undefined ? bodyForAuth : body;
    const authHeader = createAuthHeader(method, url, authBody);
    
    if (authHeader) {
      // Add authentication header
      const headersWithAuth = new Headers(headers);
      headersWithAuth.set('Authorization', authHeader);
      
      return fetch(url, {
        ...restOptions,
        method,
        body,
        headers: headersWithAuth,
      });
    }
  }

  // Fallback to regular fetch if auth not configured
  return fetch(url, options);
}

/**
 * Helper to determine if an endpoint should use authentication
 * By default, only admin/indexing endpoints need auth
 * Storefront endpoints remain public
 */
export function shouldAuthenticate(url: string | URL): boolean {
  if (!isAuthConfigured()) {
    return false;
  }

  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    const path = urlObj.pathname;

    // Keep storefront endpoints public (always)
    if (path.includes('/storefront/')) {
      return false;
    }

    // Protect admin/indexing endpoints
    if (path.includes('/admin/') || path.includes('/indexing/') || path.includes('/app/events')) {
      return true;
    }

    // Use authentication for GraphQL if configured
    if (path.includes('/graphql') || path.endsWith('/graphql')) {
      return true;
    }

    // Default: don't authenticate (safe fallback - backward compatible)
    return false;
  } catch {
    // If URL parsing fails, don't authenticate (safe fallback)
    return false;
  }
}

