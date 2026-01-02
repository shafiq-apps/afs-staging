/**
 * Input Sanitization Utilities
 * Sanitization to prevent injection attacks
 */

import { createModuleLogger } from './logger.util';
import {
  BLOCKED_CHARS_ES_TERMS,
  BLOCKED_CHARS_QUERY_KEY,
  MAX_OPTION_KEY_LENGTH,
  MAX_OPTION_VALUE_LENGTH,
  MAX_TERM_LENGTH,
  MAX_TERMS_ARRAY_ITEMS,
} from '@shared/constants/sanitization.constants';

const logger = createModuleLogger('sanitizer');

/**
 * Sanitize string input
 */
export function sanitizeString(input: string | null | undefined, maxLength?: number): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input.replace(/\0/g, '').trim();

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize search query - remove ES query operators
 */
export function sanitizeSearchQuery(query: string | null | undefined): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  let sanitized = sanitizeString(query, 500);
  // sanitized = sanitized.replace(/[\=|!(){}[\]^~*?:\\]/g, '');
  // sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Sanitize terms array for ES terms query
 * 
 * ES `terms` queries use exact matching on keyword fields, so most characters are safe.
 * We only reject terms containing characters that could be used for ES query injection
 * when constructing query strings (not applicable to terms queries, but kept for safety).
 * 
 * Note: Most special characters are now allowed including quotes, parentheses, slashes,
 * ampersands, percent signs, plus, hash, exclamation, etc.
 * 
 * Rejected characters: = & | { } [ ] ^ ~ * ? : \ (only truly dangerous ES query operators)
 * Allowed special characters: + - _ . , space, " ' ( ) / & % # ! and more
 */
export function sanitizeTermsArray(terms: any, maxItems = MAX_TERMS_ARRAY_ITEMS, maxLength = MAX_TERM_LENGTH): string[] {
  if (!terms) {
    return [];
  }

  const array = Array.isArray(terms) ? terms : [terms];
  const rejectedTerms: string[] = [];
  
  // Create regex from blocked characters constant (escape special regex chars)
  const escapedBlockedChars = BLOCKED_CHARS_ES_TERMS.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const blockedRegex = new RegExp(`[${escapedBlockedChars}]`, 'g');
  
  const sanitized = array
    .slice(0, maxItems)
    .map((item) => sanitizeString(String(item), maxLength))
    .filter((term) => {
      if (term.length === 0 || term.length > maxLength) {
        if (term.length > maxLength) {
          rejectedTerms.push(term);
          logger.warn('Filter term rejected: exceeds max length', { term, maxLength });
        }
        return false;
      }
      // Only reject characters defined in BLOCKED_CHARS_ES_TERMS
      // Allow: quotes (" '), parentheses ( ), slashes (/), ampersands (&), percent (%),
      // plus (+), hash (#), exclamation (!), hyphen (-), underscore (_), dot (.), comma (,)
      if (blockedRegex.test(term)) {
        const matches = term.match(blockedRegex);
        rejectedTerms.push(term);
        logger.warn('Filter term rejected: contains dangerous ES query operators', { 
          term, 
          rejectedChars: matches 
        });
        return false;
      }
      return true;
    });
  
  // Log summary if any terms were rejected
  if (rejectedTerms.length > 0 && array.length > 0) {
    logger.debug('Some filter terms were rejected during sanitization', {
      totalTerms: array.length,
      acceptedTerms: sanitized.length,
      rejectedTerms: rejectedTerms.length,
      rejected: rejectedTerms
    });
  }
  
  return sanitized;
}

/**
 * Sanitize array of strings
 */
export function sanitizeStringArray(input: any, maxItems = 100, maxItemLength = 100): string[] {
  if (!input) {
    return [];
  }

  if (!Array.isArray(input)) {
    input = [input];
  }

  return input
    .slice(0, maxItems)
    .map((item) => sanitizeString(String(item), maxItemLength))
    .filter((item) => item.length > 0);
}

/**
 * Sanitize number - ensure it's a valid number within range
 */
export function sanitizeNumber(
  input: any,
  min?: number,
  max?: number,
  defaultValue?: number
): number | undefined {
  if (input === null || input === undefined) {
    return defaultValue;
  }

  const num = typeof input === 'string' ? parseFloat(input) : Number(input);

  if (isNaN(num)) {
    return defaultValue;
  }

  if (min !== undefined && num < min) {
    return defaultValue ?? min;
  }

  if (max !== undefined && num > max) {
    return defaultValue ?? max;
  }

  return num;
}

/**
 * Sanitize object - remove dangerous properties and limit depth
 */
export function sanitizeObject(input: any, maxDepth = 5, currentDepth = 0): any {
  if (currentDepth >= maxDepth) {
    return {};
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const sanitized: Record<string, any> = {};
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

  for (const [key, value] of Object.entries(input)) {
    if (dangerousKeys.includes(key)) {
      continue;
    }

    const sanitizedKey = sanitizeString(key, 100);
    if (!sanitizedKey) {
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[sanitizedKey] = sanitizeObject(value, maxDepth, currentDepth + 1);
    } else {
      sanitized[sanitizedKey] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize filter input for ES queries
 */
export function sanitizeFilterInput(input: {
  search?: string;
  vendors?: string[];
  productTypes?: string[];
  tags?: string[];
  collections?: string[];
  options?: Record<string, string[]>;
  variantOptionKeys?: string[];
  priceMin?: number;
  priceMax?: number;
  variantSkus?: string[];
  keep?: string[];
}): {
  search?: string;
  vendors?: string[];
  productTypes?: string[];
  tags?: string[];
  collections?: string[];
  options?: Record<string, string[]>;
  variantOptionKeys?: string[];
  priceMin?: number;
  priceMax?: number;
  variantSkus?: string[];
  keep?: string[];
} {
  const sanitized: typeof input = {};

  if (input.search) {
    sanitized.search = sanitizeSearchQuery(input.search);
  }

  if (input.vendors) {
    sanitized.vendors = sanitizeTermsArray(input.vendors);
  }

  if (input.productTypes) {
    sanitized.productTypes = sanitizeTermsArray(input.productTypes);
  }

  if (input.tags) {
    sanitized.tags = sanitizeTermsArray(input.tags);
  }

  if (input.collections) {
    sanitized.collections = sanitizeTermsArray(input.collections);
  }

  if (input.options) {
    sanitized.options = {};
    // Create regex from blocked characters constant
    const blockedKeyRegex = new RegExp(`[${BLOCKED_CHARS_QUERY_KEY.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}]`, 'g');
    
    for (const [key, values] of Object.entries(input.options)) {
      // Sanitize option key - remove dangerous characters as defined in constants
      // Allow alphanumeric, underscore, hyphen, dot, quotes, and safe special chars
      // Only remove: Characters defined in BLOCKED_CHARS_QUERY_KEY
      let sanitizedKey = sanitizeString(key, MAX_OPTION_KEY_LENGTH);
      // Additional sanitization: remove blocked characters
      sanitizedKey = sanitizedKey.replace(/\0/g, '').replace(blockedKeyRegex, '');
      
      if (sanitizedKey) {
        // Sanitize option values (sanitizeTermsArray now allows quotes and safe chars)
        sanitized.options[sanitizedKey] = sanitizeTermsArray(values, MAX_TERMS_ARRAY_ITEMS, MAX_OPTION_VALUE_LENGTH);
      }
    }
  }

  if (input.variantOptionKeys) {
    sanitized.variantOptionKeys = sanitizeTermsArray(input.variantOptionKeys);
  }

  // Sanitize price range filters
  if (input.priceMin !== undefined) {
    sanitized.priceMin = sanitizeNumber(input.priceMin, 0);
  }

  if (input.priceMax !== undefined) {
    sanitized.priceMax = sanitizeNumber(input.priceMax, 0);
  }

  if (input.variantSkus) {
    sanitized.variantSkus = sanitizeTermsArray(input.variantSkus);
  }

  if (input.keep) {
    sanitized.keep = sanitizeTermsArray(input.keep);
  }

  // Preserve handle mapping metadata for AND/OR logic
  if ((input as any).__handleMapping) {
    (sanitized as any).__handleMapping = (input as any).__handleMapping;
  }

  return sanitized;
}

/**
 * Escapes a string so it can safely be used in a RegExp pattern.
 * Handles all special regex characters: . * + ? ^ $ { } ( ) | [ ] \ -
 * @param input - The string to escape
 * @returns The escaped string
 */
export function escapeRegex(input: string): string {
  // List of special regex characters to escape, including dash '-' and closing bracket ']'
  const specialChars = /[.*+?^${}()|[\]\\]/g;

  // Replace each special character with a backslash-escaped version
  return String(input).replace(specialChars, '\\$&');
}


/**
 * Validate ES query structure (basic check)
 */
export function validateESQuery(query: any): boolean {
  if (!query || typeof query !== 'object') {
    return false;
  }

  const depth = getObjectDepth(query);
  if (depth > 10) {
    return false;
  }

  try {
    JSON.stringify(query);
  } catch (error) {
    return false;
  }

  return true;
}

/**
 * Get object depth (recursive)
 */
function getObjectDepth(obj: any, currentDepth = 0, maxDepth = 20): number {
  if (currentDepth >= maxDepth) {
    return currentDepth;
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return currentDepth;
  }

  let maxChildDepth = currentDepth;
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      const childDepth = getObjectDepth(value, currentDepth + 1, maxDepth);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
  }

  return maxChildDepth;
}

