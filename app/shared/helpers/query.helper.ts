/**
 * Query Parameter Helpers
 * Utilities for parsing HTTP query parameters
 */

import {
  BLOCKED_CHARS_QUERY_KEY,
  BLOCKED_CHARS_QUERY_VALUE,
  MAX_QUERY_KEY_LENGTH,
  MAX_QUERY_VALUE_LENGTH,
} from '@shared/constants/sanitization.constants';

/**
 * Sanitize query parameter key - remove dangerous characters
 * Allows alphanumeric, underscore, hyphen, dot, and safe special characters for handles/IDs
 * 
 * Safe characters: alphanumeric, underscore, hyphen, dot, quotes, parentheses,
 * forward slash, ampersand, percent, plus, hash, exclamation, brackets, etc.
 * Only removes: HTML tags (< >), backticks (`), null bytes, and control characters
 */
export function sanitizeQueryKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  // Remove blocked characters as defined in sanitization constants
  // Allow: alphanumeric, underscore, hyphen, dot, brackets, quotes, and most special chars
  // Only remove: Characters defined in BLOCKED_CHARS_QUERY_KEY
  const blockedRegex = new RegExp(`[${BLOCKED_CHARS_QUERY_KEY.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}]`, 'g');
  return key
    .replace(/\0/g, '') // Remove null bytes explicitly
    .replace(blockedRegex, '') // Remove blocked characters
    .trim()
    .substring(0, MAX_QUERY_KEY_LENGTH); // Max length from constants
}

/**
 * Sanitize query parameter value - remove dangerous characters
 * 
 * NOTE: ES `terms` queries use exact matching on keyword fields, so most characters
 * are safe. We only remove characters that pose security risks:
 * - HTML/script injection chars: < > ` (backtick)
 * - Control characters and null bytes
 * 
 * Safe characters allowed: alphanumeric, spaces, quotes (" '), parentheses (),
 * forward slash (/), ampersand (&), percent (%), hyphen (-), underscore (_),
 * plus (+), hash (#), exclamation (!), dot (.), comma (,), and more.
 * 
 * This allows product option values like "24"+Plyobox", "Size: 5'6"", etc.
 */
export function sanitizeQueryValue(value: string, opts?: { trim?: boolean }): string {
  if (!value || typeof value !== 'string') return '';
  const shouldTrim = opts?.trim !== false;
  const input = shouldTrim ? value.trim() : value;
  // Remove blocked characters as defined in sanitization constants
  // Allow: alphanumeric, spaces, quotes, parentheses, slashes, and most special chars
  // Only remove: Characters defined in BLOCKED_CHARS_QUERY_VALUE
  const blockedRegex = new RegExp(`[${BLOCKED_CHARS_QUERY_VALUE.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}]`, 'g');
  return input
    .replace(/\0/g, '') // Remove null bytes explicitly
    .replace(blockedRegex, '') // Remove blocked characters
    .substring(0, MAX_QUERY_VALUE_LENGTH); // Max length from constants
}

/**
 * Parse comma-separated values from query parameters
 * Sanitizes values to prevent injection attacks
 */
export function parseCommaSeparated(value: unknown): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((entry) => sanitizeQueryValue(entry.trim()))
    .filter(Boolean);
}

/**
 * Parse comma-separated values from query parameters, preserving leading/trailing whitespace.
 * Useful for option values where ES keyword matching should be exact.
 */
export function parseCommaSeparatedPreserveWhitespace(value: unknown): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((entry) => sanitizeQueryValue(entry, { trim: false }))
    .filter((v) => v.trim().length > 0);
}

/**
 * Extract option name from query parameter key
 * Supports: options[Color], option.Color, option_Color
 * Sanitizes the extracted key to prevent injection attacks
 */
export function extractOptionName(key: string): string | null {
  if (!key || typeof key !== 'string') return null;
  
  // Sanitize key first
  const sanitizedKey = sanitizeQueryKey(key);
  if (!sanitizedKey) return null;
  
  const patterns = [
    /^options\[(.+)\]$/i,
    /^option\.(.+)$/i,
    /^option_(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = sanitizedKey.match(pattern);
    if (match && match[1]) {
      // Sanitize the extracted option name
      return sanitizeQueryKey(match[1].trim());
    }
  }

  return null;
}

/**
 * Check if a key looks like a handle/ID pattern
 * Handles/IDs can follow multiple patterns:
 * - {prefix}_{random} (e.g., "pr_a3k9x", "op_rok5d") 
 * - {random} (e.g., "ti7u71", "coiecf", "rodnx2", "ef4gd")
 * Handles are typically 5-10 alphanumeric characters, often starting with letters
 */
function looksLikeHandle(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  
  // Pattern 1: {prefix}_{random} (e.g., "pr_a3k9x", "op_rok5d")
  const handlePatternWithUnderscore = /^[a-z]{2,3}_[a-z0-9]{3,10}$/i;
  if (handlePatternWithUnderscore.test(trimmed)) return true;
  
  // Pattern 2: {random} alphanumeric, 5-10 chars, typically starts with letter
  // Examples: ti7u71, coiecf, rodnx2, ef4gd
  const handlePatternSimple = /^[a-z0-9]{5,10}$/i;
  if (handlePatternSimple.test(trimmed)) {
    // Exclude common filter names that might match the pattern
    const lowerKey = trimmed.toLowerCase();
    const commonFilterNames = ['vendor', 'vendors', 'producttype', 'producttypes', 'tags', 'tag', 
                               'collection', 'collections', 'search', 'page', 'limit', 'sort'];
    if (commonFilterNames.includes(lowerKey)) return false;
    return true;
  }
  
  return false;
}

/**
 * Known non-option query parameters that should not be treated as option filters
 */
const RESERVED_QUERY_PARAMS = new Set([
  'shop', 'shop_domain', 'shopDomain',
  'search', 'query',
  'vendor', 'vendors',
  'productType', 'productTypes', 'product_type', 'product_types',
  'tag', 'tags',
  'collection', 'collections',
  'priceMin', 'priceMax', 'price_min', 'price_max',
  'variantKey', 'variantKeys', 'variant_key', 'variant_keys', 'variantOptionKeys', 'variant_option_keys',
  'variantSku', 'variantSkus', 'variant_sku', 'variant_skus', 'sku', 'skus',
  'page', 'limit', 'sort', 'fields', 'includeFilters',
  'options', // This is the options object itself, not an option key
]);

/**
 * Parse option filters from query parameters
 * Supports both option names (e.g., "Size", "Color") and handles/IDs (e.g., "pr_a3k9x", "op_rok5d")
 * 
 * Query parameter formats supported:
 * - options[Size]=M,XXXL (option name)
 * - options[pr_a3k9x]=M,XXXL (handle/ID)
 * - pr_a3k9x=M,XXXL (direct handle/ID as key - auto-detected by pattern)
 * - option.pr_a3k9x=M,XXXL (handle/ID with option prefix)
 * 
 * Note: 
 * - Direct keys matching handle pattern are detected and included
 * - Final validation happens in applyFilterConfigToInput() which checks against actual filter config
 * - Keys that don't match any option in filter config are filtered out during mapping
 */
export function parseOptionFilters(query: Record<string, unknown>): Record<string, string[]> {
  const optionFilters: Record<string, string[]> = {};

  const assignValues = (name: string, raw: unknown) => {
    // Sanitize the option name/key
    const sanitizedName = sanitizeQueryKey(name);
    if (!sanitizedName) return; // Skip if name is invalid after sanitization
    
    const values = parseCommaSeparatedPreserveWhitespace(raw);
    if (values.length) {
      optionFilters[sanitizedName] = values;
    }
  };

  // Parse options object/JSON
  const optionsParam = query.options;
  if (typeof optionsParam === 'string') {
    try {
      const parsed = JSON.parse(optionsParam);
      if (parsed && typeof parsed === 'object') {
        for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
          assignValues(name, value);
        }
      }
    } catch {
      // ignore malformed JSON
    }
  } else if (optionsParam && typeof optionsParam === 'object' && !Array.isArray(optionsParam)) {
    for (const [name, value] of Object.entries(optionsParam as Record<string, unknown>)) {
      assignValues(name, value);
    }
  }

  // Parse option filters from query parameters
  for (const [key, value] of Object.entries(query)) {
    // Skip reserved parameters
    if (RESERVED_QUERY_PARAMS.has(key.toLowerCase())) continue;
    
    // Sanitize the key first
    const sanitizedKey = sanitizeQueryKey(key);
    if (!sanitizedKey) continue;
    
    // Try to extract option name from patterns like options[key], option.key, option_key
    const optionName = extractOptionName(sanitizedKey);
    if (optionName) {
      assignValues(optionName, value);
      continue;
    }
    
    // If no pattern match, check if it looks like a handle/ID
    // Direct keys that match handle pattern are treated as option filters
    if (looksLikeHandle(sanitizedKey)) {
      assignValues(sanitizedKey, value);
      continue;
    }
    
    // For other keys, we could potentially treat them as option names
    // but we'll be conservative and only include them if they're explicitly in options format
    // This prevents accidental inclusion of unrelated query params
  }

  return optionFilters;
}

/**
 * Extract query parameter value
 */
export function extractQueryParam(query: Record<string, unknown>, paramNames: string[]): string | null {
  for (const paramName of paramNames) {
    const value = query[paramName];
    if (value && typeof value === 'string') {
      return value;
    }
  }
  return null;
}

/**
 * Extract shop domain from request query
 */
export function extractShopDomain(query: Record<string, unknown>): string | null {
  return extractQueryParam(query, ['shop', 'shop_domain']);
}
