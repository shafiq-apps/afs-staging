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

  constructor(options: GraphQLClientOptions) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.endpoint = options.endpoint || process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:3000/graphql';
  }

  /**
   * Execute GraphQL query or mutation
   */
  async request<T = any>(request: GraphQLRequest): Promise<GraphQLResponse<T>> {
    const method = 'POST';
    const path = '/graphql';
    const timestamp = Date.now().toString();
    const nonce = generateNonce();
    const queryString = buildQueryString({});
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
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'X-Admin-Request': 'true',
          'X-Admin-Api-Key': this.apiKey,
          'X-Admin-Api-Secret': this.apiSecret,
        },
        body: JSON.stringify(request),
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
  const apiKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || process.env.ADMIN_API_KEY;
  const apiSecret = process.env.ADMIN_API_SECRET;

  if (!apiKey || !apiSecret) {
    // Try to get from session storage (for client-side)
    if (typeof window !== 'undefined') {
      const storedApiKey = sessionStorage.getItem('admin_api_key');
      const storedApiSecret = sessionStorage.getItem('admin_api_secret');
      
      if (storedApiKey && storedApiSecret) {
        return new GraphQLClient({
          apiKey: storedApiKey,
          apiSecret: storedApiSecret,
        });
      }
    }
    
    console.warn('GraphQL client: API credentials not found');
    return null;
  }

  return new GraphQLClient({
    apiKey,
    apiSecret,
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

