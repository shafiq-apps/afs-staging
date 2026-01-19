/**
 * Sensitive Data Utilities
 * Utilities for masking and sanitizing sensitive data in logs
 */

/**
 * Mask an API key for safe logging
 * Shows first 4 and last 4 characters, masks the rest
 * 
 * @param apiKey - The API key to mask
 * @returns Masked API key string (e.g., "3535***REDACTED***3535")
 */
export function maskApiKey(apiKey: string | null | undefined): string {
  if (!apiKey || typeof apiKey !== 'string') {
    return '***REDACTED***';
  }

  if (apiKey.length < 8) {
    return '***REDACTED***';
  }

  const prefix = apiKey.substring(0, 4);
  const suffix = apiKey.substring(apiKey.length - 4);
  return `${prefix}***REDACTED***${suffix}`;
}

/**
 * Mask a secret/token for safe logging
 * Shows first 4 characters only
 * 
 * @param secret - The secret to mask
 * @returns Masked secret string (e.g., "3535***REDACTED***")
 */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret || typeof secret !== 'string') {
    return '***REDACTED***';
  }

  if (secret.length < 4) {
    return '***REDACTED***';
  }

  const prefix = secret.substring(0, 4);
  return `${prefix}***REDACTED***`;
}

/**
 * Mask sensitive data in an object for logging
 * Recursively masks common sensitive field names
 * 
 * @param obj - Object to sanitize
 * @param sensitiveKeys - Array of keys to mask (default: common sensitive keys)
 * @returns Sanitized object with sensitive values masked
 */
export function maskSensitiveFields(
  obj: any,
  sensitiveKeys: string[] = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'auth',
    'authorization',
    'bearer',
    'apikey',
    'apisecret',
    'api_secret',
  ]
): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveFields(item, sensitiveKeys));
  }

  const sanitized: any = {};
  const sensitiveKeysLower = sensitiveKeys.map(k => k.toLowerCase());

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeysLower.some(sk => lowerKey.includes(sk));

    if (isSensitive && typeof value === 'string') {
      // Mask the value
      if (lowerKey.includes('key') && !lowerKey.includes('secret')) {
        sanitized[key] = maskApiKey(value);
      } else {
        sanitized[key] = maskSecret(value);
      }
    } else if (value && typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = maskSensitiveFields(value, sensitiveKeys);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

