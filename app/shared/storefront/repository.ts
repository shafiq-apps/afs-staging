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
import { mapOptionNameToHandle } from './filter-config.helper';

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

    /**
     * Build base filter queries (common to all aggregations)
     * These filters are always included in aggregation queries
     */
    const buildBaseMustQueries = (excludeFilterType?: string): any[] => {
      const baseMustQueries: any[] = [];

      /** Search */
      if (sanitizedFilters?.search) {
        baseMustQueries.push({
          multi_match: {
            query: sanitizedFilters.search,
            fields: ['title^3', 'vendor^2', 'productType', 'tags'],
            type: 'best_fields',
            operator: 'and',
          },
        });
      }

      /** Simple terms filters - exclude the filter type being aggregated */
      const simpleFilters: Record<string, { field: string; values?: any[] }> = {
        vendors: { field: 'vendor.keyword', values: sanitizedFilters?.vendors },
        productTypes: {
          field: 'productType.keyword',
          values: sanitizedFilters?.productTypes,
        },
        tags: { field: 'tags', values: sanitizedFilters?.tags },
        collections: {
          field: 'collections',
          values: sanitizedFilters?.collections,
        },
      };

      for (const key in simpleFilters) {
        // Skip if this is the filter type being aggregated
        if (excludeFilterType === key) continue;
        
        const { field, values } = simpleFilters[key];
        if (hasValues(values)) {
          baseMustQueries.push({ terms: { [field]: values! } });
        }
      }

      /** Variant Options - exclude the option being aggregated */
      if (sanitizedFilters?.options) {
        for (const [optionKey, values] of Object.entries(sanitizedFilters.options)) {
          // Check if this option should be excluded
          // excludeFilterType might be optionType (e.g., "Color"), but optionKey might be a handle
          let shouldExclude = false;
          if (excludeFilterType === optionKey) {
            shouldExclude = true;
          } else if (excludeFilterType && filterConfig) {
            // Check if optionKey (handle) maps to excludeFilterType (optionType)
            const option = filterConfig.options?.find(opt => opt.handle === optionKey);
            if (option && option.optionType?.toLowerCase() === excludeFilterType.toLowerCase()) {
              shouldExclude = true;
            }
          }
          
          if (shouldExclude) continue;
          
          if (!hasValues(values)) continue;

          const encodedValues = (values as string[])
            .filter((v) => v && typeof v === 'string')
            .map((v) => `${optionKey}${PRODUCT_OPTION_PAIR_SEPARATOR}${v}`);

          if (!encodedValues.length) continue;

          baseMustQueries.push({
            terms: { 'optionPairs': encodedValues },
          });
        }
      }

      /** Variant Option Keys */
      if (hasValues(sanitizedFilters?.variantOptionKeys)) {
        baseMustQueries.push({
          terms: {
            'variantOptionKeys.keyword': sanitizedFilters.variantOptionKeys!,
          },
        });
      }

      /** Product-level Price Range */
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
        if (rangeMust.length > 0) {
          baseMustQueries.push({ bool: { must: rangeMust } });
        }
      }

      /** Variant Price Range */
      if (
        sanitizedFilters?.variantPriceMin !== undefined ||
        sanitizedFilters?.variantPriceMax !== undefined
      ) {
        const range: any = {};
        if (sanitizedFilters.variantPriceMin !== undefined)
          range.gte = sanitizedFilters.variantPriceMin;
        if (sanitizedFilters.variantPriceMax !== undefined)
          range.lte = sanitizedFilters.variantPriceMax;

        baseMustQueries.push({
          nested: {
            path: 'variants',
            query: {
              range: { 'variants.price.numeric': range },
            },
          },
        });
      }

      /** Variant SKU Match */
      if (hasValues(sanitizedFilters?.variantSkus)) {
        baseMustQueries.push({
          nested: {
            path: 'variants',
            query: {
              terms: { 'variants.sku': sanitizedFilters.variantSkus! },
            },
          },
        });
      }

      // Always include these filters
      baseMustQueries.push({ term: { 'status': 'ACTIVE' } });
      baseMustQueries.push({ term: { 'documentType': 'product' } });

      return baseMustQueries;
    };

    /**
     * Build post_filter for a specific filter type (to exclude it from aggregations)
     */
    const buildPostFilter = (filterType: string): any[] | undefined => {
      const postFilterQueries: any[] = [];

      // Handle standard filters
      const simpleFilters: Record<string, { field: string; values?: any[] }> = {
        vendors: { field: 'vendor.keyword', values: sanitizedFilters?.vendors },
        productTypes: {
          field: 'productType.keyword',
          values: sanitizedFilters?.productTypes,
        },
        tags: { field: 'tags', values: sanitizedFilters?.tags },
        collections: {
          field: 'collections',
          values: sanitizedFilters?.collections,
        },
      };

      if (simpleFilters[filterType] && hasValues(simpleFilters[filterType].values)) {
        const { field, values } = simpleFilters[filterType];
        postFilterQueries.push({ terms: { [field]: values! } });
      }

      // Handle option filters - need to match by optionType
      // filterType here is the optionType (e.g., "Color", "Size")
      // but options in sanitizedFilters are keyed by option name (which might be handle or optionType)
      if (sanitizedFilters?.options) {
        for (const [optionKey, values] of Object.entries(sanitizedFilters.options)) {
          // Check if this option matches the filterType (optionType)
          // We need to check if optionKey (which might be a handle) maps to this optionType
          let matches = false;
          if (optionKey === filterType) {
            matches = true;
          } else if (filterConfig) {
            // Try to find the option by handle and check if optionType matches
            const option = filterConfig.options?.find(opt => opt.handle === optionKey);
            if (option && option.optionType?.toLowerCase() === filterType.toLowerCase()) {
              matches = true;
            }
          }

          if (matches && hasValues(values)) {
            const encodedValues = (values as string[])
              .filter((v) => v && typeof v === 'string')
              .map((v) => `${optionKey}${PRODUCT_OPTION_PAIR_SEPARATOR}${v}`);
            if (encodedValues.length > 0) {
              postFilterQueries.push({ terms: { 'optionPairs': encodedValues } });
            }
          }
        }
      }

      return postFilterQueries.length > 0 ? postFilterQueries : undefined;
    };

    //
    // -----------------------
    //   AGGREGATIONS (Auto-Exclude Approach)
    // -----------------------
    //

    const enabledAggregations = getEnabledAggregations(filterConfig, includeAllOptions);
    const allAggregations: Record<string, any> = {};

    /**
     * Build aggregation query for a specific filter type
     * Excludes that filter type from must queries, includes it in post_filter
     */
    const buildAggregationQuery = (filterType: string, aggConfig: { name: string; field: string; sizeMult?: number; type?: 'terms' | 'stats' | 'option' }) => {
      const mustQueries = buildBaseMustQueries(filterType);
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      const postFilterQueries = buildPostFilter(filterType);
      
      const aggs: Record<string, any> = {};
      
      if (aggConfig.type === 'terms') {
        aggs[aggConfig.name] = {
          terms: {
            field: aggConfig.field,
            size: DEFAULT_BUCKET_SIZE * (aggConfig.sizeMult || 1),
            order: { _count: 'desc' as const },
          },
        };
      } else if (aggConfig.type === 'stats') {
        aggs[aggConfig.name] = { stats: { field: aggConfig.field } };
      } else if (aggConfig.type === 'option') {
        // Option aggregation with prefix filter
        aggs[aggConfig.name] = {
          filter: {
            prefix: {
              'optionPairs': `${aggConfig.field}${PRODUCT_OPTION_PAIR_SEPARATOR}`,
            },
          },
          aggs: {
            values: {
              terms: {
                field: 'optionPairs',
                size: DEFAULT_BUCKET_SIZE * 2,
                order: { _count: 'desc' as const },
              },
            },
          },
        };
      }

      return {
        index,
        size: 0,
        track_total_hits: false,
        query,
        post_filter: postFilterQueries ? { bool: { must: postFilterQueries } } : undefined,
        aggs,
      };
    };

    // Build queries for each aggregation type
    const aggregationQueries: Array<{ filterType: string; query: any }> = [];

    // Standard aggregations
    if (enabledAggregations.standard.has('vendors')) {
      aggregationQueries.push({
        filterType: 'vendors',
        query: buildAggregationQuery('vendors', { name: 'vendors', field: 'vendor.keyword', type: 'terms' }),
      });
    }

    if (enabledAggregations.standard.has('productTypes')) {
      aggregationQueries.push({
        filterType: 'productTypes',
        query: buildAggregationQuery('productTypes', { name: 'productTypes', field: 'productType.keyword', type: 'terms' }),
      });
    }

    if (enabledAggregations.standard.has('tags')) {
      aggregationQueries.push({
        filterType: 'tags',
        query: buildAggregationQuery('tags', { name: 'tags', field: 'tags', sizeMult: 2, type: 'terms' }),
      });
    }

    if (enabledAggregations.standard.has('collections')) {
      aggregationQueries.push({
        filterType: 'collections',
        query: buildAggregationQuery('collections', { name: 'collections', field: 'collections', sizeMult: 2, type: 'terms' }),
      });
    }

    // Variant option aggregations
    if (enabledAggregations.variantOptions.size > 0) {
      for (const [aggName, optionType] of enabledAggregations.variantOptions) {
        aggregationQueries.push({
          filterType: optionType, // Use optionType as the filter type to exclude
          query: buildAggregationQuery(optionType, { name: aggName, field: optionType, type: 'option' }),
        });
      }
    } else if (!filterConfig || includeAllOptions) {
      // Fallback: aggregate all optionPairs if no config
      const mustQueries = buildBaseMustQueries();
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      allAggregations.optionPairs = {
        terms: {
          field: 'optionPairs',
          size: DEFAULT_BUCKET_SIZE * 5,
          order: { _count: 'desc' as const },
        },
      };
      aggregationQueries.push({
        filterType: 'optionPairs',
        query: {
          index,
          size: 0,
          track_total_hits: false,
          query,
          aggs: { optionPairs: allAggregations.optionPairs },
        },
      });
    }

    // Price range aggregations (these don't need auto-exclude as they're stats)
    if (enabledAggregations.standard.has('priceRange')) {
      const mustQueries = buildBaseMustQueries();
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      allAggregations.priceRange = { stats: { field: 'minPrice' } };
      aggregationQueries.push({
        filterType: 'priceRange',
        query: {
          index,
          size: 0,
          track_total_hits: false,
          query,
          aggs: { priceRange: allAggregations.priceRange },
        },
      });
    }

    if (enabledAggregations.standard.has('variantPriceRange')) {
      const mustQueries = buildBaseMustQueries();
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      allAggregations.variantPriceRange = {
        nested: { path: 'variants' },
        aggs: {
          priceStats: {
            stats: { field: 'variants.price.numeric' },
          },
        },
      };
      aggregationQueries.push({
        filterType: 'variantPriceRange',
        query: {
          index,
          size: 0,
          track_total_hits: false,
          query,
          aggs: { variantPriceRange: allAggregations.variantPriceRange },
        },
      });
    }

    // Execute all aggregation queries in parallel using msearch
    logger.debug('Executing aggregation queries with auto-exclude', {
      shop: shopDomain,
      index,
      aggregationQueriesCount: aggregationQueries.length,
      enabledAggregations: {
        standard: Array.from(enabledAggregations.standard),
        variantOptions: Array.from(enabledAggregations.variantOptions.keys()),
      },
    });

    // Build msearch body (alternating header and body)
    const msearchBody: any[] = [];
    for (const { query } of aggregationQueries) {
      // Header: index and request_cache (if supported)
      const header: any = { index: query.index };
      // Note: request_cache is not supported in msearch body, only in regular search
      msearchBody.push(header);
      
      // Body: search request
      const body: any = {
        size: query.size,
        track_total_hits: query.track_total_hits,
        query: query.query,
        aggs: query.aggs,
      };
      if (query.post_filter) {
        body.post_filter = query.post_filter;
      }
      msearchBody.push(body);
    }

    // Execute msearch
    const msearchResponse = msearchBody.length > 0
      ? await this.esClient.msearch<unknown, FacetAggregations>({ body: msearchBody })
      : { responses: [] };

    // Merge aggregation results
    const mergedAggregations: Record<string, any> = {};
    for (let i = 0; i < aggregationQueries.length; i++) {
      const response = msearchResponse.responses[i];
      if (response && !response.error && response.aggregations) {
        Object.assign(mergedAggregations, response.aggregations);
      }
    }

    logger.debug('Aggregation queries completed', {
      shop: shopDomain,
      mergedAggregationsKeys: Object.keys(mergedAggregations),
      responsesCount: msearchResponse.responses.length,
    });

    // Use merged aggregations for processing
    const response = {
      aggregations: mergedAggregations,
      hits: { total: 0 },
    } as any;

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
    // keep now contains handles (e.g., "pr_a3k9x", "sd5d3s") instead of option names
    const keep = new Set(
      (sanitizedFilters?.keep || []).map((key) => key.toLowerCase())
    );
    const keepAll = keep.has('__all__');
    
    // Helper to check if a filter should be kept
    // For standard filters, check by key directly
    // For option filters, map option name back to handle and check
    const shouldKeep = (key: string, isOptionFilter: boolean = false) => {
      if (keepAll) return true;
      
      const lowerKey = key.toLowerCase();
      
      // For standard filters, check directly
      if (!isOptionFilter) {
        return keep.has(lowerKey);
      }
      
      // For option filters, we need to map option name back to handle
      // because keep contains handles, but key is the option name
      if (filterConfig) {
        const handle = mapOptionNameToHandle(filterConfig, key);
        if (handle) {
          return keep.has(handle.toLowerCase());
        }
      }
      
      return false;
    };

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
      if (shouldKeep('vendors')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.productTypes)) {
      const clause = { terms: { 'productType.keyword': sanitizedFilters!.productTypes } };
      if (shouldKeep('productTypes')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.tags)) {
      // Tags is an array field, use directly (not .keyword)
      const clause = { terms: { 'tags': sanitizedFilters!.tags } };
      if (shouldKeep('tags')) {
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
      if (shouldKeep('collections')) {
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
        if (shouldKeep(optionName, true) || keepAll) {
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
      term: { 'status': 'ACTIVE' },
    });

    // Filter for product documentType only
    mustQueries.push({
      term: { 'documentType': 'product' },
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
      // Handle new format: title-ascending, title-descending
      else if (sortParam === 'title-ascending') {
        sort.push({ 'title.keyword': 'asc' });
      }
      else if (sortParam === 'title-descending') {
        sort.push({ 'title.keyword': 'desc' });
      }
      // Handle new format: price-ascending, price-descending
      else if (sortParam === 'price-ascending') {
        sort.push({ minPrice: 'asc' });
      }
      else if (sortParam === 'price-descending') {
        sort.push({ maxPrice: 'desc' });
      }
      // Handle new format: created-ascending, created-descending
      else if (sortParam === 'created-ascending') {
        sort.push({ createdAt: 'asc' });
      }
      else if (sortParam === 'created-descending') {
        sort.push({ createdAt: 'desc' });
      }
      // Handle legacy price-based sorting (backward compatibility)
      else if (sortParam === 'price:asc' || sortParam === 'price-asc' || sortParam === 'price_low_to_high') {
        sort.push({ minPrice: 'asc' });
      } 
      else if (sortParam === 'price:desc' || sortParam === 'price-desc' || sortParam === 'price_high_to_low') {
        sort.push({ maxPrice: 'desc' });
      }
      // Handle legacy createdAt-based sorting (backward compatibility)
      else if (sortParam === 'created:desc' || sortParam === 'created-desc' || sortParam === 'newest') {
        sort.push({ createdAt: 'desc' });
      }
      else if (sortParam === 'created:asc' || sortParam === 'created-asc' || sortParam === 'oldest') {
        sort.push({ createdAt: 'asc' });
      }
      // Handle legacy title-based sorting (backward compatibility)
      else if (sortParam === 'title:asc' || sortParam === 'title-asc' || sortParam === 'name_asc') {
        sort.push({ 'title.keyword': 'asc' });
      }
      else if (sortParam === 'title:desc' || sortParam === 'title-desc' || sortParam === 'name_desc') {
        sort.push({ 'title.keyword': 'desc' });
      }
      // Handle legacy format: "field:order"
      else {
        const [field, order] = filters.sort.split(':');
        if (field && order) {
          // Map field names to correct ES field names
          let sortField;
          if (field === 'price') {
            sortField = order === 'asc' ? 'minPrice' : 'maxPrice';
          } else if (field === 'title') {
            sortField = 'title.keyword'; // Use keyword field for text fields
          } else {
            sortField = field;
          }
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

