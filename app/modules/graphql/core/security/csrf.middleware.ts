/**
 * CSRF Protection Middleware
 * Framework-level CSRF protection to prevent cross-site request forgery attacks
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('csrf');
import crypto from 'crypto';

interface CSRFOptions {
  cookieName?: string;
  headerName?: string;
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
    path?: string;
  };
  secret?: string;
  skipMethods?: string[];
  skip?: (req: HttpRequest) => boolean;
}

const DEFAULT_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');

function generateToken(secret: string = DEFAULT_SECRET): string {
  return crypto.randomBytes(32).toString('hex');
}

function verifyToken(cookieToken: string | undefined, headerToken: string | undefined): boolean {
  if (!cookieToken || !headerToken) {
    return false;
  }
  return cookieToken === headerToken && cookieToken.length > 0;
}

export function csrf(options: CSRFOptions = {}) {
  const {
    cookieName = 'XSRF-TOKEN',
    headerName = 'X-XSRF-TOKEN',
    cookieOptions = {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    },
    secret = DEFAULT_SECRET,
    skipMethods = ['GET', 'HEAD', 'OPTIONS'],
    skip,
  } = options;

  return async (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): Promise<void> => {
    try {
      if (skipMethods.includes(req.method)) {
        const token = generateToken(secret);
        const maxAge = cookieOptions.maxAge ? Math.floor(cookieOptions.maxAge / 1000) : 86400;
        const cookieParts = [
          `${cookieName}=${token}`,
          `Path=${cookieOptions.path || '/'}`,
          `Max-Age=${maxAge}`,
          `SameSite=${cookieOptions.sameSite || 'lax'}`,
        ];
        if (cookieOptions.secure) {
          cookieParts.push('Secure');
        }
        if (cookieOptions.httpOnly) {
          cookieParts.push('HttpOnly');
        }
        res.setHeader('Set-Cookie', cookieParts.join('; '));
        return next();
      }

      if (skip && skip(req)) {
        logger.warn('CSRF check skipped', { path: req.path, method: req.method });
        return next();
      }

      let cookieToken: string | undefined;
      if (req.cookies && req.cookies[cookieName]) {
        cookieToken = req.cookies[cookieName];
      } else if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        const cookie = cookies.find((c: string) => c.trim().startsWith(`${cookieName}=`));
        if (cookie) {
          cookieToken = cookie.split('=')[1]?.trim();
        }
      }

      const headerToken = (req.headers[headerName.toLowerCase()] ||
                          req.headers[headerName] ||
                          req.headers['x-csrf-token']) as string | undefined;

      if (!verifyToken(cookieToken, headerToken)) {
        logger.warn('CSRF token validation failed', {
          path: req.path,
          method: req.method,
          hasCookieToken: !!cookieToken,
          hasHeaderToken: !!headerToken,
          ip: req.ip || req.socket?.remoteAddress,
        });

        res.status(403).json({
          success: false,
          message: 'CSRF token validation failed',
          error: 'Invalid or missing CSRF token',
        });
        return;
      }

      next();
    } catch (error: any) {
      logger.error('CSRF middleware error', {
        error: error?.message || error,
        path: req.path,
        method: req.method,
      });
      res.status(500).json({
        success: false,
        message: 'CSRF validation error',
        error: 'Internal server error',
      });
    }
  };
}

export function generateCSRFToken(secret: string = DEFAULT_SECRET): string {
  return generateToken(secret);
}

export const defaultCSRF = csrf();

