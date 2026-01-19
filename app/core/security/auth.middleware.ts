/**
 * HMAC-SHA256 Authentication Middleware
 * Strong cryptographic authentication using HMAC-SHA256 signatures
 * 
 * Features:
 * - HMAC-SHA256 signature verification
 * - Timestamp-based nonce to prevent replay attacks
 * - Request body hashing to prevent tampering
 * - Configurable for selective route protection
 * 
 * Usage:
 * ```typescript
 * import { authenticate } from '@core/security/auth.middleware';
 * 
 * export const middleware = [
 *   authenticate(), // Protect this route
 *   // ... other middleware
 * ];
 * ```
 * 
 * Client Implementation:
 * The client must send requests with the following header:
 * 
 * Authorization: HMAC-SHA256 apiKey=<apiKey>,timestamp=<timestamp>,nonce=<nonce>,signature=<signature>
 * 
 * Where:
 * - apiKey: Your API key
 * - timestamp: Unix timestamp in milliseconds
 * - nonce: Random base64-encoded string (16+ bytes recommended)
 * - signature: HMAC-SHA256 signature of the request
 * 
 * Signature is computed over:
 * - HTTP method (uppercase)
 * - Request path
 * - Query string (sorted, URL-encoded)
 * - Request body SHA256 hash (base64)
 * - Timestamp (string)
 * - Nonce
 * 
 * All values joined by newline (\n) and signed with API secret.
 */

import crypto from 'crypto';
import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';
import { maskApiKey } from '@shared/utils/sensitive-data.util';
import {
  generateSignature,
  hashRequestBody,
  validateTimestamp,
  parseAuthHeader,
  buildQueryString,
} from './auth.helper';
import { getApiSecret } from './api-keys.helper';

const logger = createModuleLogger('auth-middleware');

export interface AuthMiddlewareOptions {
  /**
   * Whether to require authentication (default: true)
   * Set to false to make authentication optional
   */
  required?: boolean;

  /**
   * Maximum allowed timestamp difference in milliseconds (default: 5 minutes)
   */
  maxTimestampDiffMs?: number;

  /**
   * Custom function to skip authentication for specific requests
   */
  skip?: (req: HttpRequest) => boolean;

  /**
   * Custom error message for authentication failures
   */
  errorMessage?: string;

  /**
   * Allow bypass in development/sandbox environment (default: true)
   * When true, allows requests without auth in non-production environments
   */
  allowDevBypass?: boolean;
}

/**
 * Create authentication middleware
 * 
 * @param options - Middleware options
 * @returns Express middleware function
 */
export function authenticate(options: AuthMiddlewareOptions = {}) {
  const {
    required = true,
    maxTimestampDiffMs = 5 * 60 * 1000, // 5 minutes
    skip,
    errorMessage = 'Authentication required',
    allowDevBypass = true, // Allow bypass in development by default
  } = options;

  // SECURITY: Explicit production check
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = !isProduction;

  // SECURITY: Warn if production environment is not explicitly set
  if (!isProduction && !process.env.NODE_ENV) {
    logger.warn('NODE_ENV not set. Assuming development mode. Authentication bypass may be enabled.');
  }

  return async (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): Promise<void> => {
    try {
      // Check if authentication should be skipped
      if (skip && skip(req)) {
        logger.debug('Authentication skipped', { path: req.path, method: req.method });
        return next();
      }

      // Get authorization header
      // Headers can be string | string[], so we need to handle both
      const authHeaderValue = req.headers.authorization || req.headers['x-api-key'];
      const authHeader = Array.isArray(authHeaderValue) ? authHeaderValue[0] : authHeaderValue;
      
      if (!authHeader) {
        // SECURITY: Only allow bypass in non-production environments
        // Explicitly check that we're NOT in production
        if (!isProduction && allowDevBypass) {
          logger.debug('Authentication bypassed in development/sandbox', {
            path: req.path,
            method: req.method,
            env: process.env.NODE_ENV || 'undefined',
            warning: 'Authentication bypass is enabled',
          });
          // Attach a default dev API key for reference
          (req as any).authenticatedApiKey = 'dev-bypass';
          return next();
        }

        // SECURITY: In production, never allow bypass
        if (isProduction) {
          logger.warn('Authentication required in production - bypass not allowed', {
            path: req.path,
            method: req.method,
            ip: req.ip || req.socket?.remoteAddress,
          });
        }

        if (required) {
          logger.warn('Missing authorization header', {
            path: req.path,
            method: req.method,
            ip: req.ip || req.socket?.remoteAddress,
          });

          res.status(401).json({
            success: false,
            message: errorMessage,
            error: 'Missing authorization header',
          });
          return;
        } else {
          // Optional authentication - continue without auth
          return next();
        }
      }

      // Parse authentication header
      const authData = parseAuthHeader(authHeader);
      if (!authData) {
        if (required) {
          logger.warn('Invalid authorization header format', {
            path: req.path,
            method: req.method,
            ip: req.ip || req.socket?.remoteAddress,
          });

          res.status(401).json({
            success: false,
            message: errorMessage,
            error: 'Invalid authorization header format',
          });
          return;
        } else {
          return next();
        }
      }

      const { apiKey, timestamp, nonce, signature: providedSignature } = authData;

      // Validate timestamp to prevent replay attacks
      if (!validateTimestamp(timestamp, maxTimestampDiffMs)) {
        logger.warn('Timestamp validation failed', {
          path: req.path,
          method: req.method,
          timestamp,
          now: Date.now(),
          diff: Math.abs(Date.now() - timestamp),
          ip: req.ip || req.socket?.remoteAddress,
        });

        res.status(401).json({
          success: false,
          message: errorMessage,
          error: 'Request timestamp is too old or too far in the future',
          details: 'Timestamp must be within 5 minutes of server time',
        });
        return;
      }

      // Get API secret
      const secret = getApiSecret(apiKey);
      if (!secret) {
        logger.warn('Invalid API key', {
          path: req.path,
          method: req.method,
          apiKey: maskApiKey(apiKey),
          ip: req.ip || req.socket?.remoteAddress,
        });

        res.status(401).json({
          success: false,
          message: errorMessage,
          error: 'Invalid API key',
        });
        return;
      }

      // Hash request body
      // Note: req.body is already parsed by Express body parser
      const bodyHash = hashRequestBody(req.body);

      // Build query string (sorted for deterministic ordering)
      const queryString = buildQueryString(req.query as Record<string, any>);

      // Generate expected signature
      const expectedSignature = generateSignature(
        secret,
        req.method,
        req.path,
        queryString,
        bodyHash,
        timestamp,
        nonce
      );

      // Use constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(providedSignature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        // Enhanced logging for debugging
        logger.warn('Signature validation failed', {
          path: req.path,
          method: req.method,
          apiKey: maskApiKey(apiKey),
          ip: req.ip || req.socket?.remoteAddress,
          signatureMatch: false,
          // Debug info (only in development)
          debug: process.env.NODE_ENV === 'development' ? {
            expectedBodyHash: bodyHash,
            providedSignature: providedSignature.substring(0, 20) + '...',
            expectedSignature: expectedSignature.substring(0, 20) + '...',
            queryString,
            timestamp,
            nonce: nonce.substring(0, 10) + '...',
            path: req.path,
            method: req.method,
            bodyType: typeof req.body,
            bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).sort() : null,
          } : undefined,
        });

        res.status(401).json({
          success: false,
          message: errorMessage,
          error: 'Invalid signature',
        });
        return;
      }

      // Authentication successful
      // Attach API key to request for use in handlers
      (req as any).authenticatedApiKey = apiKey;
      (req as any).authTimestamp = timestamp;
      (req as any).authNonce = nonce;

      logger.debug('Authentication successful', {
        path: req.path,
        method: req.method,
        apiKey: maskApiKey(apiKey),
      });

      next();
    } catch (error: any) {
      logger.error('Authentication middleware error', {
        error: error?.message || error,
        path: req.path,
        method: req.method,
        stack: error?.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Authentication error',
        error: 'Internal server error',
      });
    }
  };
}

