/**
 * Product Helpers
 * Business logic utilities for building product filter inputs from HTTP requests
 */

import { ProductFilterInput, ProductSearchInput } from '@shared/storefront/types';
import { parseCommaSeparated, parseOptionFilters } from '@shared/helpers/query.helper';
import { normalizeShopifyId } from '@shared/utils/shopify-id.util';

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
    (filters.variantSkus && filters.variantSkus.length)
  );
}

/**
 * Build ProductFilterInput from HTTP request query parameters
 */
export function buildFilterInput(query: Record<string, unknown>): ProductFilterInput | undefined {
  const filters: ProductFilterInput = {};

  // Parse keep first, so we can exclude it from filters
  const keepValues = parseCommaSeparated(
    query.keep ||
      query.keepFilter ||
      query.keep_filters
  );
  const keepSet = new Set(
    keepValues.length > 0 
      ? keepValues.map(v => v.toLowerCase())
      : (query.preserveOptionAggregations === 'true' || query.preserveOptionAggregations === '1' ? ['__all__'] : [])
  );
  const keepAll = keepSet.has('__all__');

  // Parse standard filters, but exclude if in keep
  const vendorValues = parseCommaSeparated(query.vendor || query.vendors);
  if (vendorValues.length && !keepAll && !keepSet.has('vendors')) {
    filters.vendors = vendorValues;
  }

  const productTypeValues = parseCommaSeparated(query.productType || query.productTypes);
  if (productTypeValues.length && !keepAll && !keepSet.has('producttypes') && !keepSet.has('product_type')) {
    filters.productTypes = productTypeValues;
  }

  const tagValues = parseCommaSeparated(query.tag || query.tags);
  if (tagValues.length && !keepAll && !keepSet.has('tags')) {
    filters.tags = tagValues;
  }

  const collectionValues = parseCommaSeparated(query.collection || query.collections);
  if (collectionValues.length && !keepAll && !keepSet.has('collections')) {
    filters.collections = collectionValues;
  }

  // Collection page ID - filters products to only show those from the collection the user is viewing
  // CPID acts as an AND operator with collections - if both are provided, products must be in BOTH
  // Collections are stored as numeric strings in ES (e.g., "169207070801"), not GIDs
  const cpid = typeof query.cpid === 'string' ? query.cpid.trim() : undefined;
  if (cpid) {
    filters.cpid = cpid;
    // Normalize CPID to numeric ID (handles both GID format and numeric string)
    const collectionId = normalizeShopifyId(cpid);
    
    if (collectionId) {
      // CPID acts as AND operator: add CPID collection to existing collections array
      // This ensures products must be in BOTH the CPID collection AND any other specified collections
      if (filters.collections && filters.collections.length > 0) {
        // If collections already exist, add CPID collection (AND logic)
        if (!filters.collections.includes(collectionId)) {
          filters.collections.push(collectionId);
        }
      } else {
        // If no collections specified, CPID becomes the only collection filter
        filters.collections = [collectionId];
      }
    }
  }

  // Set keep in filters object
  if (keepValues.length) {
    filters.keep = keepValues;
  } else if (query.preserveOptionAggregations === 'true' || query.preserveOptionAggregations === '1') {
    filters.keep = ['__all__'];
  }

  // Parse option filters, but exclude the keep handle from the aggregation query
  // When calculating aggregations for a specific filter, that filter should be excluded
  // from the query so we get all possible values based on other active filters
  const optionFilters = parseOptionFilters(query);
  if (Object.keys(optionFilters).length) {
    // If keep is set, exclude that handle from optionFilters
    if (filters.keep && filters.keep.length > 0) {
      // keep will always have one value (single handle)
      const keepHandle = filters.keep[0];
      if (keepHandle && keepHandle !== '__all__') {
        // Exclude the keep handle from optionFilters
        if (optionFilters[keepHandle]) {
          delete optionFilters[keepHandle];
        }
      } else if (keepHandle === '__all__') {
        // If '__all__', exclude all option filters from aggregation query
        Object.keys(optionFilters).forEach(key => {
          delete optionFilters[key];
        });
      }
    }
    
    // Only add optionFilters if there are any remaining after exclusion
    if (Object.keys(optionFilters).length > 0) {
      filters.options = optionFilters;
    }
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

  // Variant SKU filter
  const variantSkuValues = parseCommaSeparated(query.variantSku || query.variantSkus || query.sku || query.skus);
  if (variantSkuValues.length) filters.variantSkus = variantSkuValues;

  const hasFilters = hasAnyFilters(filters);
  if (hasFilters || (filters.keep && filters.keep.length > 0)) {
    return filters;
  }

  return undefined;
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

  // Collection page ID - filters products to only show those from the collection the user is viewing
  // CPID acts as an AND operator with collections - if both are provided, products must be in BOTH
  // Collections are stored as numeric strings in ES (e.g., "169207070801"), not GIDs
  const cpid = typeof query.cpid === 'string' ? query.cpid.trim() : undefined;
  if (cpid) {
    filters.cpid = cpid;
    // Normalize CPID to numeric ID (handles both GID format and numeric string)
    const collectionId = normalizeShopifyId(cpid);
    
    if (collectionId) {
      // CPID acts as AND operator: add CPID collection to existing collections array
      // This ensures products must be in BOTH the CPID collection AND any other specified collections
      if (filters.collections && filters.collections.length > 0) {
        // If collections already exist, add CPID collection (AND logic)
        if (!filters.collections.includes(collectionId)) {
          filters.collections.push(collectionId);
        }
      } else {
        // If no collections specified, CPID becomes the only collection filter
        filters.collections = [collectionId];
      }
    }
  }

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

  const keepValues = parseCommaSeparated(
    query.keep ||
      query.keepFilter ||
      query.keep_filters
  );
  if (keepValues.length) {
    filters.keep = keepValues;
  } else if (query.preserveOptionAggregations === 'true' || query.preserveOptionAggregations === '1') {
    filters.keep = ['__all__'];
  }

  // Price range filters (product-level: minPrice/maxPrice)
  const priceMin = typeof query.priceMin === 'string' ? parseFloat(query.priceMin) : typeof query.priceMin === 'number' ? query.priceMin : undefined;
  if (priceMin !== undefined && !isNaN(priceMin) && priceMin >= 0) filters.priceMin = priceMin;

  const priceMax = typeof query.priceMax === 'string' ? parseFloat(query.priceMax) : typeof query.priceMax === 'number' ? query.priceMax : undefined;
  if (priceMax !== undefined && !isNaN(priceMax) && priceMax >= 0) filters.priceMax = priceMax;

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

