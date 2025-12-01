/**
 * Shopify Shop Name Utility
 * Normalizes shop domain to shop name
 */

export function normalizeShopName(domain: string): string {
  if (!domain) return '';

  // Normalize domain
  domain = domain.trim().toLowerCase();

  // Remove protocol + path
  domain = domain.replace(/^https?:\/\//, '').split('/')[0];

  // Extract before ".myshopify.com"
  const match = domain.match(/^(.*?)\.myshopify\.com$/);

  if (!match) return domain;

  return match[1];
}

