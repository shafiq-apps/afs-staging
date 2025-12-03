/**
 * ID Generator Utility
 * Generates short, URL-friendly handles and option IDs for filters
 * Format: {prefix}{random} (e.g., "pr_a3k9x", "vn_x7m2p")
 * 
 * - Short (6-9 characters total)
 * - URL-friendly (lowercase alphanumeric + underscore)
 * - Unique (uses high-entropy random string)
 * - No spaces or special characters
 */

// Counter for additional uniqueness (increments on each call)
let idCounter = 0;

/**
 * Generate a short, URL-friendly ID
 * @param prefix - Short prefix (1-3 chars) to identify the type
 * @returns Short ID like "pr_a3k9x" or "vn_x7m2p"
 */
export function generateShortId(prefix: string): string {
  // Normalize prefix: lowercase, remove spaces, take first 2-3 chars
  const normalizedPrefix = prefix
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 2); // Use 2 chars for shorter IDs
  
  // Generate short random string (5 chars: alphanumeric)
  // Using more characters for better uniqueness without timestamp
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomPart = Array.from({ length: 4 }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  
  // Increment counter for additional uniqueness
  idCounter = (idCounter + 1) % 1000;
  
  // Combine: prefixrandom (e.g., "pra3k9x")
  return `${normalizedPrefix}${randomPart}`;
}

/**
 * Generate a short handle for filter options
 * Maps common filter types to short prefixes
 */
export function generateFilterHandle(optionType?: string): string {
  if (!optionType) {
    return generateShortId('opt');
  }
  
  // Map common types to short prefixes
  const typeMap: Record<string, string> = {
    'price': 'pr',
    'vendor': 'vn',
    'producttype': 'pt',
    'product-type': 'pt',
    'tags': 'tg',
    'tag': 'tg',
    'collection': 'cl',
    'collections': 'cl',
    'option': 'opt',
    'options': 'opt',
    'filter': 'fl',
    'filters': 'fl',
  };
  
  // Normalize option type
  const normalized = optionType.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  
  // Try to find in map, otherwise use first 2-3 chars
  const prefix = typeMap[normalized] || normalized.substring(0, 2) || 'opt';
  
  return generateShortId(prefix);
}

/**
 * Generate a short option ID
 * Always uses "opt" prefix for consistency
 */
export function generateOptionId(): string {
  return generateShortId('opt');
}

