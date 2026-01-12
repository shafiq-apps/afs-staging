/**
 * Legacy Auth Middleware
 * This file is kept for backward compatibility.
 * 
 * For new implementations, use the strong authentication middleware:
 * import { authenticate } from '@core/security/auth.middleware';
 * 
 * @deprecated Use @core/security/auth.middleware instead
 */
import { HttpNextFunction, HttpRequest, HttpResponse } from "@core/http";
import { authenticate } from "@core/security/auth.middleware";

/**
 * Legacy auth middleware - now uses the strong authentication system
 * 
 * @deprecated Use authenticate() from '@core/security/auth.middleware' directly
 */
export function authMiddleware(req: HttpRequest, res: HttpResponse, next: HttpNextFunction) {
    // Delegate to the new authentication middleware
    const authMw = authenticate();
    return authMw(req, res, next);
}

// Re-export the new authenticate function for convenience
export { authenticate } from "@core/security/auth.middleware";
