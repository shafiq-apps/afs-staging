/**
 * Shopify Shop Name Utility
 * Extracts shop name from shop domain
 */

export function ShopifyShopName(domain: string): string {
  if (!domain) return "";

  // Normalize domain
  domain = domain.trim().toLowerCase();

  // Remove protocol + path
  domain = domain.replace(/^https?:\/\//, "").split("/")[0];

  // Extract before ".myshopify.com"
  const match = domain.match(/^(.*?)\.myshopify\.com$/);

  if (!match) return domain;

  return match[1];
}

