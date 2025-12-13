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

  // Parse preserveFilters first, so we can exclude it from filters
  const preserveFilterValues = parseCommaSeparated(
    query.preserveFilter ||
      query.preserveFilters ||
      query.preserve_filter ||
      query.preserve_filters
  );
  const preserveFilterSet = new Set(
    preserveFilterValues.length > 0 
      ? preserveFilterValues.map(v => v.toLowerCase())
      : (query.preserveOptionAggregations === 'true' || query.preserveOptionAggregations === '1' ? ['__all__'] : [])
  );
  const preserveAll = preserveFilterSet.has('__all__');

  // Parse standard filters, but exclude if in preserveFilters
  const vendorValues = parseCommaSeparated(query.vendor || query.vendors);
  if (vendorValues.length && !preserveAll && !preserveFilterSet.has('vendors')) {
    filters.vendors = vendorValues;
  }

  const productTypeValues = parseCommaSeparated(query.productType || query.productTypes);
  if (productTypeValues.length && !preserveAll && !preserveFilterSet.has('producttypes') && !preserveFilterSet.has('product_type')) {
    filters.productTypes = productTypeValues;
  }

  const tagValues = parseCommaSeparated(query.tag || query.tags);
  if (tagValues.length && !preserveAll && !preserveFilterSet.has('tags')) {
    filters.tags = tagValues;
  }

  const collectionValues = parseCommaSeparated(query.collection || query.collections);
  if (collectionValues.length && !preserveAll && !preserveFilterSet.has('collections')) {
    filters.collections = collectionValues;
  }

  // Collection page ID - filters products to only show those from the collection the user is viewing
  // If cpid is provided, it takes precedence and filters to only that collection
  // Collections are stored as numeric strings in ES (e.g., "169207070801"), not GIDs
  const cpid = typeof query.cpid === 'string' ? query.cpid.trim() : undefined;
  if (cpid) {
    filters.cpid = cpid;
    // Extract numeric ID if cpid is in GID format, otherwise use as-is
    // cpid can be numeric string (169207070801) or GID format (gid://shopify/Collection/169207070801)
    const collectionId = cpid.startsWith('gid://') 
      ? cpid.split('/').pop() || cpid  // Extract numeric ID from GID
      : cpid;  // Use numeric string directly
    // cpid takes precedence - filter to only the collection the user is viewing
    filters.collections = [collectionId];
  }

  // Set preserveFilters in filters object
  if (preserveFilterValues.length) {
    filters.preserveFilters = preserveFilterValues;
  } else if (query.preserveOptionAggregations === 'true' || query.preserveOptionAggregations === '1') {
    filters.preserveFilters = ['__all__'];
  }

  // Parse option filters, but exclude the preserveFilter handle from the aggregation query
  // When calculating aggregations for a specific filter, that filter should be excluded
  // from the query so we get all possible values based on other active filters
  const optionFilters = parseOptionFilters(query);
  if (Object.keys(optionFilters).length) {
    // If preserveFilters is set, exclude that handle from optionFilters
    if (filters.preserveFilters && filters.preserveFilters.length > 0) {
      // preserveFilters will always have one value (single handle)
      const preserveFilterHandle = filters.preserveFilters[0];
      if (preserveFilterHandle && preserveFilterHandle !== '__all__') {
        // Exclude the preserveFilter handle from optionFilters
        if (optionFilters[preserveFilterHandle]) {
          delete optionFilters[preserveFilterHandle];
        }
      } else if (preserveFilterHandle === '__all__') {
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

  // Variant price range filters (variant.price)
  const variantPriceMin = typeof query.variantPriceMin === 'string' ? parseFloat(query.variantPriceMin) : typeof query.variantPriceMin === 'number' ? query.variantPriceMin : undefined;
  if (variantPriceMin !== undefined && !isNaN(variantPriceMin) && variantPriceMin >= 0) filters.variantPriceMin = variantPriceMin;

  const variantPriceMax = typeof query.variantPriceMax === 'string' ? parseFloat(query.variantPriceMax) : typeof query.variantPriceMax === 'number' ? query.variantPriceMax : undefined;
  if (variantPriceMax !== undefined && !isNaN(variantPriceMax) && variantPriceMax >= 0) filters.variantPriceMax = variantPriceMax;

  // Variant SKU filter
  const variantSkuValues = parseCommaSeparated(query.variantSku || query.variantSkus || query.sku || query.skus);
  if (variantSkuValues.length) filters.variantSkus = variantSkuValues;

  const hasFilters = hasAnyFilters(filters);
  if (hasFilters || (filters.preserveFilters && filters.preserveFilters.length > 0)) {
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
  // If cpid is provided, it takes precedence and filters to only that collection
  // Collections are stored as numeric strings in ES (e.g., "169207070801"), not GIDs
  const cpid = typeof query.cpid === 'string' ? query.cpid.trim() : undefined;
  if (cpid) {
    filters.cpid = cpid;
    // Extract numeric ID if cpid is in GID format, otherwise use as-is
    // cpid can be numeric string (169207070801) or GID format (gid://shopify/Collection/169207070801)
    const collectionId = cpid.startsWith('gid://') 
      ? cpid.split('/').pop() || cpid  // Extract numeric ID from GID
      : cpid;  // Use numeric string directly
    // cpid takes precedence - filter to only the collection the user is viewing
    filters.collections = [collectionId];
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

  const preserveFilterValues = parseCommaSeparated(
    query.preserveFilter ||
      query.preserveFilters ||
      query.preserve_filter ||
      query.preserve_filters
  );
  if (preserveFilterValues.length) {
    filters.preserveFilters = preserveFilterValues;
  } else if (query.preserveOptionAggregations === 'true' || query.preserveOptionAggregations === '1') {
    filters.preserveFilters = ['__all__'];
  }

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

