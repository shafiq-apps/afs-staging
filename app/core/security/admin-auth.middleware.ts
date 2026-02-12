/**
 * Admin Authentication Middleware
 * Validates admin API credentials (API key + secret) for admin GraphQL requests
 * Uses HMAC-SHA256 signature validation
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';
import * as crypto from 'crypto';
import { getApiKey, getApiSecret } from './api-keys.helper';

const logger = createModuleLogger('admin-auth-middleware');

/**
 * Parse admin authorization header
 * Format: Authorization: Admin apiKey:signature
 * Where signature is HMAC-SHA256 of: method + path + queryString + bodyHash + timestamp + nonce
 */
function parseAdminAuthHeader(authHeader: string): {
  apiKey: string;
  timestamp: number;
  nonce: string;
  signature: string;
} | null {
  if (!authHeader || !authHeader.startsWith('Admin ')) {
    return null;
  }

  const parts = authHeader.substring(6).trim().split(':');
  if (parts.length !== 4) {
    return null;
  }

  const [apiKey, timestamp, nonce, signature] = parts;
  const timestampNum = parseInt(timestamp, 10);

  if (!apiKey || !timestamp || !nonce || !signature || isNaN(timestampNum)) {
    return null;
  }

  return {
    apiKey,
    timestamp: timestampNum,
    nonce,
    signature,
  };
}

/**
 * Validate timestamp (prevent replay attacks)
 */
function validateTimestamp(timestamp: number, maxDiffMs: number = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= maxDiffMs;
}

/**
 * Hash request body for signature
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
 * Generate HMAC-SHA256 signature
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

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function signaturesMatch(provided: string, expected: string): boolean {
  return secretsMatch(provided, expected);
}

/**
 * Admin authentication middleware
 * Validates API credentials for admin GraphQL requests
 */
export function adminAuthenticate() {
  return async (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): Promise<void> => {
    try {
      // Check if this is an admin GraphQL request
      // Admin requests should have X-Admin-Request header or use admin queries
      const isAdminRequest = req.headers['x-admin-request'] === 'true' || 
                            req.body?.query?.includes('admin') ||
                            req.body?.query?.includes('Admin');

      if (!isAdminRequest) {
        // Not an admin request, skip admin auth
        return next();
      }

      // Get authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        logger.warn('Admin request missing authorization header', {
          path: req.path,
          method: req.method,
        });
        res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required',
            extensions: {
              code: 'UNAUTHORIZED',
            },
          },
        });
        return;
      }

      // Parse authorization header
      const authData = parseAdminAuthHeader(authHeader);
      if (!authData) {
        logger.warn('Invalid admin authorization header format', {
          path: req.path,
          method: req.method,
        });
        res.status(401).json({
          success: false,
          error: {
            message: 'Invalid authorization header format',
            extensions: {
              code: 'UNAUTHORIZED',
            },
          },
        });
        return;
      }

      const { apiKey, timestamp, nonce, signature: providedSignature } = authData;

      // Validate timestamp
      if (!validateTimestamp(timestamp)) {
        logger.warn('Admin request timestamp validation failed', {
          path: req.path,
          method: req.method,
          timestamp,
          now: Date.now(),
        });
        res.status(401).json({
          success: false,
          error: {
            message: 'Request timestamp is too old or too far in the future',
            extensions: {
              code: 'UNAUTHORIZED',
            },
          },
        });
        return;
      }

      // Hash request body
      const bodyHash = hashRequestBody(req.body);

      // Build query string
      const queryString = buildQueryString(req.query as Record<string, any>);

      const configuredSecret = getApiSecret(apiKey);
      const apiKeyConfig = getApiKey(apiKey);

      if (!configuredSecret || !apiKeyConfig) {
        logger.warn('Invalid admin API key', {
          path: req.path,
          method: req.method,
          apiKey: apiKey.substring(0, 8) + '...',
        });
        res.status(401).json({
          success: false,
          error: {
            message: 'Invalid API credentials',
            extensions: {
              code: 'UNAUTHORIZED',
            },
          },
        });
        return;
      } else {
        const expectedSignature = generateSignature(
          req.method,
          req.path,
          queryString,
          bodyHash,
          String(timestamp),
          nonce,
          configuredSecret
        );

        if (!signaturesMatch(providedSignature, expectedSignature)) {
          logger.warn('Invalid admin signature', {
            path: req.path,
            method: req.method,
            apiKey: apiKey.substring(0, 8) + '...',
          });
          res.status(401).json({
            success: false,
            error: {
              message: 'Invalid API credentials',
              extensions: {
                code: 'UNAUTHORIZED',
              },
            },
          });
          return;
        }
      }

      const adminUser = {
        id: `env:${apiKey.substring(0, 8)}`,
        email: 'env-admin@local',
        name: apiKeyConfig.name || 'Env Admin',
        role: 'super_admin',
        isActive: true,
      };

      // Set admin user in request
      (req as any).adminUser = adminUser;

      logger.info('Admin authenticated', {
        userId: adminUser.id,
        email: adminUser.email,
        path: req.path,
      });

      next();
    } catch (error: any) {
      logger.error('Admin authentication error', {
        error: error?.message || error,
        stack: error?.stack,
      });
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error',
          extensions: {
            code: 'INTERNAL_ERROR',
          },
        },
      });
    }
  };
}

