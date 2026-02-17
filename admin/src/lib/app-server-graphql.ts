/**
 * Server-side GraphQL client for making authenticated requests to app server
 * Uses HMAC-SHA256 authentication matching the Remix app format
 */

import crypto from 'crypto';

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
      [key: string]: any;
    };
  }>;
}

export interface GraphQLRequestOptions {
  shop?: string;
}

/**
 * Generate a cryptographically secure random nonce
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Hash request body using SHA-256 (base64 encoded, matching Remix app)
 */
function hashBody(body: any): string {
  if (!body) return '';
  
  let bodyStr: string;
  if (typeof body === 'string') {
    bodyStr = body;
  } else if (typeof body === 'object') {
    // Sort keys for deterministic hashing (matching Remix app)
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
 * Build query string from query object (sorted, matching Remix app)
 */
function buildQueryString(query?: Record<string, any>): string {
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
 * Generate HMAC-SHA256 signature (matching Remix app format)
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
 * Create authentication header (matching Remix app format)
 */
function createAuthHeader(
  method: string,
  url: string,
  body: any,
  apiKey: string,
  apiSecret: string
): string {
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const queryString = buildQueryString(Object.fromEntries(urlObj.searchParams));
  const timestamp = Date.now();
  const nonce = generateNonce();
  
  // Hash the body (matching Remix app logic)
  let bodyHash: string;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      bodyHash = hashBody(parsed);
    } catch {
      bodyHash = hashBody(body);
    }
  } else {
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
 * Make authenticated GraphQL request to app server
 * The shop parameter (if present in variables) will be added as a query parameter to match Remix app behavior
 */
export async function authenticatedGraphQLRequest<T = any>(
  query: string,
  variables?: Record<string, any>,
  options?: GraphQLRequestOptions
): Promise<GraphQLResponse<T>> {
  const apiKey = process.env.API_KEY;
  const apiSecret = process.env.API_SECRET;
  const appServerUrl = process.env.APP_SERVER_URL || 'http://localhost:3000';

  if (!apiKey || !apiSecret) {
    throw new Error('API_KEY and API_SECRET must be configured in environment variables');
  }

  // Build endpoint URL with shop query parameter if present (matching Remix app behavior)
  const baseUrl = `${appServerUrl}/graphql`;
  const url = new URL(baseUrl);

  const shopQueryParam = options?.shop || (typeof variables?.shop === 'string' ? variables.shop : undefined);

  // Extract shop and add as query parameter (matching buildGraphQLEndpoint behavior)
  if (shopQueryParam) {
    url.searchParams.set('shop', shopQueryParam);
  }
  else{
    url.searchParams.set('shop', 'admin-digitalcoo.myshopify.com');
  }

  const sanitizedVariables = { ...(variables || {}) };
  // Avoid sending "shop" variable unless caller explicitly keeps it in GraphQL variables.
  if (options?.shop && Object.prototype.hasOwnProperty.call(sanitizedVariables, 'shop')) {
    delete sanitizedVariables.shop;
  }

  const endpoint = url.toString();
  const requestBodyObj = { query, variables: sanitizedVariables };
  const requestBody = JSON.stringify(requestBodyObj);

  const authHeader = createAuthHeader('POST', endpoint, requestBodyObj, apiKey, apiSecret);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GraphQL request failed: ${response.status} ${errorText}`);
    }

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.message).join(', ');
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    return result;
  } catch (error: any) {
    throw new Error(`GraphQL request error: ${error?.message || error}`);
  }
}

