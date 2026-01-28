/**
 * Security Framework
 * Framework-level security utilities and middleware
 */

export * from './rate-limit.middleware';
export * from './security-headers.middleware';
export * from './request-size.middleware';
export * from './csrf.middleware';
export * from './csrf.helper';
export * from './cors';
export * from './default-security.middleware';
export * from './auth.middleware';
export * from './auth.helper';
export * from './api-keys.helper';
export * from './admin-auth.middleware';

// Re-export sanitizers from shared utils
export {
  sanitizeString,
  sanitizeStringArray,
  sanitizeNumber,
  sanitizeObject,
  sanitizeSearchQuery,
  sanitizeTermsArray,
  sanitizeFilterInput,
  escapeRegex,
  validateESQuery,
} from '@shared/utils/sanitizer.util';

