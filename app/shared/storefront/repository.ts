/**
 * Products Repository
 * Handles Elasticsearch operations for product filtering and searching
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('storefront-repository');
import { sanitizeFilterInput } from '@shared/utils/sanitizer.util';
import {
  ProductFilterInput,
  ProductSearchInput,
  ProductSearchResult,
  FacetAggregations,
  shopifyProduct,
  AggregationBucket,
  TermsAggregation,
} from './types';
import { PRODUCT_INDEX_NAME, PRODUCT_OPTION_PAIR_SEPARATOR } from '@shared/constants/products.constants';
import { filterProductsForStorefront } from './storefront.helper';
import { Filter } from '@shared/filters/types';

const DEFAULT_BUCKET_SIZE = 500;

const hasValues = (arr?: string[]) => Array.isArray(arr) && arr.length > 0;

/**
 * Aggregation mapping result
 * Contains both standard aggregations and variant option-specific aggregations
 */
interface AggregationMapping {
  standard: Set<string>; // Standard aggregations: vendors, tags, collections, etc.
  variantOptions: Map<string, string>; // Map of aggregation name -> optionType (e.g., "option.Color" -> "Color")
}

/**
 * Determine which aggregations should be calculated based on filter configuration
 * Only includes aggregations for published filter options
 * Returns specific aggregations for variant options (option.Color, option.Size, etc.)
 * instead of fetching all optionPairs and filtering
 */
function getEnabledAggregations(filterConfig: Filter | null, includeAllOptions: boolean = false): AggregationMapping {
  const standard = new Set<string>();
  const variantOptions = new Map<string, string>();

  if (!filterConfig || !filterConfig.options || includeAllOptions) {
    // If no filter config OR includeAllOptions is true, enable all aggregations
    // This is used by GraphQL and other endpoints that need all aggregations
    return {
      standard: new Set(['vendors', 'productTypes', 'tags', 'collections', 'priceRange', 'variantPriceRange']),
      variantOptions: new Map(), // Empty map signals to use optionPairs fallback (all options)
    };
  }

  // Map optionType to standard aggregation names
  const optionTypeToAggregation: Record<string, string> = {
    'vendor': 'vendors',
    'vendors': 'vendors',
    'producttype': 'productTypes',
    'product-type': 'productTypes',
    'product type': 'productTypes',
    'tags': 'tags',
    'tag': 'tags',
    'collection': 'collections',
    'collections': 'collections',
    'price': 'priceRange',
    'pricerange': 'priceRange',
    'price range': 'priceRange',
  };

  for (const option of filterConfig.options) {
    // Only include published options
    if (option.status !== 'PUBLISHED') continue;

    const optionType = option.optionType?.trim() || '';
    const normalizedOptionType = optionType.toLowerCase();
    const optionSettings = option.optionSettings || {};

    // Get the actual variant option key (for variant options)
    const variantOptionKey = optionSettings.variantOptionKey || optionType;
    const baseOptionType = optionSettings.baseOptionType;

    // Check if it's a standard filter type
    if (optionTypeToAggregation[normalizedOptionType]) {
      standard.add(optionTypeToAggregation[normalizedOptionType]);
    } else if (baseOptionType) {
      // Check baseOptionType to determine if it's a standard type
      const normalizedBaseType = baseOptionType.toLowerCase().trim();
      if (optionTypeToAggregation[normalizedBaseType]) {
        standard.add(optionTypeToAggregation[normalizedBaseType]);
      } else if (baseOptionType === 'OPTION' || baseOptionType === 'Option') {
        // Variant option - create specific aggregation: option.{optionType}
        // Use variantOptionKey if available, otherwise use optionType
        const aggName = `option.${variantOptionKey}`;
        variantOptions.set(aggName, variantOptionKey);
      }
    } else {
      // No baseOptionType specified - assume it's a variant option
      // Create specific aggregation: option.{optionType}
      const aggName = `option.${variantOptionKey}`;
      variantOptions.set(aggName, variantOptionKey);
    }
  }

  // Always include priceRange and variantPriceRange (fundamental filters)
  standard.add('priceRange');
  standard.add('variantPriceRange');

  return { standard, variantOptions };
}

/**
 * Standard filter option types that are NOT variant options
 * These are product-level attributes, not variant-specific options
 */
const STANDARD_FILTER_TYPES = new Set([
  'vendor', 'vendors',
  'producttype', 'product-type', 'product type', 'product_type',
  'tags', 'tag',
  'collection', 'collections',
  'price', 'pricerange', 'price range', 'price_range',
]);

/**
 * Extract variant option keys from filter configuration
 * 
 * Returns a normalized set of variant option keys (e.g., ["color", "size", "material"])
 * that are used in the filter options. This allows us to optimize aggregations
 * by only processing relevant option pairs.
 * 
 * Variant options are product variant attributes like Color, Size, Material, etc.
 * Standard filter types (vendor, productType, tags, collections, price) are excluded.
 * 
 * @param filterConfig - The filter configuration to extract keys from
 * @returns A set of variant option keys in original case (matching ES storage)
 */
function getVariantOptionKeys(filterConfig: Filter | null): Set<string> {
  const variantOptionKeys = new Set<string>();

  if (!filterConfig || !filterConfig.options) {
    return variantOptionKeys;
  }

  for (const option of filterConfig.options) {
    // Only include published options
    if (option.status !== 'PUBLISHED') continue;

    const optionSettings = option.optionSettings || {};

    // Priority 1: If variantOptionKey is explicitly stored, use it (keep original case)
    if (optionSettings.variantOptionKey) {
      variantOptionKeys.add(optionSettings.variantOptionKey.trim());
      continue;
    }

    // Priority 2: For variant options (baseOptionType === "Option"), use optionType
    // baseOptionType "Option" is a category, not the actual variant option name
    if (optionSettings.baseOptionType && optionSettings.baseOptionType.toLowerCase().trim() === 'option') {
      // For variant options, use optionType as the key (keep original case)
      const optionType = option.optionType?.trim() || '';
      if (optionType && !STANDARD_FILTER_TYPES.has(optionType.toLowerCase())) {
        variantOptionKeys.add(optionType);
      }
      continue;
    }

    // Priority 3: For other derived options, extract from baseOptionType
    if (optionSettings.baseOptionType) {
      const baseOptionName = optionSettings.baseOptionType.trim();
      if (baseOptionName) {
        // Keep original case, but check against lowercase for standard types
        if (!STANDARD_FILTER_TYPES.has(baseOptionName.toLowerCase())) {
          variantOptionKeys.add(baseOptionName);
        }
      }
      continue;
    }

    // Priority 4: Try to extract from optionType (fallback for legacy filters)
    const optionType = option.optionType?.trim() || '';
    if (!optionType) continue;

    // Check if it's a standard type - if so, skip it (case-insensitive check)
    if (STANDARD_FILTER_TYPES.has(optionType.toLowerCase())) {
      continue;
    }

    // Extract the option name from optionType (keep original case)
    variantOptionKeys.add(optionType);
  }

  return variantOptionKeys;
}

export class StorefrontSearchRepository {
  constructor(private esClient: Client) { }

  /**
   * Get facets/aggregations for filters
   * Matches old app's ProductFiltersRepository.getFacets implementation
   * Only calculates aggregations for enabled filter options in filterConfig
   */
  async getFacets(
    shopDomain: string,
    filters?: ProductFilterInput,
    filterConfig?: Filter | null
  ) {
    const index = PRODUCT_INDEX_NAME(shopDomain);

    // Sanitize filter input to prevent ES query injection
    const sanitizedFilters = filters ? sanitizeFilterInput(filters) : undefined;

    const mustQueries: any[] = [];
    const postFilterQueries: any[] = [];

    /** Preserve Filters Logic */
    const preserveFilters = new Set(
      (sanitizedFilters?.preserveFilters || []).map((k) => k.toLowerCase())
    );
    const preserveAll = preserveFilters.has('__all__');
    const shouldPreserve = (key: string) =>
      preserveAll || preserveFilters.has(key.toLowerCase());

    //
    // -----------------------
    //   FILTER QUERIES
    // -----------------------
    //

    /** Search */
    if (sanitizedFilters?.search) {
      mustQueries.push({
        multi_match: {
          query: sanitizedFilters.search,
          fields: ['title^3', 'vendor^2', 'productType', 'tags'],
          type: 'best_fields',
          operator: 'and',
        },
      });
    }

    /** Simple terms filters with optional "preserve" routing */
    const simpleFilters: Record<string, { field: string; values?: any[] }> = {
      vendors: { field: 'vendor.keyword', values: sanitizedFilters?.vendors },
      productTypes: {
        field: 'productType.keyword',
        values: sanitizedFilters?.productTypes,
      },
      tags: { field: 'tags.keyword', values: sanitizedFilters?.tags },
      collections: {
        field: 'collections.keyword',
        values: sanitizedFilters?.collections,
      },
    };

    for (const key in simpleFilters) {
      const { field, values } = simpleFilters[key];
      if (hasValues(values)) {
        const clause = { terms: { [field]: values! } };
        (shouldPreserve(key) ? postFilterQueries : mustQueries).push(clause);
      }
    }

    //
    // Variant Options (optionPairs)
    //
    if (sanitizedFilters?.options) {
      for (const [optionName, values] of Object.entries(
        sanitizedFilters.options
      )) {
        if (!hasValues(values)) continue;

        const encodedValues = (values as string[])
          .filter((v) => v && typeof v === 'string')
          .map(
            (v) => `${optionName}${PRODUCT_OPTION_PAIR_SEPARATOR}${v}`
          );

        if (!encodedValues.length) continue;

        const clause = {
          terms: { 'optionPairs.keyword': encodedValues },
        };

        (shouldPreserve(optionName) ? postFilterQueries : mustQueries).push(clause);
      }
    }

    //
    // Variant Option Keys
    //
    if (hasValues(sanitizedFilters?.variantOptionKeys)) {
      mustQueries.push({
        terms: {
          'variantOptionKeys.keyword': sanitizedFilters.variantOptionKeys!,
        },
      });
    }

    //
    // Product-level Price Range
    //
    if (
      sanitizedFilters?.priceMin !== undefined ||
      sanitizedFilters?.priceMax !== undefined
    ) {
      const rangeMust: any[] = [];

      if (sanitizedFilters.priceMin !== undefined) {
        rangeMust.push({
          range: { maxPrice: { gte: sanitizedFilters.priceMin } },
        });
      }

      if (sanitizedFilters.priceMax !== undefined) {
        rangeMust.push({
          range: { minPrice: { lte: sanitizedFilters.priceMax } },
        });
      }

      mustQueries.push({ bool: { must: rangeMust } });
    }

    //
    // Variant Price Range (nested)
    //
    if (
      sanitizedFilters?.variantPriceMin !== undefined ||
      sanitizedFilters?.variantPriceMax !== undefined
    ) {
      const range: any = {};
      if (sanitizedFilters.variantPriceMin !== undefined)
        range.gte = sanitizedFilters.variantPriceMin;
      if (sanitizedFilters.variantPriceMax !== undefined)
        range.lte = sanitizedFilters.variantPriceMax;

      mustQueries.push({
        nested: {
          path: 'variants',
          query: {
            range: { 'variants.price.numeric': range },
          },
        },
      });
    }

    //
    // Variant SKU Match (nested)
    //
    if (hasValues(sanitizedFilters?.variantSkus)) {
      mustQueries.push({
        nested: {
          path: 'variants',
          query: {
            terms: { 'variants.sku': sanitizedFilters.variantSkus! },
          },
        },
      });
    }

    //
    // Final Search Query
    //
    const query =
      mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };

    //
    // -----------------------
    //   AGGREGATIONS
    // -----------------------
    //

    const enabledAggregations = getEnabledAggregations(filterConfig);
    const aggs: Record<string, any> = {};

    const addTermsAgg = (name: string, field: string, sizeMult = 1) => {
      aggs[name] = {
        terms: {
          field,
          size: DEFAULT_BUCKET_SIZE * sizeMult,
          order: { _count: 'desc' as const },
        },
      };
    };

    if (enabledAggregations.standard.has('vendors'))
      addTermsAgg('vendors', 'vendor.keyword');

    if (enabledAggregations.standard.has('productTypes'))
      addTermsAgg('productTypes', 'productType.keyword');

    if (enabledAggregations.standard.has('tags'))
      addTermsAgg('tags', 'tags.keyword', 2);

    if (enabledAggregations.standard.has('collections'))
      addTermsAgg('collections', 'collections.keyword', 2);

    //
    // Variant Option Aggregations
    //
    if (enabledAggregations.variantOptions.size > 0) {
      for (const [aggName, optionType] of enabledAggregations.variantOptions) {
        aggs[aggName] = {
          filter: {
            prefix: {
              'optionPairs.keyword': `${optionType}${PRODUCT_OPTION_PAIR_SEPARATOR}`,
            },
          },
          aggs: {
            values: {
              terms: {
                field: 'optionPairs.keyword',
                size: DEFAULT_BUCKET_SIZE * 2,
                order: { _count: 'desc' as const },
              },
            },
          },
        };
      }
    } else {
      aggs.optionPairs = {
        terms: {
          field: 'optionPairs.keyword',
          size: DEFAULT_BUCKET_SIZE * 5,
          order: { _count: 'desc' as const },
        },
      };
    }

    //
    // Price Range Stats Aggregations
    //
    if (enabledAggregations.standard.has('priceRange')) {
      aggs.priceRange = { stats: { field: 'minPrice' } };
    }

    if (enabledAggregations.standard.has('variantPriceRange')) {
      aggs.variantPriceRange = {
        nested: { path: 'variants' },
        aggs: {
          priceStats: {
            stats: { field: 'variants.price.numeric' },
          },
        },
      };
    }

    //
    // Execute Query
    //
    const response = await this.esClient.search<unknown, FacetAggregations>({
      index,
      size: 0,
      track_total_hits: false,
      request_cache: true,
      query,
      post_filter:
        postFilterQueries.length > 0
          ? { bool: { must: postFilterQueries } }
          : undefined,
      aggs,
    });

    //
    // Process Aggregations
    //
    const aggregations = (response.aggregations || {}) as any;

    const combinedOptionPairs =
      enabledAggregations.variantOptions.size > 0
        ? {
          buckets: Array.from(enabledAggregations.variantOptions.keys()).flatMap(
            (aggName) => aggregations[aggName]?.values?.buckets || []
          ),
        }
        : aggregations.optionPairs || { buckets: [] };

    //
    // Return Facets
    //
    return {
      index,
      aggregations: {
        vendors:
          aggregations.vendors && enabledAggregations.standard.has('vendors')
            ? aggregations.vendors
            : { buckets: [] },

        productTypes:
          aggregations.productTypes &&
            enabledAggregations.standard.has('productTypes')
            ? aggregations.productTypes
            : { buckets: [] },

        tags:
          aggregations.tags && enabledAggregations.standard.has('tags')
            ? aggregations.tags
            : { buckets: [] },

        collections:
          aggregations.collections &&
            enabledAggregations.standard.has('collections')
            ? aggregations.collections
            : { buckets: [] },

        optionPairs: combinedOptionPairs,

        priceRange:
          enabledAggregations.standard.has('priceRange') &&
            aggregations.priceRange &&
            (aggregations.priceRange.min != null ||
              aggregations.priceRange.max != null)
            ? {
              min: aggregations.priceRange.min ?? 0,
              max: aggregations.priceRange.max ?? 0,
            }
            : undefined,

        variantPriceRange:
          enabledAggregations.standard.has('variantPriceRange') &&
            aggregations.variantPriceRange?.priceStats &&
            (aggregations.variantPriceRange.priceStats.min != null ||
              aggregations.variantPriceRange.priceStats.max != null)
            ? {
              min: aggregations.variantPriceRange.priceStats.min ?? 0,
              max: aggregations.variantPriceRange.priceStats.max ?? 0,
            }
            : undefined,
      },
    };
  }



  /**
   * Search products with filters
   * Only calculates aggregations for enabled filter options in filterConfig
   */
  async searchProducts(shopDomain: string, filters?: ProductSearchInput, filterConfig?: Filter | null): Promise<ProductSearchResult> {
    const index = PRODUCT_INDEX_NAME(shopDomain);
    const sanitizedFilters = filters ? sanitizeFilterInput(filters) : undefined;

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const from = (page - 1) * limit;

    logger.info('[searchProducts] Starting search', {
      shopDomain,
      index,
      page,
      limit,
      from,
      hasFilters: !!filters,
    });

    const mustQueries: any[] = [];
    const postFilterQueries: any[] = [];
    const preserveFilters = new Set(
      (sanitizedFilters?.preserveFilters || []).map((key) => key.toLowerCase())
    );
    const preserveAll = preserveFilters.has('__all__');
    const shouldPreserve = (key: string) => preserveAll || preserveFilters.has(key.toLowerCase());

    if (sanitizedFilters?.search) {
      mustQueries.push({
        multi_match: {
          query: sanitizedFilters.search,
          fields: ['title^3', 'vendor^2', 'productType', 'tags'],
          type: 'best_fields',
          operator: 'and',
        },
      });
    }

    if (hasValues(sanitizedFilters?.vendors)) {
      const clause = { terms: { 'vendor.keyword': sanitizedFilters!.vendors } };
      if (shouldPreserve('vendors')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.productTypes)) {
      const clause = { terms: { 'productType.keyword': sanitizedFilters!.productTypes } };
      if (shouldPreserve('productTypes')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.tags)) {
      const clause = { terms: { 'tags.keyword': sanitizedFilters!.tags } };
      if (shouldPreserve('tags')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.collections)) {
      const clause = { terms: { 'collections.keyword': sanitizedFilters!.collections } };
      if (shouldPreserve('collections')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    // Options filter - encode option pairs
    // AND operation: Different option names (handles/IDs) create separate must queries (AND)
    // OR operation: Multiple values for the same option use terms query (OR)
    // Example: ?pr_a3k9x=M,XXXL&op_rok5d=Red,Blue
    //   - pr_a3k9x=M OR pr_a3k9x=XXXL (same handle, multiple values = OR)
    //   - AND op_rok5d=Red OR op_rok5d=Blue (same handle, multiple values = OR)
    //   - Result: (Size=M OR Size=XXXL) AND (Color=Red OR Color=Blue)
    if (sanitizedFilters?.options) {
      for (const [optionName, values] of Object.entries(sanitizedFilters.options)) {
        if (!Array.isArray(values) || !hasValues(values)) continue;
        const encodedValues = values
          .filter((value) => typeof value === 'string' && value.length > 0)
          .map((value) => `${optionName}${PRODUCT_OPTION_PAIR_SEPARATOR}${value}`);

        if (!encodedValues.length) continue;

        const termsQuery = {
          terms: { 'optionPairs.keyword': encodedValues },
        };

        if (shouldPreserve(optionName)) {
          postFilterQueries.push(termsQuery);
        } else {
          mustQueries.push(termsQuery);
        }
      }
    }

    if (hasValues(sanitizedFilters?.variantOptionKeys)) {
      mustQueries.push({
        terms: { 'variantOptionKeys.keyword': sanitizedFilters!.variantOptionKeys },
      });
    }

    // Product price range filter (minPrice/maxPrice fields)
    if (sanitizedFilters?.priceMin !== undefined || sanitizedFilters?.priceMax !== undefined) {
      const rangeQuery: any = {};
      if (sanitizedFilters.priceMin !== undefined) {
        rangeQuery.gte = sanitizedFilters.priceMin;
      }
      if (sanitizedFilters.priceMax !== undefined) {
        rangeQuery.lte = sanitizedFilters.priceMax;
      }
      if (Object.keys(rangeQuery).length > 0) {
        // Use should with nested query to match if any variant price is in range
        // OR use minPrice/maxPrice fields directly
        mustQueries.push({
          bool: {
            should: [
              { range: { minPrice: rangeQuery } },
              { range: { maxPrice: rangeQuery } },
            ],
            minimum_should_match: 1,
          },
        });
      }
    }

    // Variant price range filter (variant.price)
    if (sanitizedFilters?.variantPriceMin !== undefined || sanitizedFilters?.variantPriceMax !== undefined) {
      const rangeQuery: any = {};
      if (sanitizedFilters.variantPriceMin !== undefined) {
        rangeQuery.gte = sanitizedFilters.variantPriceMin;
      }
      if (sanitizedFilters.variantPriceMax !== undefined) {
        rangeQuery.lte = sanitizedFilters.variantPriceMax;
      }
      if (Object.keys(rangeQuery).length > 0) {
        // Use nested query to filter variants by price
        mustQueries.push({
          nested: {
            path: 'variants',
            query: {
              range: {
                'variants.price.numeric': rangeQuery,
              },
            },
          },
        });
      }
    }

    // Variant SKU filter
    if (hasValues(sanitizedFilters?.variantSkus)) {
      mustQueries.push({
        nested: {
          path: 'variants',
          query: {
            terms: { 'variants.sku': sanitizedFilters!.variantSkus },
          },
        },
      });
    }

    // Hide out of stock items (from filter configuration settings)
    if (filters?.hideOutOfStockItems) {
      // Filter to only products with at least one variant that has inventory
      mustQueries.push({
        nested: {
          path: 'variants',
          query: {
            bool: {
              should: [
                // Variant has availableForSale = true
                { term: { 'variants.availableForSale': true } },
                // OR variant has inventoryQuantity > 0
                { range: { 'variants.inventoryQuantity': { gt: 0 } } },
                // OR variant has sellableOnlineQuantity > 0
                { range: { 'variants.sellableOnlineQuantity': { gt: 0 } } },
              ],
              minimum_should_match: 1,
            },
          },
        },
      });
    }

    const query = mustQueries.length ? { bool: { must: mustQueries } } : { match_all: {} };

    // Build sort
    let sort: any[] = [];
    if (filters?.sort) {
      const [field, order] = filters.sort.split(':');
      if (field && order) {
        const sortField = field === 'price' ? 'minPrice' : field;
        sort.push({ [sortField]: order });
      } else {
        sort.push({ createdAt: 'desc' });
      }
    } else {
      if (filters?.search) {
        sort.push({ _score: 'desc' });
      } else {
        sort.push({ createdAt: 'desc' });
      }
    }

    // Build aggregations if filters are requested
    // Only include aggregations for enabled filter options
    const enabledAggregations = filters?.includeFilters ? getEnabledAggregations(filterConfig) : { standard: new Set<string>(), variantOptions: new Map<string, string>() };
    const aggs = filters?.includeFilters && (enabledAggregations.standard.size > 0 || enabledAggregations.variantOptions.size > 0)
      ? (() => {
        const aggregationObject: any = {};

        if (enabledAggregations.standard.has('vendors')) {
          aggregationObject.vendors = {
            terms: {
              field: 'vendor.keyword',
              size: DEFAULT_BUCKET_SIZE,
              order: { _count: 'desc' as const },
            },
          };
        }

        if (enabledAggregations.standard.has('productTypes')) {
          aggregationObject.productTypes = {
            terms: {
              field: 'productType.keyword',
              size: DEFAULT_BUCKET_SIZE,
              order: { _count: 'desc' as const },
            },
          };
        }

        if (enabledAggregations.standard.has('tags')) {
          aggregationObject.tags = {
            terms: {
              field: 'tags.keyword', // Use keyword field for aggregations
              size: DEFAULT_BUCKET_SIZE * 2,
              order: { _count: 'desc' as const },
            },
          };
        }

        if (enabledAggregations.standard.has('collections')) {
          aggregationObject.collections = {
            terms: {
              field: 'collections.keyword', // Use keyword field for aggregations
              size: DEFAULT_BUCKET_SIZE * 2,
              order: { _count: 'desc' as const },
            },
          };
        }

        if (enabledAggregations.variantOptions.size > 0) {
          // Build specific variant option aggregations
          for (const [aggName, optionType] of enabledAggregations.variantOptions.entries()) {
            aggregationObject[aggName] = {
              filter: {
                prefix: {
                  'optionPairs.keyword': `${optionType}${PRODUCT_OPTION_PAIR_SEPARATOR}`,
                },
              },
              aggs: {
                values: {
                  terms: {
                    field: 'optionPairs.keyword',
                    size: DEFAULT_BUCKET_SIZE * 2,
                    order: { _count: 'desc' as const },
                  },
                },
              },
            };
          }
        } else {
          // Fallback: fetch all optionPairs
          aggregationObject.optionPairs = {
            terms: {
              field: 'optionPairs.keyword',
              size: DEFAULT_BUCKET_SIZE * 5,
              order: { _count: 'desc' as const },
            },
          };
        }

        // Price range stats aggregation (product-level: minPrice/maxPrice)
        if (enabledAggregations.standard.has('priceRange')) {
          aggregationObject.priceRange = {
            stats: {
              field: 'minPrice',
            },
          };
        }

        // Variant price range stats aggregation (variant.price)
        if (enabledAggregations.standard.has('variantPriceRange')) {
          aggregationObject.variantPriceRange = {
            nested: {
              path: 'variants',
            },
            aggs: {
              priceStats: {
                stats: {
                  field: 'variants.price.numeric',
                },
              },
            },
          };
        }

        return Object.keys(aggregationObject).length > 0 ? aggregationObject : undefined;
      })()
      : undefined;

    logger.debug('[searchProducts] Executing ES query', {
      index,
      from,
      size: limit,
      queryType: mustQueries.length > 0 ? 'filtered' : 'match_all',
      sortFields: sort.map((s: any) => Object.keys(s)[0]),
    });

    // Check if index exists
    try {
      const indexExists = await this.esClient.indices.exists({ index });
      logger.debug('[searchProducts] Index check', {
        index,
        exists: indexExists,
      });

      if (!indexExists) {
        logger.warn('[searchProducts] Index does not exist', { index, shopDomain });
        return {
          products: [],
          total: 0,
          page: 1,
          limit,
          totalPages: 0,
        };
      }
    } catch (error: any) {
      logger.error('[searchProducts] Error checking index existence', {
        index,
        error: error?.message || error,
      });
    }

    let response;
    try {
      response = await this.esClient.search<shopifyProduct, FacetAggregations>({
        index,
        from,
        size: limit,
        query,
        sort,
        track_total_hits: true,
        aggs,
        post_filter: postFilterQueries.length
          ? {
            bool: {
              must: postFilterQueries,
            },
          }
          : undefined,
      });
    } catch (error: any) {
      logger.error('[searchProducts] ES query failed', {
        index,
        error: error?.message || error,
        statusCode: error?.statusCode,
      });
      throw error;
    }

    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value || 0;
    const totalPages = Math.ceil(total / limit);

    logger.info('[searchProducts] ES query completed', {
      index,
      total,
      hitsReturned: response.hits.hits.length,
      totalPages,
    });

    const rawProducts = response.hits.hits.map((hit) => hit._source as shopifyProduct);
    const storefrontProducts = filterProductsForStorefront(rawProducts, filters?.fields);

    const result: ProductSearchResult = {
      products: storefrontProducts,
      total,
      page,
      limit,
      totalPages,
    };

    if (filters?.includeFilters && response.aggregations) {
      // Process aggregations - handle variant option-specific aggregations
      const aggregations = { ...response.aggregations } as any;

      // Process variant option-specific aggregations (option.Color, option.Size, etc.)
      let combinedOptionPairs: TermsAggregation;

      if (enabledAggregations.variantOptions.size > 0) {
        // Build from specific variant option aggregations
        const optionPairsBuckets: AggregationBucket[] = [];

        for (const [aggName, optionType] of enabledAggregations.variantOptions.entries()) {
          const variantAgg = aggregations[aggName];
          if (variantAgg?.values?.buckets) {
            optionPairsBuckets.push(...variantAgg.values.buckets);
          }
        }

        combinedOptionPairs = {
          buckets: optionPairsBuckets,
        };
        aggregations.optionPairs = combinedOptionPairs;
      } else {
        // Use all optionPairs (fallback)
        combinedOptionPairs = aggregations.optionPairs || { buckets: [] };
      }

      // Format price range aggregations (similar to getFacets)
      const priceRangeStats = aggregations.priceRange;
      const variantPriceRangeStats = aggregations.variantPriceRange?.priceStats;

      // Build formatted aggregations with price ranges
      const formattedAggregations: FacetAggregations = {
        ...aggregations,
        priceRange: enabledAggregations.standard.has('priceRange') && priceRangeStats && (priceRangeStats.min !== null || priceRangeStats.max !== null)
          ? {
            min: priceRangeStats.min ?? 0,
            max: priceRangeStats.max ?? 0,
          }
          : undefined,
        variantPriceRange: enabledAggregations.standard.has('variantPriceRange') && variantPriceRangeStats && (variantPriceRangeStats.min !== null || variantPriceRangeStats.max !== null)
          ? {
            min: variantPriceRangeStats.min ?? 0,
            max: variantPriceRangeStats.max ?? 0,
          }
          : undefined,
      };

      result.filters = formattedAggregations;
    }

    return result;
  }
}

