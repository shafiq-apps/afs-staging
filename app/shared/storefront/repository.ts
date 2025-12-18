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
const normalizeStatus = (status?: string | null) => (status || '').toUpperCase();
const isPublishedStatus = (status?: string | null) => normalizeStatus(status) === 'PUBLISHED';

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
      standard: new Set(['vendors', 'productTypes', 'tags', 'collections', 'price', 'variantPriceRange']),
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
    'price': 'price',
    'pricerange': 'price',
    'price-range': 'price',
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

  // Always include price and variantPriceRange (fundamental filters)
  standard.add('price');
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
  'price', 'priceRange', 'price_range',
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
    const buildBaseMustQueries = (excludeFilterType?: string, excludeHandle?: string): any[] => {
      const baseMustQueries: any[] = [];
      const handleMapping = sanitizedFilters ? (sanitizedFilters as any).__handleMapping : undefined;
      const handleToValues = handleMapping?.handleToValues || {};

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

      const simpleFilters: Record<string, { field: string; values?: any[]; baseFieldKey: string }> = {
        vendors: { field: 'vendor.keyword', values: sanitizedFilters?.vendors, baseFieldKey: 'VENDOR' },
        productTypes: {
          field: 'productType.keyword',
          values: sanitizedFilters?.productTypes,
          baseFieldKey: 'PRODUCT_TYPE',
        },
        tags: { field: 'tags', values: sanitizedFilters?.tags, baseFieldKey: 'TAGS' },
        collections: {
          field: 'collections',
          values: sanitizedFilters?.collections,
          baseFieldKey: 'COLLECTION',
        },
      };

      for (const key in simpleFilters) {
        // Skip if this is the filter type being aggregated
        if (excludeFilterType === key) {
          // If excluding a specific handle, include values from other handles
          if (excludeHandle) {
            const { field, baseFieldKey } = simpleFilters[key];
            const baseFieldToHandles = handleMapping?.baseFieldToHandles || {};
            const handlesForField = baseFieldToHandles[baseFieldKey] || [];
            
            // Get values from other handles (not the excluded one)
            const otherHandlesValues: string[] = [];
            for (const handle of handlesForField) {
              if (handle !== excludeHandle && handleToValues[handle]) {
                otherHandlesValues.push(...handleToValues[handle]);
              }
            }
            
            logger.debug(`[getFacets] Processing ${key} filter exclusion`, {
              excludeFilterType,
              excludeHandle,
              handlesForField,
              handleToValues,
              otherHandlesValues,
            });
            
            if (otherHandlesValues.length > 0) {
              // Use AND logic for other handles' values
              const clause = {
                bool: {
                  must: [...new Set(otherHandlesValues)].map((value: string) => ({
                    term: { [field]: value }
                  }))
                }
              };
              baseMustQueries.push(clause);
              logger.debug(`[getFacets] Including other handles' values for ${key} (excluding handle ${excludeHandle})`, {
                otherHandlesValues,
                excludedHandle: excludeHandle,
                clause,
              });
            } else {
              logger.debug(`[getFacets] No other handles' values for ${key} (excluding handle ${excludeHandle})`, {
                excludeHandle,
                handlesForField,
              });
            }
          }
          continue;
        }
        
        const { field, values, baseFieldKey } = simpleFilters[key];
        if (hasValues(values)) {
          // Check if multiple handles contributed to this field (AND logic)
          const standardFieldToHandles = handleMapping?.standardFieldToHandles?.[baseFieldKey] || [];
          const hasMultipleHandles = standardFieldToHandles.length > 1;
          
          let clause: any;
          if (hasMultipleHandles && values!.length > 1) {
            // Different handles = AND logic: each value must be present
            clause = {
              bool: {
                must: values!.map((value: string) => ({
                  term: { [field]: value }
                }))
              }
            };
            logger.debug(`[getFacets] ${key} filter using AND logic (multiple handles)`, {
              values,
              handles: standardFieldToHandles,
            });
          } else {
            // Same handle or single value = OR logic: any value can match
            clause = { terms: { [field]: values! } };
            logger.debug(`[getFacets] ${key} filter using OR logic (same handle or single value)`, {
              values,
              handles: standardFieldToHandles,
            });
          }
          
          baseMustQueries.push(clause);
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
     * If excludeHandle is provided, exclude that handle's values but include other handles' values
     */
    const buildPostFilter = (filterType: string, excludeHandle?: string): any[] | undefined => {
      const postFilterQueries: any[] = [];
      const handleMapping = sanitizedFilters ? (sanitizedFilters as any).__handleMapping : undefined;
      const handleToValues = handleMapping?.handleToValues || {};

      // Handle standard filters
      const simpleFilters: Record<string, { field: string; values?: any[]; baseFieldKey: string }> = {
        vendors: { field: 'vendor.keyword', values: sanitizedFilters?.vendors, baseFieldKey: 'VENDOR' },
        productTypes: {
          field: 'productType.keyword',
          values: sanitizedFilters?.productTypes,
          baseFieldKey: 'PRODUCT_TYPE',
        },
        tags: { field: 'tags', values: sanitizedFilters?.tags, baseFieldKey: 'TAGS' },
        collections: {
          field: 'collections',
          values: sanitizedFilters?.collections,
          baseFieldKey: 'COLLECTION',
        },
      };

      if (simpleFilters[filterType]) {
        const { field, values, baseFieldKey } = simpleFilters[filterType];
        
        if (excludeHandle && handleToValues[excludeHandle]) {
          // Excluding a specific handle - include all values except this handle's
          const excludedValues = handleToValues[excludeHandle];
          const otherValues = values ? values.filter(v => !excludedValues.includes(v)) : [];
          
          if (otherValues.length > 0) {
            postFilterQueries.push({ terms: { [field]: otherValues } });
          }
        } else if (hasValues(values)) {
          // Standard case - include all values
          postFilterQueries.push({ terms: { [field]: values! } });
        }
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
     * If excludeHandle is provided, excludes that handle's values but includes other handles' values
     */
    const buildAggregationQuery = (filterType: string, aggConfig: { name: string; field: string; sizeMult?: number; type?: 'terms' | 'stats' | 'option' }, excludeHandle?: string) => {
      const mustQueries = buildBaseMustQueries(filterType, excludeHandle);
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      const postFilterQueries = buildPostFilter(filterType, excludeHandle);
      
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
    const aggregationQueries: Array<{ filterType: string; query: any; handle?: string }> = [];

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
      // Check if multiple handles map to tags field (need separate aggregations per handle)
      const handleMapping = sanitizedFilters ? (sanitizedFilters as any).__handleMapping : undefined;
      const tagsHandles = handleMapping?.baseFieldToHandles?.['TAGS'] || [];
      const handleToValues = handleMapping?.handleToValues || {};
      
      if (tagsHandles.length > 1 && filterConfig) {
        // Multiple handles map to tags - build separate aggregation for each handle
        // This allows contextual counts (excluding current handle's values, including other handles' values)
        for (const handle of tagsHandles) {
          const option = filterConfig.options?.find(opt => opt.handle === handle && isPublishedStatus(opt.status));
          if (!option) continue;
          
          // Build aggregation query that excludes this handle's values but includes other handles' values
          const excludeHandle = handle;
          const otherHandlesValues: string[] = [];
          for (const otherHandle of tagsHandles) {
            if (otherHandle !== excludeHandle && handleToValues[otherHandle]) {
              otherHandlesValues.push(...handleToValues[otherHandle]);
            }
          }
          
          // Create modified filters for this handle's aggregation
          const handleSpecificFilters = { ...sanitizedFilters };
          if (otherHandlesValues.length > 0) {
            handleSpecificFilters.tags = [...new Set(otherHandlesValues)];
          } else {
            handleSpecificFilters.tags = undefined;
          }
          
          // Build aggregation excluding this handle (but including other handles' values)
          // The query should filter by other handles' values, not use post_filter
          // (post_filter doesn't affect aggregation buckets, only final results)
          const mustQueries = buildBaseMustQueries('tags', excludeHandle);
          const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
          
          logger.debug(`[getFacets] Building handle-specific aggregation for ${handle}`, {
            excludeHandle,
            otherHandlesValues,
            mustQueriesCount: mustQueries.length,
            queryType: mustQueries.length > 0 ? 'bool.must' : 'match_all',
          });
          
          aggregationQueries.push({
            filterType: `tags:${handle}`, // Use handle-specific filter type for mapping
            query: {
              index,
              size: 0,
              track_total_hits: false,
              query,
              // No post_filter needed - the query already filters correctly
              aggs: {
                tags: { // Use standard aggregation name 'tags' so it maps correctly
                  terms: {
                    field: 'tags',
                    size: DEFAULT_BUCKET_SIZE * 2,
                    order: { _count: 'desc' as const },
                  },
                },
              },
            },
            handle, // Store handle for mapping results back to correct filter group
          });
        }
      } else {
        // Single handle or no handles - use standard aggregation
        aggregationQueries.push({
          filterType: 'tags',
          query: buildAggregationQuery('tags', { name: 'tags', field: 'tags', sizeMult: 2, type: 'terms' }),
        });
      }
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
    if (enabledAggregations.standard.has('price')) {
      const mustQueries = buildBaseMustQueries();
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      allAggregations.price = { stats: { field: 'minPrice' } };
      aggregationQueries.push({
        filterType: 'price',
        query: {
          index,
          size: 0,
          track_total_hits: false,
          query,
          aggs: { price: allAggregations.price },
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
    let msearchResponse: { responses: any[] };
    if (msearchBody.length > 0) {
      msearchResponse = await this.esClient.msearch<unknown, FacetAggregations>({ body: msearchBody });
    } else {
      msearchResponse = { responses: [] };
    }

    // Merge aggregation results
    // For handle-specific aggregations, store them separately to map back to correct filter groups
    const mergedAggregations: Record<string, any> = {};
    const handleSpecificAggregations: Record<string, any> = {}; // handle -> aggregation result
    for (let i = 0; i < aggregationQueries.length; i++) {
      const { filterType, handle } = aggregationQueries[i];
      const response = msearchResponse.responses[i];
      if (response && !response.error && response.aggregations) {
        if (handle) {
          // This is a handle-specific aggregation - store it separately
          // Extract the aggregation result (should be 'tags' key)
          handleSpecificAggregations[handle] = response.aggregations.tags || response.aggregations[filterType];
          logger.debug('Stored handle-specific aggregation', {
            handle,
            filterType,
            hasAggregation: !!handleSpecificAggregations[handle],
          });
        } else {
          // Standard aggregation - merge normally
          Object.assign(mergedAggregations, response.aggregations);
        }
      }
    }
    
    // Store handle-specific aggregations in a special key for formatFilters to use
    if (Object.keys(handleSpecificAggregations).length > 0) {
      (mergedAggregations as any).__handleSpecificAggregations = handleSpecificAggregations;
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

        price:
          enabledAggregations.standard.has('price') &&
            aggregations.price &&
            (aggregations.price.min != null ||
              aggregations.price.max != null)
            ? {
              min: aggregations.price.min ?? 0,
              max: aggregations.price.max ?? 0,
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
      // Check if values came from different handles (AND logic) or same handle (OR logic)
      const handleMapping = sanitizedFilters ? (sanitizedFilters as any).__handleMapping : undefined;
      const standardFieldToHandles = handleMapping?.standardFieldToHandles?.['VENDOR'] || [];
      const hasMultipleHandles = standardFieldToHandles.length > 1;
      
      let clause: any;
      if (hasMultipleHandles && sanitizedFilters!.vendors.length > 1) {
        // Different handles = AND logic: each value must be present
        clause = {
          bool: {
            must: sanitizedFilters!.vendors.map((vendor: string) => ({
              term: { 'vendor.keyword': vendor }
            }))
          }
        };
        logger.debug('Vendors filter using AND logic (multiple handles)', {
          vendors: sanitizedFilters!.vendors,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        clause = { terms: { 'vendor.keyword': sanitizedFilters!.vendors } };
        logger.debug('Vendors filter using OR logic (same handle or single value)', {
          vendors: sanitizedFilters!.vendors,
          handles: standardFieldToHandles,
        });
      }
      
      if (shouldKeep('vendors')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.productTypes)) {
      // Check if values came from different handles (AND logic) or same handle (OR logic)
      const handleMapping = sanitizedFilters ? (sanitizedFilters as any).__handleMapping : undefined;
      const standardFieldToHandles = handleMapping?.standardFieldToHandles?.['PRODUCT_TYPE'] || [];
      const hasMultipleHandles = standardFieldToHandles.length > 1;
      
      let clause: any;
      if (hasMultipleHandles && sanitizedFilters!.productTypes.length > 1) {
        // Different handles = AND logic: each value must be present
        clause = {
          bool: {
            must: sanitizedFilters!.productTypes.map((productType: string) => ({
              term: { 'productType.keyword': productType }
            }))
          }
        };
        logger.debug('ProductTypes filter using AND logic (multiple handles)', {
          productTypes: sanitizedFilters!.productTypes,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        clause = { terms: { 'productType.keyword': sanitizedFilters!.productTypes } };
        logger.debug('ProductTypes filter using OR logic (same handle or single value)', {
          productTypes: sanitizedFilters!.productTypes,
          handles: standardFieldToHandles,
        });
      }
      
      if (shouldKeep('productTypes')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.tags)) {
      // Tags is an array field, use directly (not .keyword)
      // Check if values came from different handles (AND logic) or same handle (OR logic)
      const handleMapping = sanitizedFilters ? (sanitizedFilters as any).__handleMapping : undefined;
      const standardFieldToHandles = handleMapping?.standardFieldToHandles?.['TAGS'] || [];
      const hasMultipleHandles = standardFieldToHandles.length > 1;
      
      logger.debug('Tags filter handle mapping check', {
        tags: sanitizedFilters!.tags,
        handleMapping: handleMapping ? 'present' : 'missing',
        standardFieldToHandles,
        hasMultipleHandles,
        handleMappingFull: handleMapping,
      });
      
      let clause: any;
      if (hasMultipleHandles && sanitizedFilters!.tags.length > 1) {
        // Different handles = AND logic: each value must be present
        // Use multiple term queries in bool.must for AND logic
        clause = {
          bool: {
            must: sanitizedFilters!.tags.map((tag: string) => ({
              term: { 'tags': tag }
            }))
          }
        };
        logger.debug('Tags filter using AND logic (multiple handles)', {
          tags: sanitizedFilters!.tags,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        clause = { terms: { 'tags': sanitizedFilters!.tags } };
        logger.debug('Tags filter using OR logic (same handle or single value)', {
          tags: sanitizedFilters!.tags,
          handles: standardFieldToHandles,
        });
      }
      
      if (shouldKeep('tags')) {
        postFilterQueries.push(clause);
      } else {
        mustQueries.push(clause);
      }
    }

    if (hasValues(sanitizedFilters?.collections)) {
      // Collections are stored as an array of strings (numeric collection IDs)
      // For array fields in ES, use the field name directly (not .keyword)
      // Check if values came from different handles (AND logic) or same handle (OR logic)
      const handleMapping = sanitizedFilters ? (sanitizedFilters as any).__handleMapping : undefined;
      const standardFieldToHandles = handleMapping?.standardFieldToHandles?.['COLLECTION'] || [];
      const hasMultipleHandles = standardFieldToHandles.length > 1;
      
      let clause: any;
      if (hasMultipleHandles && sanitizedFilters!.collections.length > 1) {
        // Different handles = AND logic: each value must be present
        clause = {
          bool: {
            must: sanitizedFilters!.collections.map((collection: string) => ({
              term: { 'collections': collection }
            }))
          }
        };
        logger.debug('Collections filter using AND logic (multiple handles)', {
          collections: sanitizedFilters!.collections,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        // The terms query will match any value in the array
        clause = { terms: { 'collections': sanitizedFilters!.collections } };
        logger.debug('Collections filter using OR logic (same handle or single value)', {
          collections: sanitizedFilters!.collections,
          handles: standardFieldToHandles,
        });
      }
      
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
    if (false && filters?.hideOutOfStockItems) {
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
        if (enabledAggregations.standard.has('price')) {
          aggregationObject.price = {
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
      const priceRangeStats = aggregations.price;
      const variantPriceRangeStats = aggregations.variantPriceRange?.priceStats;

      // Build formatted aggregations with price ranges
      const formattedAggregations: FacetAggregations = {
        ...aggregations,
        price: enabledAggregations.standard.has('price') && priceRangeStats && (priceRangeStats.min !== null || priceRangeStats.max !== null)
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

