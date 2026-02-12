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

export const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return dateString;
    }
};