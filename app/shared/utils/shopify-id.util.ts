/**
 * Shopify ID Utilities
 * Functions to normalize and extract IDs from Shopify GraphQL GIDs
 */

/**
 * Extract numeric ID from Shopify GraphQL ID (GID)
 * 
 * @param gid - Shopify GraphQL ID in format: gid://shopify/Product/123456
 * @returns Numeric ID string or null if invalid
 * 
 * @example
 * normalizeShopifyId('gid://shopify/Product/123456') // '123456'
 * normalizeShopifyId('gid://shopify/ProductVariant/789012') // '789012'
 * normalizeShopifyId('123456') // '123456' (already normalized)
 * normalizeShopifyId(null) // null
 */
export function normalizeShopifyId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  
  // If already a numeric ID, return as-is
  if (/^\d+$/.test(gid)) {
    return gid;
  }
  
  // Extract ID from GID format: gid://shopify/Type/ID
  const match = gid.match(/gid:\/\/shopify\/[^/]+\/(.+)$/);
  if (match && match[1]) {
    return match[1];
  }
  
  // If no match, return original (might be a different format)
  return gid;
}

/**
 * Extract resource type from Shopify GraphQL ID (GID)
 * 
 * @param gid - Shopify GraphQL ID in format: gid://shopify/Product/123456
 * @returns Resource type (e.g., 'Product', 'ProductVariant') or null
 * 
 * @example
 * extractShopifyResourceType('gid://shopify/Product/123456') // 'Product'
 * extractShopifyResourceType('gid://shopify/ProductVariant/789012') // 'ProductVariant'
 */
export function extractShopifyResourceType(gid: string | null | undefined): string | null {
  if (!gid) return null;
  
  const match = gid.match(/gid:\/\/shopify\/([^/]+)\//);
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

/**
 * Build Shopify GraphQL ID (GID) from resource type and ID
 * 
 * @param resourceType - Resource type (e.g., 'Product', 'ProductVariant')
 * @param id - Numeric ID
 * @returns Shopify GraphQL ID in format: gid://shopify/Type/ID
 * 
 * @example
 * buildShopifyGid('Product', '123456') // 'gid://shopify/Product/123456'
 * buildShopifyGid('ProductVariant', '789012') // 'gid://shopify/ProductVariant/789012'
 */
export function buildShopifyGid(resourceType: string, id: string | number): string {
  return `gid://shopify/${resourceType}/${id}`;
}

