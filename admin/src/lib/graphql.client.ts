/**
 * GraphQL Client Utility
 * Makes authenticated GraphQL requests to Node.js server
 * Uses HMAC-SHA256 authentication with API key and secret
 */

import * as crypto from 'crypto';

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

export interface GraphQLClientOptions {
  apiKey: string;
  apiSecret: string;
  endpoint?: string;
  shopDomain?: string;
}

function normalizeEndpoint(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If URL already points to GraphQL, keep it.
  if (trimmed.endsWith('/graphql')) {
    return trimmed;
  }

  // If it has a path/query, trust caller; otherwise append /graphql.
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = '/graphql';
      return parsed.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Generate HMAC-SHA256 signature for GraphQL request
 */
function generateSignature(
  method: string,
  path: string,
  queryString: string,
  bodyHash: string,
  timestamp: string,
  nonce: string,
  secret: string
): string {
  const message = `${method}\n${path}\n${queryString}\n${bodyHash}\n${timestamp}\n${nonce}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Hash request body
 */
function hashRequestBody(body: any): string {
  if (!body || Object.keys(body).length === 0) {
    return '';
  }
  const bodyString = JSON.stringify(body);
  return crypto.createHash('sha256').update(bodyString).digest('hex');
}

/**
 * Build query string (sorted for deterministic ordering)
 */
function buildQueryString(query: Record<string, any>): string {
  const keys = Object.keys(query).sort();
  return keys.map(key => `${key}=${encodeURIComponent(query[key])}`).join('&');
}

/**
 * Generate nonce
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * GraphQL Client Class
 */
export class GraphQLClient {
  private apiKey: string;
  private apiSecret: string;
  private endpoint: string;
  private shopDomain: string;

  constructor(options: GraphQLClientOptions) {
    const appServerEndpoint =
      normalizeEndpoint(process.env.NEXT_PUBLIC_APP_SERVER_URL) ||
      normalizeEndpoint(process.env.APP_SERVER_URL);
    const explicitGraphQLEndpoint =
      normalizeEndpoint(process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT) ||
      normalizeEndpoint(process.env.GRAPHQL_ENDPOINT);

    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.endpoint =
      normalizeEndpoint(options.endpoint) ||
      appServerEndpoint ||
      explicitGraphQLEndpoint ||
      'http://localhost:3554/graphql';
    this.shopDomain =
      options.shopDomain?.trim().toLowerCase() ||
      process.env.NEXT_PUBLIC_ADMIN_SHOP_DOMAIN ||
      process.env.ADMIN_SHOP_DOMAIN ||
      process.env.NEXT_PUBLIC_SHOP_DOMAIN ||
      process.env.SHOP_DOMAIN ||
      'digitalcoo.myshopify.com';
  }

  /**
   * Execute GraphQL query or mutation
   */
  async request<T = any>(request: GraphQLRequest): Promise<GraphQLResponse<T>> {
    const method = 'POST';
    const endpointUrl = new URL(this.endpoint);
    if (this.shopDomain && !endpointUrl.searchParams.has('shop')) {
      endpointUrl.searchParams.set('shop', this.shopDomain);
    }

    const path = endpointUrl.pathname;
    const timestamp = Date.now().toString();
    const nonce = generateNonce();
    const queryString = buildQueryString(Object.fromEntries(endpointUrl.searchParams.entries()));
    const bodyHash = hashRequestBody(request);

    // Generate signature
    const signature = generateSignature(
      method,
      path,
      queryString,
      bodyHash,
      timestamp,
      nonce,
      this.apiSecret
    );

    // Build authorization header
    // Format: Admin apiKey:timestamp:nonce:signature
    const authHeader = `Admin ${this.apiKey}:${timestamp}:${nonce}:${signature}`;

    try {
      const response = await fetch(endpointUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'X-Admin-Request': 'true',
          'X-Admin-Api-Key': this.apiKey,
          'X-Admin-Api-Secret': this.apiSecret,
          'X-Shopify-Shop-Domain': this.shopDomain,
          'X-Shop-Domain': this.shopDomain,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const snippet = errorText.replace(/\s+/g, ' ').slice(0, 240);
        throw new Error(
          `GraphQL request failed: ${response.status} ${response.statusText} at ${endpointUrl.toString()} :: ${snippet}`
        );
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

  /**
   * Execute GraphQL query
   */
  async query<T = any>(query: string, variables?: Record<string, any>, operationName?: string): Promise<T> {
    const response = await this.request<T>({ query, variables, operationName });
    if (!response.data) {
      throw new Error('No data returned from GraphQL query');
    }
    return response.data;
  }

  /**
   * Execute GraphQL mutation
   */
  async mutate<T = any>(mutation: string, variables?: Record<string, any>, operationName?: string): Promise<T> {
    const response = await this.request<T>({ query: mutation, variables, operationName });
    if (!response.data) {
      throw new Error('No data returned from GraphQL mutation');
    }
    return response.data;
  }
}

/**
 * Create GraphQL client instance
 * Gets API credentials from environment variables or session storage
 */
export function createGraphQLClient(): GraphQLClient | null {
  // Try to get from environment variables first (for server-side)
  const apiKey =
    process.env.NEXT_PUBLIC_API_KEY ||
    process.env.API_KEY;
  const apiSecret =
    process.env.NEXT_PUBLIC_API_SECRET ||
    process.env.API_SECRET;
  const shopDomain =
    process.env.NEXT_PUBLIC_ADMIN_SHOP_DOMAIN ||
    process.env.ADMIN_SHOP_DOMAIN ||
    process.env.NEXT_PUBLIC_SHOP_DOMAIN ||
    process.env.SHOP_DOMAIN ||
    'digitalcoo.myshopify.com';

  if (!apiKey || !apiSecret) {
    // Try to get from session storage (for client-side)
    if (typeof window !== 'undefined') {
      const storedApiKey = sessionStorage.getItem('admin_api_key');
      const storedApiSecret = sessionStorage.getItem('admin_api_secret');
      
      if (storedApiKey && storedApiSecret) {
        return new GraphQLClient({
          apiKey: storedApiKey,
          apiSecret: storedApiSecret,
          shopDomain,
        });
      }
    }
    
    console.warn('GraphQL client: API credentials not found');
    return null;
  }

  return new GraphQLClient({
    apiKey,
    apiSecret,
    shopDomain,
  });
}

/**
 * Store API credentials in session storage (client-side only)
 */
export function storeApiCredentials(apiKey: string, apiSecret: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('admin_api_key', apiKey);
    sessionStorage.setItem('admin_api_secret', apiSecret);
  }
}

/**
 * Clear API credentials from session storage (client-side only)
 */
export function clearApiCredentials(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('admin_api_key');
    sessionStorage.removeItem('admin_api_secret');
  }
}

