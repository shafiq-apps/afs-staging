/**
 * Default Security Middleware
 * Applies all common security protocols by default
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { securityHeaders } from './security-headers.middleware';
import { requestSizeLimit } from './request-size.middleware';
import { rateLimit, getClientIp } from './rate-limit.middleware';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('security');

/**
 * Default security middleware stack
 */
export function defaultSecurityMiddleware() {
  const securityHeadersMw = securityHeaders();
  const requestSizeLimitMw = requestSizeLimit();
  const rateLimitMw = rateLimit({
    windowMs: 60000,
    max: 100,
    message: 'API rate limit exceeded, please try again later',
    keyGenerator: (req: HttpRequest) => {
      const ip = getClientIp(req);
      return `global:${ip}:${req.method}:${req.path}`;
    },
  });

  return async (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): Promise<void> => {
    securityHeadersMw(req, res, () => {
      requestSizeLimitMw(req, res, () => {
        rateLimitMw(req, res, next);
      });
    });
  };
}

export const defaultSecurity = defaultSecurityMiddleware();

