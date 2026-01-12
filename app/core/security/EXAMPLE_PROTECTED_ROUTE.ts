/**
 * Example: Protected Route
 * This file shows how to add authentication to a route
 * 
 * Copy this pattern to protect your routes
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { authenticate } from '@core/security/auth.middleware';
import { validateShopDomain } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { RATE_LIMIT } from '@shared/constants/app.constant';

/**
 * Example: Protected Reindex Route
 * 
 * This route is protected with HMAC-SHA256 authentication.
 * Only requests with valid API keys and signatures can access it.
 */
export const middleware = [
  // 1. Add authentication middleware FIRST
  // This ensures authentication happens before other middleware
  authenticate(),
  
  // 2. Add other middleware as needed
  validateShopDomain(),
  rateLimit({
    windowMs: RATE_LIMIT.REINDEXING.BUCKET_DURATION_MS,
    max: RATE_LIMIT.REINDEXING.MAX,
    message: "Too many reindexing requests"
  }),
];

/**
 * Handler can access authenticated API key from request
 */
export const POST = handler(async (req: HttpRequest) => {
  // The authenticated API key is available on the request
  const apiKey = (req as any).authenticatedApiKey;
  
  // Your route logic here
  // This code only runs if authentication succeeded
  
  return {
    success: true,
    message: 'Request authenticated successfully',
    apiKey, // Optional: include for debugging (remove in production)
  };
});

/**
 * Example: Optional Authentication
 * 
 * If you want authentication to be optional (allow both authenticated and unauthenticated requests):
 */
export const middlewareOptional = [
  authenticate({ required: false }), // Set required: false
  // ... other middleware
];

/**
 * Example: Skip Authentication for Specific Conditions
 * 
 * Skip authentication for certain requests (e.g., health checks):
 */
export const middlewareWithSkip = [
  authenticate({
    skip: (req) => {
      // Skip authentication for health check endpoints
      return req.path === '/health' || req.path === '/status';
    },
  }),
  // ... other middleware
];

