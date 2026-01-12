/**
 * Authentication Helper
 * Strong cryptographic utilities for request authentication
 * Uses HMAC-SHA256 with timestamp-based nonce to prevent replay attacks
 */

import crypto from 'crypto';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('auth-helper');

/**
 * Maximum allowed timestamp difference (5 minutes)
 * Prevents replay attacks by rejecting requests with timestamps too far in the past or future
 */
const MAX_TIMESTAMP_DIFF_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate HMAC-SHA256 signature for a request
 * 
 * @param secret - API secret key
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path
 * @param queryString - Query string (without ?)
 * @param bodyHash - SHA256 hash of request body (empty string for GET requests)
 * @param timestamp - Unix timestamp in milliseconds
 * @param nonce - Random nonce string
 * @returns Base64-encoded HMAC signature
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
  // Normalize method to uppercase
  const normalizedMethod = method.toUpperCase();
  
  // Build signature payload in a deterministic order
  // This order is critical - must match exactly in validation
  const payload = [
    normalizedMethod,
    path,
    queryString || '',
    bodyHash || '',
    timestamp.toString(),
    nonce,
  ].join('\n');

  // Generate HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const signature = hmac.digest('base64');

  logger.debug('Generated signature', {
    method: normalizedMethod,
    path,
    hasQuery: !!queryString,
    hasBody: !!bodyHash,
    timestamp,
    nonceLength: nonce.length,
  });

  return signature;
}

/**
 * Hash request body using SHA256
 * 
 * @param body - Request body (string, Buffer, or object)
 * @returns Base64-encoded SHA256 hash
 */
export function hashRequestBody(body: any): string {
  if (!body) {
    return '';
  }

  let bodyString: string;
  
  if (Buffer.isBuffer(body)) {
    bodyString = body.toString('utf8');
  } else if (typeof body === 'string') {
    bodyString = body;
  } else if (typeof body === 'object') {
    // Sort keys to ensure deterministic hashing
    bodyString = JSON.stringify(body, Object.keys(body).sort());
  } else {
    bodyString = String(body);
  }

  if (!bodyString || bodyString.length === 0) {
    return '';
  }

  const hash = crypto.createHash('sha256');
  hash.update(bodyString, 'utf8');
  return hash.digest('base64');
}

/**
 * Generate a cryptographically secure random nonce
 * 
 * @param length - Length of nonce in bytes (default: 16)
 * @returns Base64-encoded random nonce
 */
export function generateNonce(length: number = 16): string {
  const bytes = crypto.randomBytes(length);
  return bytes.toString('base64');
}

/**
 * Validate timestamp to prevent replay attacks
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param maxDiffMs - Maximum allowed difference in milliseconds (default: 5 minutes)
 * @returns true if timestamp is valid, false otherwise
 */
export function validateTimestamp(timestamp: number, maxDiffMs: number = MAX_TIMESTAMP_DIFF_MS): boolean {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  
  if (diff > maxDiffMs) {
    logger.warn('Timestamp validation failed', {
      timestamp,
      now,
      diff,
      maxDiff: maxDiffMs,
      diffSeconds: Math.floor(diff / 1000),
    });
    return false;
  }

  return true;
}

/**
 * Parse and validate authentication headers
 * 
 * Expected header format:
 * Authorization: HMAC-SHA256 apiKey=<apiKey>,timestamp=<timestamp>,nonce=<nonce>,signature=<signature>
 * 
 * @param authHeader - Authorization header value
 * @returns Parsed authentication data or null if invalid
 */
export function parseAuthHeader(authHeader: string | undefined): {
  apiKey: string;
  timestamp: number;
  nonce: string;
  signature: string;
} | null {
  if (!authHeader) {
    return null;
  }

  // Support both "HMAC-SHA256 ..." and "Bearer ..." formats
  const headerValue = authHeader.replace(/^(HMAC-SHA256|Bearer)\s+/i, '').trim();
  
  // Parse key-value pairs
  const parts: Record<string, string> = {};
  const regex = /(\w+)=([^,]+)/g;
  let match;
  
  while ((match = regex.exec(headerValue)) !== null) {
    const [, key, value] = match;
    parts[key.trim()] = value.trim();
  }

  const apiKey = parts.apiKey;
  const timestampStr = parts.timestamp;
  const nonce = parts.nonce;
  const signature = parts.signature;

  if (!apiKey || !timestampStr || !nonce || !signature) {
    logger.warn('Missing required auth parameters', {
      hasApiKey: !!apiKey,
      hasTimestamp: !!timestampStr,
      hasNonce: !!nonce,
      hasSignature: !!signature,
    });
    return null;
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || timestamp <= 0) {
    logger.warn('Invalid timestamp format', { timestampStr });
    return null;
  }

  return {
    apiKey,
    timestamp,
    nonce,
    signature,
  };
}

/**
 * Build query string from request query object
 * Sorts keys to ensure deterministic ordering
 * 
 * @param query - Express query object
 * @returns Sorted query string (without ?)
 */
export function buildQueryString(query: Record<string, any>): string {
  if (!query || Object.keys(query).length === 0) {
    return '';
  }

  // Sort keys for deterministic ordering
  const sortedKeys = Object.keys(query).sort();
  const pairs = sortedKeys.map(key => {
    const value = query[key];
    // Handle arrays and objects
    if (Array.isArray(value)) {
      return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`).join('&');
    }
    return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
  });

  return pairs.join('&');
}

