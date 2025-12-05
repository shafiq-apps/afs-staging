/**
 * Cache Key Generator
 * Generates consistent cache keys for search and filter queries
 */

import { ProductSearchInput, ProductFilterInput } from '@shared/storefront/types';
import crypto from 'crypto';

/**
 * Constant for no filter configuration hash
 * Used to ensure consistent cache key structure
 */
export const NO_FILTER_CONFIG_HASH = 'no-filter';

/**
 * Generate cache key for product search
 * Includes filter config hash to invalidate cache when filter config changes
 */
export function generateSearchCacheKey(
  shopDomain: string, 
  filters?: ProductSearchInput,
  filterConfigHash?: string
): string {
  const keyParts = ['search', shopDomain];
  
  // Always include filter config hash in cache key for consistent key structure
  // This ensures cache is invalidated when filter config changes
  // Use 'no-filter' if hash is not provided to maintain consistency
  const configHash = filterConfigHash || NO_FILTER_CONFIG_HASH;
  keyParts.push(`cfg:${configHash}`);

  if (filters) {
    const normalized: Record<string, any> = {};

    if (filters.search) {
      normalized.search = filters.search.toLowerCase().trim();
    }

    if (filters.vendors && filters.vendors.length > 0) {
      normalized.vendors = [...filters.vendors].sort();
    }

    if (filters.productTypes && filters.productTypes.length > 0) {
      normalized.productTypes = [...filters.productTypes].sort();
    }

    if (filters.tags && filters.tags.length > 0) {
      normalized.tags = [...filters.tags].sort();
    }

    if (filters.collections && filters.collections.length > 0) {
      normalized.collections = [...filters.collections].sort();
    }

    if (filters.options && Object.keys(filters.options).length > 0) {
      const sortedOptions: Record<string, string[]> = {};
      for (const [key, values] of Object.entries(filters.options)) {
        sortedOptions[key] = [...values].sort();
      }
      normalized.options = sortedOptions;
    }

    if (filters.variantOptionKeys && filters.variantOptionKeys.length > 0) {
      normalized.variantOptionKeys = [...filters.variantOptionKeys].sort();
    }

    // Pagination
    if (filters.page) {
      normalized.page = filters.page;
    }
    if (filters.limit) {
      normalized.limit = filters.limit;
    }
    if (filters.sort) {
      normalized.sort = filters.sort;
    }
    if (filters.includeFilters !== undefined) {
      normalized.includeFilters = filters.includeFilters;
    }

    // Create hash of normalized filters for shorter keys
    const filterString = JSON.stringify(normalized);
    const hash = crypto.createHash('md5').update(filterString).digest('hex').substring(0, 16);
    keyParts.push(hash);
  } else {
    keyParts.push('empty');
  }

  return keyParts.join(':');
}

/**
 * Generate cache key for product filters
 * Includes filter config hash to invalidate cache when filter config changes
 */
export function generateFilterCacheKey(
  shopDomain: string, 
  filters?: ProductFilterInput,
  filterConfigHash?: string
): string {
  const keyParts = ['filters', shopDomain];
  
  // Always include filter config hash in cache key for consistent key structure
  // This ensures cache is invalidated when filter config changes
  // Use 'no-filter' if hash is not provided to maintain consistency
  const configHash = filterConfigHash || NO_FILTER_CONFIG_HASH;
  keyParts.push(`cfg:${configHash}`);

  if (filters) {
    const normalized: Record<string, any> = {};

    if (filters.search) {
      normalized.search = filters.search.toLowerCase().trim();
    }

    if (filters.vendors && filters.vendors.length > 0) {
      normalized.vendors = [...filters.vendors].sort();
    }

    if (filters.productTypes && filters.productTypes.length > 0) {
      normalized.productTypes = [...filters.productTypes].sort();
    }

    if (filters.tags && filters.tags.length > 0) {
      normalized.tags = [...filters.tags].sort();
    }

    if (filters.collections && filters.collections.length > 0) {
      normalized.collections = [...filters.collections].sort();
    }

    if (filters.options && Object.keys(filters.options).length > 0) {
      const sortedOptions: Record<string, string[]> = {};
      for (const [key, values] of Object.entries(filters.options)) {
        sortedOptions[key] = [...values].sort();
      }
      normalized.options = sortedOptions;
    }

    if (filters.variantOptionKeys && filters.variantOptionKeys.length > 0) {
      normalized.variantOptionKeys = [...filters.variantOptionKeys].sort();
    }

    // Create hash of normalized filters
    const filterString = JSON.stringify(normalized);
    const hash = crypto.createHash('md5').update(filterString).digest('hex').substring(0, 16);
    keyParts.push(hash);
  } else {
    keyParts.push('empty');
  }

  return keyParts.join(':');
}

/**
 * Generate cache key pattern for invalidation
 * Updated to match keys with cfg: prefix
 */
export function generateCacheKeyPattern(type: 'search' | 'filters', shopDomain: string): string {
  // Pattern must match: type:shopDomain:cfg:*:*
  // This accounts for the cfg: prefix in cache keys
  return `${type}:${shopDomain}:cfg:*`;
}

/**
 * Check if a cache key matches a pattern
 */
export function matchesPattern(key: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return key === pattern;
  }

  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(key);
}

