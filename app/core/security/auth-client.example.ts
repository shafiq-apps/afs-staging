/**
 * Authentication Client Example
 * This file demonstrates how to make authenticated requests from a client
 * Copy and adapt this code for your client application
 */

import crypto from 'crypto';

/**
 * Configuration for authenticated requests
 */
export interface AuthConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

/**
 * Generate a cryptographically secure random nonce
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Hash request body using SHA-256
 */
export function hashBody(body: any): string {
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
 * Build query string from query parameters (sorted)
 */
export function buildQueryString(query: Record<string, any>): string {
  if (!query || Object.keys(query).length === 0) {
    return '';
  }
  
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

/**
 * Generate HMAC-SHA256 signature for a request
 */
export function generateSignature(
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
 * Make an authenticated HTTP request
 */
export async function makeAuthenticatedRequest(
  config: AuthConfig,
  method: string,
  path: string,
  options: {
    body?: any;
    query?: Record<string, any>;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const { body, query = {}, headers = {} } = options;
  
  // Build query string
  const queryString = buildQueryString(query);
  
  // Generate authentication components
  const timestamp = Date.now();
  const nonce = generateNonce();
  const bodyHash = hashBody(body);
  
  // Generate signature
  const signature = generateSignature(
    config.apiSecret,
    method,
    path,
    queryString,
    bodyHash,
    timestamp,
    nonce
  );
  
  // Build authorization header
  const authHeader = `HMAC-SHA256 apiKey=${config.apiKey},timestamp=${timestamp},nonce=${nonce},signature=${signature}`;
  
  // Build full URL
  let url = `${config.baseUrl}${path}`;
  if (queryString) {
    url += `?${queryString}`;
  }
  
  // Prepare request
  const requestHeaders: Record<string, string> = {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
    ...headers,
  };
  
  const requestOptions: RequestInit = {
    method,
    headers: requestHeaders,
  };
  
  if (body && method !== 'GET' && method !== 'HEAD') {
    requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  
  // Make request
  return fetch(url, requestOptions);
}

/**
 * Example usage
 */
export async function exampleUsage() {
  const config: AuthConfig = {
    apiKey: process.env.API_KEY || 'your-api-key',
    apiSecret: process.env.API_SECRET || 'your-api-secret',
    baseUrl: 'https://api.example.com',
  };
  
  // Example 1: GET request with query parameters
  const getResponse = await makeAuthenticatedRequest(
    config,
    'GET',
    '/admin/reindex',
    {
      query: {
        shop: 'shop.myshopify.com',
      },
    }
  );
  
  const getData = await getResponse.json();
  console.log('GET response:', getData);
  
  // Example 2: POST request with body
  const postResponse = await makeAuthenticatedRequest(
    config,
    'POST',
    '/app/events',
    {
      body: {
        event: 'APP_INSTALLED',
        shop: 'shop.myshopify.com',
        accessToken: 'token-here',
      },
    }
  );
  
  const postData = await postResponse.json();
  console.log('POST response:', postData);
}

