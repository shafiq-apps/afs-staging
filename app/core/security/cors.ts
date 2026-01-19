/**
 * CORS (Cross-Origin Resource Sharing) Middleware
 * Framework-level CORS configuration to control cross-origin requests
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('cors');

interface CORSOptions {
  /**
   * Allowed origins (comma-separated or array)
   * Use '*' for all origins (not recommended for production)
   * Use specific domains for better security
   */
  origin?: string | string[] | ((origin: string | undefined) => boolean | string | null);
  
  /**
   * Allowed HTTP methods
   */
  methods?: string | string[];
  
  /**
   * Allowed headers
   */
  allowedHeaders?: string | string[];
  
  /**
   * Exposed headers (headers that can be accessed by client)
   */
  exposedHeaders?: string | string[];
  
  /**
   * Whether to allow credentials (cookies, authorization headers)
   */
  credentials?: boolean;
  
  /**
   * Max age for preflight requests (in seconds)
   */
  maxAge?: number;
  
  /**
   * Whether to allow preflight requests to continue to next middleware
   */
  preflightContinue?: boolean;
  
  /**
   * Custom function to determine if origin is allowed
   */
  originValidator?: (origin: string | undefined) => boolean;
}

/**
 * Parse comma-separated string or return array
 */
function parseList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string | string[] | ((origin: string | undefined) => boolean | string | null) | undefined
): boolean {
  if (!origin) return false;
  if (!allowedOrigins) return false;

  // Function validator
  if (typeof allowedOrigins === 'function') {
    const result = allowedOrigins(origin);
    return result === true || result === origin;
  }

  // Array or string
  const origins = Array.isArray(allowedOrigins) ? allowedOrigins : parseList(allowedOrigins);
  
  // Wildcard (not recommended for production)
  if (origins.includes('*')) {
    logger.warn('CORS wildcard (*) origin allowed. Not recommended for production.');
    return true;
  }

  return origins.includes(origin);
}

/**
 * Create CORS middleware
 */
export function cors(options: CORSOptions = {}) {
  const {
    origin: originOption = process.env.CORS_ORIGIN || '*',
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With', 'X-XSRF-TOKEN', 'X-CSRF-Token'],
    exposedHeaders = [],
    credentials = false,
    maxAge = 86400, // 24 hours
    preflightContinue = false,
  } = options;

  const methodsList = parseList(methods);
  const allowedHeadersList = parseList(allowedHeaders);
  const exposedHeadersList = parseList(exposedHeaders);

  return (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): void => {
    const requestOrigin = req.headers.origin;

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      const originAllowed = isOriginAllowed(requestOrigin, originOption);
      
      if (!originAllowed) {
        logger.warn('CORS: Origin not allowed', { origin: requestOrigin, path: req.path });
        res.status(403).json({
          success: false,
          message: 'CORS: Origin not allowed',
        });
        return;
      }

      // Set CORS headers
      if (requestOrigin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      }

      if (credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      res.setHeader('Access-Control-Allow-Methods', methodsList.join(', '));
      res.setHeader('Access-Control-Allow-Headers', allowedHeadersList.join(', '));
      res.setHeader('Access-Control-Max-Age', maxAge.toString());

      if (exposedHeadersList.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', exposedHeadersList.join(', '));
      }

      if (preflightContinue) {
        return next();
      }

      res.status(204).end();
      return;
    }

    // Handle actual requests
    const originAllowed = isOriginAllowed(requestOrigin, originOption);

    if (originAllowed && requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      
      if (credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      if (exposedHeadersList.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', exposedHeadersList.join(', '));
      }
    } else if (requestOrigin && !originAllowed) {
      logger.warn('CORS: Origin not allowed', { origin: requestOrigin, path: req.path });
      // Don't block the request, but don't set CORS headers
      // This allows same-origin requests to work
    }

    next();
  };
}

/**
 * Default CORS configuration
 * Uses environment variable CORS_ORIGIN or allows all origins
 */
export const defaultCORS = cors({
  origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? [] : '*'),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-XSRF-TOKEN', 'X-CSRF-Token'],
});

/**
 * Strict CORS for production (no wildcard)
 * Requires CORS_ORIGIN environment variable
 */
export function strictCORS(): ReturnType<typeof cors> {
  const allowedOrigins = process.env.CORS_ORIGIN;
  
  if (!allowedOrigins && process.env.NODE_ENV === 'production') {
    logger.warn('CORS: CORS_ORIGIN not set in production. Using empty allow list.');
  }

  return cors({
    origin: allowedOrigins ? parseList(allowedOrigins) : [],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-XSRF-TOKEN', 'X-CSRF-Token'],
  });
}

