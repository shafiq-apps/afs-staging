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

      // Derive variant option key at runtime to ensure perfect ES matching
      // This uses the exact name that matches ES storage (optionPairs format)
      const derivedVariantOptionKey = deriveVariantOptionKey(option);
      const variantOptionKey = derivedVariantOptionKey || optionType;
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
/**
 * Derive variantOptionKey at runtime from filter config option
 * This ensures perfect matching with ES storage where optionPairs are stored as "OptionName::Value"
 * 
 * Logic:
 * 1. If variantOptionKey is explicitly set, use it (exact match with ES)
 * 2. If baseOptionType === "OPTION" (variant option), use optionType (matches ES storage)
 * 3. For standard filters, variantOptionKey is not applicable
 */
function deriveVariantOptionKey(option: Filter['options'][number]): string | null {
  const optionSettings = option.optionSettings || {};
  
  // Priority 1: If variantOptionKey is explicitly set, use it (exact match with ES)
  if (optionSettings.variantOptionKey) {
    return optionSettings.variantOptionKey.trim();
  }
  
  // Priority 2: If baseOptionType === "OPTION", use optionType (matches ES storage)
  // ES stores optionPairs as "OptionName::Value" where OptionName is from product data
  // For variant options, optionType is the exact name that matches ES storage
  const baseOptionType = optionSettings.baseOptionType?.trim().toUpperCase();
  if (baseOptionType === 'OPTION') {
    const optionType = option.optionType?.trim();
    if (optionType) {
      return optionType; // This matches ES storage exactly
    }
  }
  
  // For standard filters (VENDOR, PRODUCT_TYPE, etc.), variantOptionKey is not applicable
  return null;
}

function getVariantOptionKeys(filterConfig: Filter | null): Set<string> {
  const variantOptionKeys = new Set<string>();

  if (!filterConfig || !filterConfig.options) {
    return variantOptionKeys;
  }

  for (const option of filterConfig.options) {
    // Only include published options
    if (option.status !== 'PUBLISHED') continue;

    // Derive variantOptionKey at runtime to ensure perfect ES matching
    const derivedVariantOptionKey = deriveVariantOptionKey(option);
    
    if (derivedVariantOptionKey) {
      // Use derived variantOptionKey (exact match with ES storage)
      variantOptionKeys.add(derivedVariantOptionKey);
      continue;
    }

    // For standard filters or options without variantOptionKey, skip
    // Standard filters use their own aggregation fields (vendors, productTypes, etc.)
    const optionSettings = option.optionSettings || {};
    const baseOptionType = optionSettings.baseOptionType?.trim().toUpperCase();
    
    // Skip standard filter types (they don't use variantOptionKeys)
    if (baseOptionType && baseOptionType !== 'OPTION') {
      continue;
    }

    // Fallback: If no baseOptionType but optionType exists and it's not a standard type
    const optionType = option.optionType?.trim() || '';
    if (optionType && !STANDARD_FILTER_TYPES.has(optionType.toLowerCase())) {
      variantOptionKeys.add(optionType);
    }
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
    filterConfig?: Filter | null,
    includeAllOptions: boolean = false
  ) {
    const index = PRODUCT_INDEX_NAME(shopDomain);

    // Sanitize filter input to prevent ES query injection
    const sanitizedFilters = filters ? sanitizeFilterInput(filters) : undefined;

    logger.debug('Filter input after sanitization', {
      shop: shopDomain,
      hasFilters: !!filters,
      hasSanitizedFilters: !!sanitizedFilters,
      options: sanitizedFilters?.options,
      collections: sanitizedFilters?.collections,
      vendors: sanitizedFilters?.vendors,
    });

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
      tags: { field: 'tags', values: sanitizedFilters?.tags }, // Tags is an array field
      collections: {
        field: 'collections', // Collections is an array field, use directly (not .keyword)
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

        // optionPairs is an array field (type: keyword), use directly (not .keyword)
        // For array fields in ES, use the field name directly (like tags/collections)
        const clause = {
          terms: { 'optionPairs': encodedValues },
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

    // Filter for ACTIVE products only
    mustQueries.push({
      term: { 'status': 'ACTIVE' },
    });

    // Filter for product documentType only
    mustQueries.push({
      term: { 'documentType': 'product' },
    });

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

    const enabledAggregations = getEnabledAggregations(filterConfig, includeAllOptions);
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
      addTermsAgg('tags', 'tags', 2); // Tags is an array field, use 'tags' not 'tags.keyword'

    if (enabledAggregations.standard.has('collections'))
      addTermsAgg('collections', 'collections', 2);

    //
    // Variant Option Aggregations
    //
    if (enabledAggregations.variantOptions.size > 0) {
      for (const [aggName, optionType] of enabledAggregations.variantOptions) {
        // optionPairs is a keyword array field, use directly (not .keyword)
        aggs[aggName] = {
          filter: {
            prefix: {
              'optionPairs': `${optionType}${PRODUCT_OPTION_PAIR_SEPARATOR}`,
            },
          },
          aggs: {
            values: {
              terms: {
                field: 'optionPairs', // Array field, use directly
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
          field: 'optionPairs', // optionPairs is an array field, use directly (like tags/collections)
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
    logger.debug('Executing ES query', {
      shop: shopDomain,
      index,
      mustQueriesCount: mustQueries.length,
      postFilterQueriesCount: postFilterQueries.length,
      hasQuery: !!query,
      aggregationsCount: Object.keys(aggs).length,
      mustQueries: mustQueries.length > 0 ? JSON.stringify(mustQueries, null, 2) : 'none',
      postFilterQueries: postFilterQueries.length > 0 ? JSON.stringify(postFilterQueries, null, 2) : 'none',
    });

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

    logger.debug('ES query response', {
      shop: shopDomain,
      totalHits: response.hits.total,
      aggregationsKeys: Object.keys(response.aggregations || {}),
      optionPairsBuckets: (response.aggregations as any)?.optionPairs?.buckets?.length || 0,
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
      // Tags is an array field, use directly (not .keyword)
      const clause = { terms: { 'tags': sanitizedFilters!.tags } };
      if (shouldPreserve('tags')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.collections)) {
      // Collections are stored as an array of strings (numeric collection IDs)
      // For array fields in ES, use the field name directly (not .keyword)
      // The terms query will match any value in the array
      const clause = { terms: { 'collections': sanitizedFilters!.collections } };
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

        logger.debug('Encoding option filter for ES query', {
          optionName,
          values,
          encodedValues,
          shop: shopDomain,
          field: 'optionPairs', // Array field, use directly
        });

        // optionPairs is an array field (type: keyword), use directly (not .keyword)
        // For array fields in ES, use the field name directly (like tags/collections)
        const termsQuery = {
          terms: { 'optionPairs': encodedValues },
        };

        // For filters endpoint, we want to preserve option aggregations even when filtering
        // This allows users to see available filter values even when current filters match 0 products
        // Use post_filter for option filters to preserve aggregations
        if (shouldPreserve(optionName) || shouldPreserve('__all__')) {
          postFilterQueries.push(termsQuery);
          logger.debug('Option filter added to post_filter (preserve aggregations)', {
            optionName,
            encodedValues,
          });
        } else {
          mustQueries.push(termsQuery);
          logger.debug('Option filter added to must query (affects aggregations)', {
            optionName,
            encodedValues,
          });
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

    // Filter for ACTIVE products only
    mustQueries.push({
      term: { 'status.keyword': 'ACTIVE' },
    });

    // Filter for product documentType only
    mustQueries.push({
      term: { 'documentType.keyword': 'product' },
    });

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
      const sortParam = filters.sort.toLowerCase().trim();
      
      // Handle "best-selling" sort parameter
      if (sortParam === 'best-selling' || sortParam === 'bestselling') {
        // Sort by bestSellerRank ascending (lower rank = better seller)
        // Use missing: '_last' to handle products without bestSellerRank
        sort.push({ 
          bestSellerRank: { 
            order: 'asc',
            missing: '_last'
          } 
        });
      } 
      // Handle price-based sorting
      else if (sortParam === 'price:asc' || sortParam === 'price-asc' || sortParam === 'price_low_to_high') {
        sort.push({ minPrice: 'asc' });
      } 
      else if (sortParam === 'price:desc' || sortParam === 'price-desc' || sortParam === 'price_high_to_low') {
        sort.push({ maxPrice: 'desc' });
      }
      // Handle createdAt-based sorting (newest/oldest)
      else if (sortParam === 'created:desc' || sortParam === 'created-desc' || sortParam === 'newest') {
        sort.push({ createdAt: 'desc' });
      }
      else if (sortParam === 'created:asc' || sortParam === 'created-asc' || sortParam === 'oldest') {
        sort.push({ createdAt: 'asc' });
      }
      // Handle legacy format: "field:order"
      else {
        const [field, order] = filters.sort.split(':');
        if (field && order) {
          const sortField = field === 'price' ? 'minPrice' : field;
          sort.push({ [sortField]: order });
        } else {
          // Default to bestSellerRank if sort param is invalid
          sort.push({ 
            bestSellerRank: { 
              order: 'asc',
              missing: '_last'
            } 
          });
        }
      }
    } else {
      // Default sorting: bestSellerRank (ascending - lower rank = better seller)
      // If search query exists, combine relevance score with bestSellerRank
      if (filters?.search) {
        sort.push({ _score: 'desc' });
        sort.push({ 
          bestSellerRank: { 
            order: 'asc',
            missing: '_last'
          } 
        });
      } else {
        // Default: sort by bestSellerRank ascending
        sort.push({ 
          bestSellerRank: { 
            order: 'asc',
            missing: '_last'
          } 
        });
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
              field: 'tags', // Tags is an array field, use directly (not .keyword)
              size: DEFAULT_BUCKET_SIZE * 2,
              order: { _count: 'desc' as const },
            },
          };
        }

        if (enabledAggregations.standard.has('collections')) {
          aggregationObject.collections = {
            terms: {
              field: 'collections', // Collections is an array field, use directly (not .keyword)
              size: DEFAULT_BUCKET_SIZE * 2,
              order: { _count: 'desc' as const },
            },
          };
        }

        if (enabledAggregations.variantOptions.size > 0) {
          // Build specific variant option aggregations
          for (const [aggName, optionType] of enabledAggregations.variantOptions.entries()) {
            // optionPairs is a keyword array field, use directly (not .keyword)
            aggregationObject[aggName] = {
              filter: {
                prefix: {
                  'optionPairs': `${optionType}${PRODUCT_OPTION_PAIR_SEPARATOR}`,
                },
              },
              aggs: {
                values: {
                  terms: {
                    field: 'optionPairs', // Array field, use directly
                    size: DEFAULT_BUCKET_SIZE * 2,
                    order: { _count: 'desc' as const },
                  },
                },
              },
            };
          }
        } else {
          // Fallback: fetch all optionPairs
          // optionPairs is a keyword array field, use directly (not .keyword)
          aggregationObject.optionPairs = {
            terms: {
              field: 'optionPairs', // Array field, use directly
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

