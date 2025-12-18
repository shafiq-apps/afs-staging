/**
 * Normalize a Shopify GraphQL Global ID (GID) into a plain ID
 *
 * Supports:
 * - gid://shopify/Product/123
 * - Base64-encoded Shopify GIDs
 *
 * @param id Shopify GraphQL ID
 * @returns normalized ID or null
 */
export function normalizeShopifyId(id: unknown): string {
  if (typeof id !== 'string' || !id) return String(id);

  // Extract final ID segment
  const match = id.match(/gid:\/\/shopify\/[^/]+\/(.+)$/);
  return match ? match[1] : id;
}
