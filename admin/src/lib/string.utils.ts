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

type FormatDateOptions = {
    year?: 'numeric' | '2-digit';
    month?: 'numeric' | '2-digit' | 'short' | 'long' | 'narrow';
    day?: 'numeric' | '2-digit';
    hour?: 'numeric' | '2-digit';
    minute?: 'numeric' | '2-digit';
    second?: 'numeric' | '2-digit';
    locale?: string;
};

export const formatDate = (dateString?: string, options?: FormatDateOptions): string => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleString(options?.locale || 'en-US', options);
    } catch {
        return dateString;
    }
};


type PriceFormatProps = {
    price: number;
    currencyCode?: string;
    decimals?: number;
    currencySymbol?: string;
};

export const formatPrice = ({
    price,
    currencyCode = "",
    decimals = 2,
    currencySymbol = "",
}: PriceFormatProps): string | null => {
    if (price == null || isNaN(price)) return null;

    return `${currencySymbol}${price.toFixed(decimals)} ${currencyCode}`.trim();
};


/**
 * Mask a string by showing a few characters at the start and end,
 * hiding the middle with asterisks.
 * e.g., maskString("1234567890", 3, 2) -> "123****90"
 */
export function maskString(
  str: string,
  visibleStart = 2,
  visibleEnd = 2,
  maskChar = '*'
): string {
  if (!str) return '';
  if (str.length <= visibleStart + visibleEnd) return maskChar.repeat(str.length);

  const start = str.slice(0, visibleStart);
  const end = str.slice(-visibleEnd);
  const middle = maskChar.repeat(str.length - visibleStart - visibleEnd);

  return `${start}${middle}${end}`;
}
