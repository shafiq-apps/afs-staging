/**
 * Input Sanitization Utilities
 * Sanitization to prevent injection attacks
 */

import { createModuleLogger } from './logger.util';

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
  sanitized = sanitized.replace(/[+\-=&|!(){}[\]^"~*?:\\]/g, '');
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Sanitize terms array for ES terms query
 * 
 * Rejects terms containing dangerous Elasticsearch query operators that could be used for injection.
 * Note: The plus sign (+) is allowed as it's a valid character in product option values.
 * 
 * Rejected characters: - = & | ! ( ) { } [ ] ^ " ~ * ? : \
 * Allowed special characters: + (plus sign), space, underscore, dot, comma
 */
export function sanitizeTermsArray(terms: any, maxItems = 100, maxLength = 100): string[] {
  if (!terms) {
    return [];
  }

  const array = Array.isArray(terms) ? terms : [terms];
  const rejectedTerms: string[] = [];
  
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
      // Remove + from rejection pattern - it's a valid character in product option values
      // Reject only truly dangerous ES query operators
      if (/[\-=&|!(){}[\]^"~*?:\\]/.test(term)) {
        rejectedTerms.push(term);
        logger.warn('Filter term rejected: contains dangerous ES query operators', { 
          term, 
          rejectedChars: term.match(/[\-=&|!(){}[\]^"~*?:\\]/g) 
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
  variantPriceMin?: number;
  variantPriceMax?: number;
  variantSkus?: string[];
  preserveOptionAggregations?: boolean;
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
  variantPriceMin?: number;
  variantPriceMax?: number;
  variantSkus?: string[];
  preserveOptionAggregations?: boolean;
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
    for (const [key, values] of Object.entries(input.options)) {
      // Sanitize option key - remove dangerous characters
      // Allow alphanumeric, underscore, hyphen, dot for handles/IDs and option names
      let sanitizedKey = sanitizeString(key, 200);
      // Additional sanitization: remove any remaining dangerous chars
      sanitizedKey = sanitizedKey.replace(/[<>\"'`\x00-\x1F\x7F]/g, '');
      
      if (sanitizedKey) {
        // Sanitize option values
        sanitized.options[sanitizedKey] = sanitizeTermsArray(values, 100, 200);
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

  if (input.variantPriceMin !== undefined) {
    sanitized.variantPriceMin = sanitizeNumber(input.variantPriceMin, 0);
  }

  if (input.variantPriceMax !== undefined) {
    sanitized.variantPriceMax = sanitizeNumber(input.variantPriceMax, 0);
  }

  if (input.variantSkus) {
    sanitized.variantSkus = sanitizeTermsArray(input.variantSkus);
  }

  if (typeof input.preserveOptionAggregations === 'boolean') {
    sanitized.preserveOptionAggregations = input.preserveOptionAggregations;
  }

  return sanitized;
}

/**
 * Escape special characters for regex
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

