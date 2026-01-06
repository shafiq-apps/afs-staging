/**
 * Extracts a valid Shopify domain from a Shopify-related identifier
 */
export function extractShopifyDomain(input: string): string | null {
  if (!input) return null;

  // Remove known prefixes
  let cleaned = input.replace(/^(offline_|offlne_)/, "");

  // If domain is already present, extract it
  const domainMatch = cleaned.match(/([a-z0-9-]+\.myshopify\.com)/i);
  if (domainMatch) {
    return domainMatch[1].toLowerCase();
  }

  // Otherwise assume it's just the shop name
  // and construct a valid Shopify domain
  return `${cleaned.toLowerCase()}.myshopify.com`;
}
