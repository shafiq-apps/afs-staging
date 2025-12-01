/**
 * Query Parameter Helpers
 * Utilities for parsing HTTP query parameters
 */

/**
 * Sanitize query parameter key - remove dangerous characters
 * Allows alphanumeric, underscore, hyphen, and dot for handles/IDs
 */
export function sanitizeQueryKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  // Remove null bytes, control characters, and dangerous chars
  // Allow: alphanumeric, underscore, hyphen, dot, brackets (for options[key] format)
  return key
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[<>\"'`]/g, '') // Remove HTML/script injection chars
    .trim()
    .substring(0, 200); // Max length
}

/**
 * Sanitize query parameter value - remove dangerous characters
 */
export function sanitizeQueryValue(value: string): string {
  if (!value || typeof value !== 'string') return '';
  // Remove null bytes, control characters, and dangerous chars
  // Allow: alphanumeric, spaces, underscore, hyphen, comma, plus, dot
  return value
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[<>\"'`]/g, '') // Remove HTML/script injection chars
    .trim()
    .substring(0, 500); // Max length
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
 * Handles/IDs typically follow pattern: {prefix}_{random} (e.g., "pr_a3k9x", "op_rok5d")
 */
function looksLikeHandle(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  // Pattern: 2-3 lowercase letters, underscore, 3-10 alphanumeric chars
  // Examples: pr_a3k9x, op_rok5d, vn_x7m2p
  const handlePattern = /^[a-z]{2,3}_[a-z0-9]{3,10}$/;
  return handlePattern.test(key);
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
  'variantPriceMin', 'variantPriceMax', 'variant_price_min', 'variant_price_max',
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
    
    const values = parseCommaSeparated(raw);
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
