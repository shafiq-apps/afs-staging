/**
 * Product Helpers
 * Business logic utilities for building product filter inputs from HTTP requests
 */

import { ProductFilterInput, ProductSearchInput } from '@shared/storefront/types';
import { parseCommaSeparated, parseOptionFilters } from '@shared/helpers/query.helper';

/**
 * Check if any filters are present
 */
export function hasAnyFilters(filters?: ProductFilterInput): boolean {
  if (!filters) return false;
  return Boolean(
    (filters.vendors && filters.vendors.length) ||
    (filters.productTypes && filters.productTypes.length) ||
    (filters.tags && filters.tags.length) ||
    (filters.collections && filters.collections.length) ||
    (filters.options && Object.keys(filters.options).length) ||
    (filters.variantOptionKeys && filters.variantOptionKeys.length) ||
    filters.search ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.variantPriceMin !== undefined ||
    filters.variantPriceMax !== undefined ||
    (filters.variantSkus && filters.variantSkus.length)
  );
}

/**
 * Build ProductFilterInput from HTTP request query parameters
 */
export function buildFilterInput(query: Record<string, unknown>): ProductFilterInput | undefined {
  const filters: ProductFilterInput = {};

  const vendorValues = parseCommaSeparated(query.vendor || query.vendors);
  if (vendorValues.length) filters.vendors = vendorValues;

  const productTypeValues = parseCommaSeparated(query.productType || query.productTypes);
  if (productTypeValues.length) filters.productTypes = productTypeValues;

  const tagValues = parseCommaSeparated(query.tag || query.tags);
  if (tagValues.length) filters.tags = tagValues;

  const collectionValues = parseCommaSeparated(query.collection || query.collections);
  if (collectionValues.length) filters.collections = collectionValues;

  const optionFilters = parseOptionFilters(query);
  if (Object.keys(optionFilters).length) {
    filters.options = optionFilters;
  }

  const variantOptionKeyValues = parseCommaSeparated(
    query.variantKey ||
    query.variantKeys ||
    query.variant_option_key ||
    query.variant_option_keys
  );
  if (variantOptionKeyValues.length) {
    filters.variantOptionKeys = variantOptionKeyValues;
  }

  const searchQuery = typeof query.search === 'string' ? query.search.trim() : undefined;
  if (searchQuery) filters.search = searchQuery;

  // Price range filters (product-level: minPrice/maxPrice)
  const priceMin = typeof query.priceMin === 'string' ? parseFloat(query.priceMin) : typeof query.priceMin === 'number' ? query.priceMin : undefined;
  if (priceMin !== undefined && !isNaN(priceMin) && priceMin >= 0) filters.priceMin = priceMin;

  const priceMax = typeof query.priceMax === 'string' ? parseFloat(query.priceMax) : typeof query.priceMax === 'number' ? query.priceMax : undefined;
  if (priceMax !== undefined && !isNaN(priceMax) && priceMax >= 0) filters.priceMax = priceMax;

  // Variant price range filters (variant.price)
  const variantPriceMin = typeof query.variantPriceMin === 'string' ? parseFloat(query.variantPriceMin) : typeof query.variantPriceMin === 'number' ? query.variantPriceMin : undefined;
  if (variantPriceMin !== undefined && !isNaN(variantPriceMin) && variantPriceMin >= 0) filters.variantPriceMin = variantPriceMin;

  const variantPriceMax = typeof query.variantPriceMax === 'string' ? parseFloat(query.variantPriceMax) : typeof query.variantPriceMax === 'number' ? query.variantPriceMax : undefined;
  if (variantPriceMax !== undefined && !isNaN(variantPriceMax) && variantPriceMax >= 0) filters.variantPriceMax = variantPriceMax;

  // Variant SKU filter
  const variantSkuValues = parseCommaSeparated(query.variantSku || query.variantSkus || query.sku || query.skus);
  if (variantSkuValues.length) filters.variantSkus = variantSkuValues;

  return hasAnyFilters(filters) ? filters : undefined;
}

/**
 * Build ProductSearchInput from HTTP request query parameters
 */
export function buildSearchInput(query: Record<string, unknown>): ProductSearchInput {
  const filters: ProductSearchInput = {};

  const vendorValues = parseCommaSeparated(query.vendor || query.vendors);
  if (vendorValues.length) filters.vendors = vendorValues;

  const productTypeValues = parseCommaSeparated(query.productType || query.productTypes);
  if (productTypeValues.length) filters.productTypes = productTypeValues;

  const tagValues = parseCommaSeparated(query.tag || query.tags);
  if (tagValues.length) filters.tags = tagValues;

  const collectionValues = parseCommaSeparated(query.collection || query.collections);
  if (collectionValues.length) filters.collections = collectionValues;

  const optionFilters = parseOptionFilters(query);
  if (Object.keys(optionFilters).length) {
    filters.options = optionFilters;
  }

  const variantOptionKeyValues = parseCommaSeparated(
    query.variantKey ||
    query.variantKeys ||
    query.variant_option_key ||
    query.variant_option_keys
  );
  if (variantOptionKeyValues.length) {
    filters.variantOptionKeys = variantOptionKeyValues;
  }

  const searchQuery = typeof query.search === 'string' ? query.search.trim() : undefined;
  if (searchQuery) filters.search = searchQuery;

  // Price range filters (product-level: minPrice/maxPrice)
  const priceMin = typeof query.priceMin === 'string' ? parseFloat(query.priceMin) : typeof query.priceMin === 'number' ? query.priceMin : undefined;
  if (priceMin !== undefined && !isNaN(priceMin) && priceMin >= 0) filters.priceMin = priceMin;

  const priceMax = typeof query.priceMax === 'string' ? parseFloat(query.priceMax) : typeof query.priceMax === 'number' ? query.priceMax : undefined;
  if (priceMax !== undefined && !isNaN(priceMax) && priceMax >= 0) filters.priceMax = priceMax;

  // Variant price range filters (variant.price)
  const variantPriceMin = typeof query.variantPriceMin === 'string' ? parseFloat(query.variantPriceMin) : typeof query.variantPriceMin === 'number' ? query.variantPriceMin : undefined;
  if (variantPriceMin !== undefined && !isNaN(variantPriceMin) && variantPriceMin >= 0) filters.variantPriceMin = variantPriceMin;

  const variantPriceMax = typeof query.variantPriceMax === 'string' ? parseFloat(query.variantPriceMax) : typeof query.variantPriceMax === 'number' ? query.variantPriceMax : undefined;
  if (variantPriceMax !== undefined && !isNaN(variantPriceMax) && variantPriceMax >= 0) filters.variantPriceMax = variantPriceMax;

  // Variant SKU filter
  const variantSkuValues = parseCommaSeparated(query.variantSku || query.variantSkus || query.sku || query.skus);
  if (variantSkuValues.length) filters.variantSkus = variantSkuValues;

  // Pagination
  const page = typeof query.page === 'string' ? parseInt(query.page, 10) : undefined;
  if (page && page > 0) filters.page = page;

  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : undefined;
  if (limit && limit > 0 && limit <= 100) filters.limit = limit;

  // Sort
  const sort = typeof query.sort === 'string' ? query.sort : undefined;
  if (sort) filters.sort = sort;

  // Include filters (optional)
  const includeFilters = query.includeFilters === 'true' || query.includeFilters === '1';
  if (includeFilters) filters.includeFilters = true;

  // Field selection (optional)
  const fields = query.fields;
  if (fields) {
    if (typeof fields === 'string' || Array.isArray(fields)) {
      filters.fields = fields;
    }
  }

  return filters;
}

