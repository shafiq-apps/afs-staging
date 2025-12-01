/**
 * Rate Limiting Middleware
 * Framework-level rate limiting to prevent DoS and brute force attacks
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('rate-limit');

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: HttpRequest) => string;
  onLimitReached?: (req: HttpRequest, res: HttpResponse) => void;
  skip?: (req: HttpRequest) => boolean;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    firstRequestTime: number;
    middlewareId?: string;
  };
}

const store: RateLimitStore = {};
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const key in store) {
      if (store[key].resetTime < now) {
        delete store[key];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }, 5 * 60 * 1000);
}

startCleanup();

export function getClientIp(req: HttpRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = typeof forwardedFor === 'string' ? forwardedFor.split(',') : forwardedFor;
    const firstIp = ips[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp.trim();
  }

  if (req.ip) {
    return req.ip;
  }

  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }

  return 'unknown';
}

function validateOptions(options: RateLimitOptions): void {
  if (options.windowMs !== undefined && (options.windowMs <= 0 || !Number.isInteger(options.windowMs))) {
    throw new Error('windowMs must be a positive integer');
  }
  if (options.max !== undefined && (options.max <= 0 || !Number.isInteger(options.max))) {
    throw new Error('max must be a positive integer');
  }
}

export function rateLimit(options: RateLimitOptions = {}) {
  validateOptions(options);

  const {
    windowMs = 60000,
    max = 100,
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req: HttpRequest) => {
      const ip = getClientIp(req);
      return `${ip}:${req.method}:${req.path}`;
    },
    onLimitReached,
    skip,
    standardHeaders = true,
    legacyHeaders = false,
  } = options;

  const optionsHash = JSON.stringify({ windowMs, max, keyGenerator: keyGenerator.toString() });
  const middlewareId = `mw_${Buffer.from(optionsHash).toString('base64').substring(0, 16)}`;

  return async (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): Promise<void> => {
    try {
      if (skip && skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const now = Date.now();

      if (!store[key] || store[key].resetTime < now) {
        store[key] = {
          count: 0,
          resetTime: now + windowMs,
          firstRequestTime: now,
          middlewareId,
        };
      }

      const entry = store[key];

      if (entry.resetTime < now) {
        entry.count = 0;
        entry.resetTime = now + windowMs;
        entry.firstRequestTime = now;
        entry.middlewareId = middlewareId;
      } else if (!entry.middlewareId) {
        entry.middlewareId = middlewareId;
      }

      if (entry.middlewareId !== middlewareId && entry.resetTime > now) {
        const remaining = Math.max(0, max - entry.count);
        if (standardHeaders) {
          res.setHeader('RateLimit-Limit', max.toString());
          res.setHeader('RateLimit-Remaining', remaining.toString());
          res.setHeader('RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
        }
        if (legacyHeaders) {
          res.setHeader('X-RateLimit-Limit', max.toString());
          res.setHeader('X-RateLimit-Remaining', remaining.toString());
          res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
        }
        return next();
      }

      if (entry.count >= max) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        const resetTimestamp = Math.ceil(entry.resetTime / 1000);

        logger.warn('Rate limit exceeded', {
          key,
          count: entry.count,
          max,
          path: req.path,
          method: req.method,
          ip: getClientIp(req),
          retryAfter,
        });

        if (standardHeaders) {
          res.setHeader('RateLimit-Limit', max.toString());
          res.setHeader('RateLimit-Remaining', '0');
          res.setHeader('RateLimit-Reset', resetTimestamp.toString());
          res.setHeader('Retry-After', retryAfter.toString());
        }
        if (legacyHeaders) {
          res.setHeader('X-RateLimit-Limit', max.toString());
          res.setHeader('X-RateLimit-Remaining', '0');
          res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
        }

        if (onLimitReached) {
          try {
            onLimitReached(req, res);
            if (res.headersSent) {
              return;
            }
          } catch (error: any) {
            logger.error('Error in onLimitReached callback', error?.message || error);
          }
        }

        res.status(429).json({
          success: false,
          message,
          retryAfter,
          limit: max,
          remaining: 0,
          reset: new Date(entry.resetTime).toISOString(),
        });
        return;
      }

      entry.count++;
      const remaining = Math.max(0, max - entry.count);
      const resetTimestamp = Math.ceil(entry.resetTime / 1000);

      if (standardHeaders) {
        res.setHeader('RateLimit-Limit', max.toString());
        res.setHeader('RateLimit-Remaining', remaining.toString());
        res.setHeader('RateLimit-Reset', resetTimestamp.toString());
      }
      if (legacyHeaders) {
        res.setHeader('X-RateLimit-Limit', max.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
      }

      let finishHandlerCalled = false;
      const finishHandler = () => {
        if (finishHandlerCalled) return;
        finishHandlerCalled = true;

        const statusCode = res.statusCode;

        if (skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) {
          entry.count = Math.max(0, entry.count - 1);
        }

        if (skipFailedRequests && statusCode >= 400) {
          entry.count = Math.max(0, entry.count - 1);
        }
      };

      res.once('finish', finishHandler);
      res.once('close', finishHandler);

      next();
    } catch (error: any) {
      logger.error('Rate limit middleware error', {
        error: error?.message || error,
        path: req.path,
        method: req.method,
      });
      next();
    }
  };
}

export function apiRateLimit() {
  return rateLimit({
    windowMs: 60000,
    max: 100,
    message: 'API rate limit exceeded, please try again later',
  });
}

