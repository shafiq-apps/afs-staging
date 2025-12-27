/**
 * CSRF Helper Functions
 * Utilities for working with CSRF tokens
 */

import { HttpRequest } from '@core/http/http.types';
import { generateCSRFToken } from './csrf.middleware';

/**
 * Get CSRF token from request cookie
 */
export function getCSRFTokenFromRequest(req: HttpRequest, cookieName: string = 'XSRF-TOKEN'): string | null {
  if (req.cookies && req.cookies[cookieName]) {
    return req.cookies[cookieName];
  }

  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    const cookie = cookies.find((c: string) => c.trim().startsWith(`${cookieName}=`));
    if (cookie) {
      return cookie.split('=')[1]?.trim() || null;
    }
  }

  return null;
}

/**
 * Generate a new CSRF token
 */
export function generateNewCSRFToken(): string {
  return generateCSRFToken();
}

