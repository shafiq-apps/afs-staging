/**
 * Security Headers Middleware
 * Framework-level security headers to prevent common attacks
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';

interface SecurityHeadersOptions {
  contentSecurityPolicy?: string | boolean;
  xFrameOptions?: string | boolean;
  xContentTypeOptions?: boolean;
  xXSSProtection?: boolean;
  strictTransportSecurity?: string | boolean;
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

/**
 * Create security headers middleware
 */
export function securityHeaders(options: SecurityHeadersOptions = {}) {
  const {
    contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';",
    xFrameOptions = 'DENY',
    xContentTypeOptions = true,
    xXSSProtection = false,
    strictTransportSecurity = 'max-age=31536000; includeSubDomains',
    referrerPolicy = 'strict-origin-when-cross-origin',
    permissionsPolicy = 'geolocation=(), microphone=(), camera=()',
  } = options;

  return (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): void => {
    res.removeHeader('X-Powered-By');

    if (contentSecurityPolicy) {
      if (typeof contentSecurityPolicy === 'string') {
        res.setHeader('Content-Security-Policy', contentSecurityPolicy);
      } else if (contentSecurityPolicy === true) {
        res.setHeader('Content-Security-Policy', "default-src 'self'");
      }
    }

    if (xFrameOptions) {
      if (typeof xFrameOptions === 'string') {
        res.setHeader('X-Frame-Options', xFrameOptions);
      } else if (xFrameOptions === true) {
        res.setHeader('X-Frame-Options', 'DENY');
      }
    }

    if (xContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    if (xXSSProtection) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    if (strictTransportSecurity) {
      if (typeof strictTransportSecurity === 'string') {
        res.setHeader('Strict-Transport-Security', strictTransportSecurity);
      } else if (strictTransportSecurity === true) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
    }

    if (referrerPolicy) {
      res.setHeader('Referrer-Policy', referrerPolicy);
    }

    if (permissionsPolicy) {
      res.setHeader('Permissions-Policy', permissionsPolicy);
    }

    next();
  };
}

export const defaultSecurityHeaders = securityHeaders();

