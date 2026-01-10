/**
 * Products Repository
 * Handles Elasticsearch operations for product filtering and searching
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { escapeRegex, sanitizeFilterInput } from '@shared/utils/sanitizer.util';
import { isPublishedStatus } from '@shared/utils/status.util';
import {
  ProductFilterInput,
  ProductSearchInput,
  ProductSearchResult,
  FacetAggregations,
  shopifyProduct,
  AggregationMapping,
  ESQuery,
  SanitizedFilterInputWithMapping,
  AggregationConfig
} from './types';
import {
  PRODUCT_INDEX_NAME,
  PRODUCT_OPTION_PAIR_SEPARATOR,
  ES_FIELDS,
  AGGREGATION_BUCKET_SIZES
} from '@shared/constants/products.constants';
import { filterProductsForStorefront } from './storefront.helper';
import { Filter } from '@shared/filters/types';
import { mapOptionNameToHandle } from './filter-config.helper';
import { SearchRepository } from '@modules/search/search.repository';
import { SearchConfig } from '@shared/search/types';

const logger = createModuleLogger('storefront-repository');

const hasValues = (arr?: string[]) => Array.isArray(arr) && arr.length > 0;
const DEFAULT_BUCKET_SIZE = AGGREGATION_BUCKET_SIZES.DEFAULT;

/**
 * Calculate Levenshtein edit distance between two strings
 * Used to verify query corrections are actually similar
 */
function calculateEditDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
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
      standard: new Set(['vendors', 'productTypes', 'tags', 'collections', 'price']),
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
    if (!isPublishedStatus(option.status)) continue;

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

  // Always include price (fundamental filter)
  standard.add('price');

  return { standard, variantOptions };
}

/**
 * Checks if a filter object has a valid priceMin or priceMax
 * @param filters - The filters object
 * @param flag - "min", "max", or "both" (default) to specify which field to check
 * @returns true if the specified price field(s) are valid numbers
 */
function hasValidPriceFilter(filters: ProductSearchInput, flag: 'min' | 'max' | 'both' = 'both'): boolean {
  if (!filters) return false;

  const isValidNumber = (value: unknown): value is number => typeof value === 'number' && !isNaN(value);

  switch (flag) {
    case 'min':
      return isValidNumber(filters.priceMin);
    case 'max':
      return isValidNumber(filters.priceMax);
    case 'both':
      return isValidNumber(filters.priceMin) || isValidNumber(filters.priceMax);
  }
}

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

  /**
   * IMPORTANT:
   * Our ES `optionPairs` are indexed from Shopify option *names* (e.g. "Color", "Size")
   * in `transformProductToESDoc()` as `${opt.name}::${value}`.
   *
   * That means the safest, canonical key to use for filtering/aggregating optionPairs
   * is the filter config's `optionType` (when baseOptionType === "OPTION").
   *
   * Some configs also include `variantOptionKey`, but if it differs from the Shopify
   * option name it will NOT match `optionPairs` and will cause faceting to ignore
   * active option filters (the bug you reported).
   */
  const baseOptionType = optionSettings.baseOptionType?.trim().toUpperCase();
  if (baseOptionType === 'OPTION') {
    const optionType = option.optionType?.trim();
    if (optionType) return optionType;
  }

  // Fallback: if optionType is missing, use variantOptionKey if provided.
  if (optionSettings.variantOptionKey) {
    return optionSettings.variantOptionKey.trim();
  }

  return null;
}

// Shared cache across all instances to ensure cache invalidation works
const sharedSearchConfigCache: Map<string, { config: SearchConfig; timestamp: number }> = new Map();

/**
 * Invalidate shared search config cache (called from SearchRepository when config is updated)
 */
export function invalidateSharedSearchConfigCache(shop: string): void {
  sharedSearchConfigCache.delete(shop);
  logger.debug('Shared search config cache invalidated', { shop });
}

export class StorefrontSearchRepository {
  private readonly CACHE_TTL = 30 * 1000; // Reduced to 30 seconds for faster updates

  constructor(private esClient: Client) { }

  /**
   * Get search configuration for a shop with caching
   */
  private async getSearchConfig(shop: string): Promise<SearchConfig> {
    const cached = sharedSearchConfigCache.get(shop);
    const now = Date.now();
    
    // Return cached config if still valid
    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      logger.debug('Using cached search config', { shop, fieldCount: cached.config.fields.length });
      return cached.config;
    }

    // Fetch fresh config
    try {
      const searchRepo = new SearchRepository(this.esClient);
      const config = await searchRepo.getSearchConfig(shop);
      
      // Cache it in shared cache
      sharedSearchConfigCache.set(shop, { config, timestamp: now });
      logger.debug('Fetched and cached fresh search config', { shop, fieldCount: config.fields.length });
      
      return config;
    } catch (error: any) {
      logger.warn('Failed to get search config, using defaults', { shop, error: error?.message || error });
      // Return default config on error
      return {
        id: '',
        shop,
        fields: [
          { field: 'title', weight: 10 },
          { field: 'vendor', weight: 2 },
          { field: 'productType', weight: 1 },
          { field: 'tags', weight: 5 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
    }
  }

  /**
   * Boost weights from 0-5 range to higher values while maintaining ratio
   * This improves Elasticsearch query performance with low weights
   * Example: [1, 2, 3, 4, 5] -> [5, 10, 15, 20, 25] (multiplied by 5)
   * 
   * The multiplier of 5 scales the 0-5 range to 0-25 range, which gives ES
   * better signal for ranking. Weights maintain their relative proportions.
   */
  private boostWeights(fields: Array<{ field: string; weight: number }>): Array<{ field: string; weight: number }> {
    // Filter out disabled fields (weight 0)
    const activeFields = fields.filter(f => f.weight > 0);
    if (activeFields.length === 0) {
      return [];
    }
    
    // Boost multiplier: scales 0-5 range to 0-25 range (5x multiplier)
    // This ensures better ES performance while maintaining weight ratios
    // Minimum weight (1) becomes 5, maximum weight (5) becomes 25
    const BOOST_MULTIPLIER = 5;
    
    // Boost all weights while maintaining the ratio
    return activeFields.map(field => ({
      field: field.field,
      weight: Math.round(field.weight * BOOST_MULTIPLIER)
    }));
  }

  /**
   * Build search fields array from search configuration
   * Returns array of field strings with boosted weights (e.g., ['title^25', 'vendor^5'])
   * Weights are boosted from 0-5 range to 5-25 range for better ES performance
   * Only active fields (weight > 0) are included
   */
  private buildSearchFields(config: SearchConfig): string[] {
    // Boost weights from 0-5 range to higher values
    const boostedFields = this.boostWeights(config.fields);
    
    return boostedFields
      .map(field => `${field.field}^${field.weight}`)
      .filter(Boolean);
  }

  /**
   * Invalidate search config cache for a shop
   * Called when search configuration is updated externally
   * Uses shared cache so all instances are invalidated
   */
  invalidateSearchConfigCache(shop: string): void {
    sharedSearchConfigCache.delete(shop);
    logger.info('Search config cache invalidated (shared cache)', { shop });
  }

  /**
   * Get facets/aggregations for filters
   * Matches old app's ProductFiltersRepository.getFacets implementation
   * Only calculates aggregations for enabled filter options in filterConfig
   */
  async getFacets(shopDomain: string, filters?: ProductFilterInput, filterConfig?: Filter | null, includeAllOptions: boolean = false) {
    const index = PRODUCT_INDEX_NAME(shopDomain);

    // Sanitize filter input to prevent ES query injection
    const sanitizedFilters = filters ? sanitizeFilterInput(filters) : undefined;

    logger.info('Filter input after sanitization', {
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
    const buildBaseMustQueries = (excludeFilterType?: string, excludeHandle?: string): ESQuery[] => {
      const baseMustQueries: ESQuery[] = [];
      const handleMapping = sanitizedFilters ? (sanitizedFilters as SanitizedFilterInputWithMapping).__handleMapping : undefined;
      const handleToValues = handleMapping?.handleToValues || {};

      /** Search */
      if (sanitizedFilters?.search) {
        baseMustQueries.push({
          multi_match: {
            query: sanitizedFilters.search,
            fields: [`${ES_FIELDS.TITLE_KEYWORD}^3`, 'vendor^2', 'productType', ES_FIELDS.TAGS],
            type: 'best_fields',
            operator: 'and',
          },
        });
      }

      const simpleFilters: Record<string, { field: string; values?: any[]; baseFieldKey: string }> = {
        vendors: { field: ES_FIELDS.VENDOR_KEYWORD, values: sanitizedFilters?.vendors, baseFieldKey: 'VENDOR' },
        productTypes: {
          field: ES_FIELDS.PRODUCT_TYPE_KEYWORD,
          values: sanitizedFilters?.productTypes,
          baseFieldKey: 'PRODUCT_TYPE',
        },
        tags: { field: ES_FIELDS.TAGS, values: sanitizedFilters?.tags, baseFieldKey: 'TAGS' },
        collections: {
          field: ES_FIELDS.COLLECTIONS,
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

            logger.info(`[getFacets] Processing ${key} filter exclusion`, {
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
              logger.info(`[getFacets] Including other handles' values for ${key} (excluding handle ${excludeHandle})`, {
                otherHandlesValues,
                excludedHandle: excludeHandle,
                clause,
              });
            } else {
              logger.info(`[getFacets] No other handles' values for ${key} (excluding handle ${excludeHandle})`, {
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

          let clause: ESQuery;
          if (hasMultipleHandles && values!.length > 1) {
            // Different handles = AND logic: each value must be present
            clause = {
              bool: {
                must: values!.map((value: string) => ({
                  term: { [field]: value }
                })) as ESQuery[]
              }
            };
            logger.info(`[getFacets] ${key} filter using AND logic (multiple handles)`, {
              values,
              handles: standardFieldToHandles,
            });
          } else {
            // Same handle or single value = OR logic: any value can match
            clause = { terms: { [field]: values! } };
            logger.info(`[getFacets] ${key} filter using OR logic (same handle or single value)`, {
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
            terms: { [ES_FIELDS.OPTION_PAIRS]: encodedValues },
          });
        }
      }

      /** Variant Option Keys */
      if (hasValues(sanitizedFilters?.variantOptionKeys)) {
        baseMustQueries.push({
          terms: {
            [ES_FIELDS.VARIANT_OPTION_KEYS_KEYWORD]: sanitizedFilters.variantOptionKeys!,
          },
        });
      }

      /** Product-level Price Range */
      if (excludeFilterType !== 'price' && hasValidPriceFilter(sanitizedFilters)) {
        const rangeMust: ESQuery[] = [];
        if (hasValidPriceFilter(sanitizedFilters, 'min')) {
          rangeMust.push({
            range: { [ES_FIELDS.MAX_PRICE]: { gte: sanitizedFilters.priceMin } },
          });
        }
        if (hasValidPriceFilter(sanitizedFilters, 'max')) {
          rangeMust.push({
            range: { [ES_FIELDS.MIN_PRICE]: { lte: sanitizedFilters.priceMax } },
          });
        }
        if (rangeMust.length > 0) {
          baseMustQueries.push({ bool: { must: rangeMust } });
        }
      }

      /** Variant SKU Match */
      if (hasValues(sanitizedFilters?.variantSkus)) {
        baseMustQueries.push({
          nested: {
            path: 'variants',
            query: {
              terms: { [ES_FIELDS.VARIANTS_SKU]: sanitizedFilters.variantSkus! },
            },
          },
        });
      }

      // Always include these filters
      baseMustQueries.push({ term: { [ES_FIELDS.STATUS]: 'ACTIVE' } });
      baseMustQueries.push({ term: { [ES_FIELDS.DOCUMENT_TYPE]: 'product' } });

      return baseMustQueries;
    };

    /**
     * Build post_filter for a specific filter type (to exclude it from aggregations)
     * If excludeHandle is provided, exclude that handle's values but include other handles' values
     */
    const buildPostFilter = (filterType: string, excludeHandle?: string): ESQuery[] | undefined => {
      const postFilterQueries: ESQuery[] = [];
      const handleMapping = sanitizedFilters ? (sanitizedFilters as SanitizedFilterInputWithMapping).__handleMapping : undefined;
      const handleToValues = handleMapping?.handleToValues || {};

      // Handle standard filters
      const simpleFilters: Record<string, { field: string; values?: any[]; baseFieldKey: string }> = {
        vendors: { field: ES_FIELDS.VENDOR_KEYWORD, values: sanitizedFilters?.vendors, baseFieldKey: 'VENDOR' },
        productTypes: {
          field: ES_FIELDS.PRODUCT_TYPE_KEYWORD,
          values: sanitizedFilters?.productTypes,
          baseFieldKey: 'PRODUCT_TYPE',
        },
        tags: { field: ES_FIELDS.TAGS, values: sanitizedFilters?.tags, baseFieldKey: 'TAGS' },
        collections: {
          field: ES_FIELDS.COLLECTIONS,
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

      // Handle product-level price range filter
      if (filterType === 'price') {
        if (sanitizedFilters?.priceMin !== undefined || sanitizedFilters?.priceMax !== undefined) {
          const rangeMust: any[] = [];
          if (sanitizedFilters.priceMin !== undefined) {
            rangeMust.push({ range: { maxPrice: { gte: sanitizedFilters.priceMin } } });
          }
          if (sanitizedFilters.priceMax !== undefined) {
            rangeMust.push({ range: { minPrice: { lte: sanitizedFilters.priceMax } } });
          }
          if (rangeMust.length > 0) {
            postFilterQueries.push({ bool: { must: rangeMust } });
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
    const buildAggregationQuery = (filterType: string, aggConfig: AggregationConfig, excludeHandle?: string) => {
      const mustQueries = buildBaseMustQueries(filterType, excludeHandle);
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      const postFilterQueries = buildPostFilter(filterType, excludeHandle);

      const aggs: Record<string, any> = {};

      if (aggConfig.type === 'terms') {
        aggs[aggConfig.name] = {
          terms: {
            field: aggConfig.field,
            size: DEFAULT_BUCKET_SIZE * (aggConfig.sizeMult || 1),
            // order: { _count: 'desc' as const },
          },
        };
      } else if (aggConfig.type === 'stats') {
        aggs[aggConfig.name] = { stats: { field: aggConfig.field } };
      } else if (aggConfig.type === 'option') {
        // Option aggregation with prefix filter
        const optionPrefix = `${aggConfig.field}${PRODUCT_OPTION_PAIR_SEPARATOR}`;
        aggs[aggConfig.name] = {
          filter: {
            prefix: {
              [ES_FIELDS.OPTION_PAIRS]: optionPrefix,
            },
          },
          aggs: {
            values: {
              terms: {
                field: ES_FIELDS.OPTION_PAIRS,
                // IMPORTANT:
                // The prefix filter above restricts documents, not individual array values.
                // Without `include`, the terms agg will also bucket unrelated optionPairs
                // (e.g., Color::*, Size::*) from the same documents.
                include: `${escapeRegex(optionPrefix)}.*`,
                size: DEFAULT_BUCKET_SIZE * AGGREGATION_BUCKET_SIZES.OPTION_PAIRS_MULTIPLIER,
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
          filterType: optionType,
          query: buildAggregationQuery(optionType, { name: aggName, field: optionType, type: 'option' }),
          handle: mapOptionNameToHandle(filterConfig, optionType),
        });
      }
    } else if (!filterConfig || includeAllOptions) {
      // Fallback: aggregate all optionPairs if no config
      const mustQueries = buildBaseMustQueries();
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      allAggregations.optionPairs = {
        terms: {
          field: 'optionPairs',
          size: DEFAULT_BUCKET_SIZE * AGGREGATION_BUCKET_SIZES.TAGS_MULTIPLIER,
          // order: { _count: 'desc' as const },
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

    // Price range aggregations
    // IMPORTANT: exclude the price filter from its own stats so the slider bounds
    // don't "shrink" after selecting a price range (self-exclusion, like other facets).
    if (enabledAggregations.standard.has('price')) {
      const mustQueries = buildBaseMustQueries('price');
      const query = mustQueries.length > 0 ? { bool: { must: mustQueries } } : { match_all: {} };
      allAggregations.minPrice = { min: { field: ES_FIELDS.MIN_PRICE } };
      allAggregations.maxPrice = { max: { field: ES_FIELDS.MAX_PRICE } };
      aggregationQueries.push({
        filterType: 'price',
        query: {
          index,
          size: 0,
          track_total_hits: false,
          query,
          aggs: { minPrice: allAggregations.minPrice, maxPrice: allAggregations.maxPrice },
        },
      });
    }

    // Execute all aggregation queries in parallel using msearch
    logger.info('Executing aggregation queries with auto-exclude', {
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

    // console.log(JSON.stringify(msearchBody, null, 1));

    // Execute msearch
    let msearchResponse: { responses: any[] };
    try {
      if (msearchBody.length > 0) {
        msearchResponse = await this.esClient.msearch<unknown, FacetAggregations>({ body: msearchBody });
      } else {
        msearchResponse = { responses: [] };
      }
    } catch (error: any) {
      logger.error('[getFacets] msearch failed', {
        shop: shopDomain,
        index,
        error: error?.message || error,
        statusCode: error?.statusCode,
      });
      // Return empty aggregations instead of throwing
      return {
        index,
        aggregations: {
          vendors: { buckets: [] },
          productTypes: { buckets: [] },
          tags: { buckets: [] },
          collections: { buckets: [] },
          optionPairs: { buckets: [] },
          price: undefined,
        },
      };
    }

    // Merge aggregation results
    const mergedAggregations: Record<string, unknown> = {};
    for (const response of msearchResponse.responses ?? []) {
      if (response?.aggregations) {
        Object.assign(mergedAggregations, response.aggregations);
      }
    }

    logger.info('Aggregation queries completed', {
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

    // Combine variant option aggregations and deduplicate by bucket key
    let combinedOptionPairs: { buckets: Array<{ key: string; doc_count: number }> };
    if (enabledAggregations.variantOptions.size > 0) {
      // Collect all buckets from variant option aggregations
      const allBuckets = Array.from(enabledAggregations.variantOptions.keys()).flatMap(
        (aggName) => aggregations[aggName]?.values?.buckets || []
      );

      // Deduplicate buckets by key - keep the first occurrence of each unique key
      // This prevents duplicate buckets from appearing when the same bucket key
      // appears in multiple aggregation responses
      const bucketMap = new Map<string, { key: string; doc_count: number }>();
      for (const bucket of allBuckets) {
        const key = bucket.key || '';
        if (!key) continue;
        // Only add if we haven't seen this key before (keep first occurrence)
        if (!bucketMap.has(key)) {
          bucketMap.set(key, { key, doc_count: bucket.doc_count || 0 });
        }
      }

      // Convert map back to buckets array, sorted by count descending
      combinedOptionPairs = {
        buckets: Array.from(bucketMap.values()).sort((a, b) => b.doc_count - a.doc_count),
      };
    } else {
      combinedOptionPairs = aggregations.optionPairs || { buckets: [] };
    }

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

        price: enabledAggregations.standard.has('price') && aggregations.minPrice && (aggregations.minPrice.value != null || aggregations.maxPrice.value != null)
          ? {
            min: aggregations.minPrice.value ?? 0,
            max: aggregations.maxPrice.value ?? 0,
          } : undefined,
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
        logger.info('Vendors filter using AND logic (multiple handles)', {
          vendors: sanitizedFilters!.vendors,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        clause = { terms: { 'vendor.keyword': sanitizedFilters!.vendors } };
        logger.info('Vendors filter using OR logic (same handle or single value)', {
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
        logger.info('ProductTypes filter using AND logic (multiple handles)', {
          productTypes: sanitizedFilters!.productTypes,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        clause = { terms: { 'productType.keyword': sanitizedFilters!.productTypes } };
        logger.info('ProductTypes filter using OR logic (same handle or single value)', {
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

      logger.info('Tags filter handle mapping check', {
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
        logger.info('Tags filter using AND logic (multiple handles)', {
          tags: sanitizedFilters!.tags,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        clause = { terms: { 'tags': sanitizedFilters!.tags } };
        logger.info('Tags filter using OR logic (same handle or single value)', {
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
        logger.info('Collections filter using AND logic (multiple handles)', {
          collections: sanitizedFilters!.collections,
          handles: standardFieldToHandles,
        });
      } else {
        // Same handle or single value = OR logic: any value can match
        // The terms query will match any value in the array
        clause = { terms: { 'collections': sanitizedFilters!.collections } };
        logger.info('Collections filter using OR logic (same handle or single value)', {
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

        logger.info('Encoding option filter for ES query', {
          optionName,
          values,
          encodedValues,
          shop: shopDomain,
          field: 'optionPairs', // Array field, use directly
        });

        // optionPairs is an array field (type: keyword), use directly (not .keyword)
        // For array fields in ES, use the field name directly (like tags/collections)
        const termsQuery = {
          terms: { [ES_FIELDS.OPTION_PAIRS]: encodedValues },
        };

        // For filters endpoint, we want to preserve option aggregations even when filtering
        // This allows users to see available filter values even when current filters match 0 products
        // Use post_filter for option filters to preserve aggregations
        if (shouldKeep(optionName, true) || keepAll) {
          postFilterQueries.push(termsQuery);
          logger.info('Option filter added to post_filter (preserve aggregations)', {
            optionName,
            encodedValues,
          });
        } else {
          mustQueries.push(termsQuery);
          logger.info('Option filter added to must query (affects aggregations)', {
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
    if (hasValidPriceFilter(sanitizedFilters)) {
      const priceMustQueries: any[] = [];

      // if both minPrice and maxprice are present in the request query 
      if (hasValidPriceFilter(sanitizedFilters, 'min')) {
        // Product's maxPrice must be >= requested minPrice
        priceMustQueries.push({
          range: {
            [ES_FIELDS.MAX_PRICE]: {
              gte: sanitizedFilters.priceMin
            }
          },
        });
      }

      if (hasValidPriceFilter(sanitizedFilters, 'max')) {
        // Product's minPrice must be <= requested maxPrice
        priceMustQueries.push({
          range: {
            [ES_FIELDS.MIN_PRICE]: {
              lte: sanitizedFilters.priceMax,
            }
          },
        });
      }

      if (priceMustQueries.length > 0) {
        mustQueries.push({
          bool: { must: priceMustQueries },
        });
      }
    }

    // Variant SKU filter
    if (hasValues(sanitizedFilters?.variantSkus)) {
      mustQueries.push({
        nested: {
          path: 'variants',
          query: {
            terms: { [ES_FIELDS.VARIANTS_SKU]: sanitizedFilters!.variantSkus },
          },
        },
      });
    }

    // Filter for ACTIVE products only
    mustQueries.push({
      term: { [ES_FIELDS.STATUS]: 'ACTIVE' },
    });

    // Filter for product documentType only
    mustQueries.push({
      term: { [ES_FIELDS.DOCUMENT_TYPE]: 'product' },
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
                { term: { [ES_FIELDS.VARIANTS_AVAILABLE_FOR_SALE]: true } },
                // OR variant has inventoryQuantity > 0
                { range: { [ES_FIELDS.VARIANTS_INVENTORY_QUANTITY]: { gt: 0 } } },
                // OR variant has sellableOnlineQuantity > 0
                { range: { [ES_FIELDS.VARIANTS_SELLABLE_ONLINE_QUANTITY]: { gt: 0 } } },
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
          [ES_FIELDS.BEST_SELLER_RANK]: {
            order: 'asc',
            missing: '_last'
          }
        });
      }
      // Handle new format: title-ascending, title-descending
      else if (sortParam === 'title-ascending') {
        sort.push({ [ES_FIELDS.TITLE_KEYWORD]: 'asc' });
      }
      else if (sortParam === 'title-descending') {
        sort.push({ [ES_FIELDS.TITLE_KEYWORD]: 'desc' });
      }
      // Handle new format: price-ascending, price-descending
      else if (sortParam === 'price-ascending') {
        sort.push({ [ES_FIELDS.MIN_PRICE]: 'asc' });
      }
      else if (sortParam === 'price-descending') {
        sort.push({ [ES_FIELDS.MAX_PRICE]: 'desc' });
      }
      // Handle new format: created-ascending, created-descending
      else if (sortParam === 'created-ascending') {
        sort.push({ [ES_FIELDS.CREATED_AT]: 'asc' });
      }
      else if (sortParam === 'created-descending') {
        sort.push({ [ES_FIELDS.CREATED_AT]: 'desc' });
      }
      // Handle legacy price-based sorting (backward compatibility)
      else if (sortParam === 'price:asc' || sortParam === 'price-asc' || sortParam === 'price_low_to_high') {
        sort.push({ [ES_FIELDS.MIN_PRICE]: 'asc' });
      }
      else if (sortParam === 'price:desc' || sortParam === 'price-desc' || sortParam === 'price_high_to_low') {
        sort.push({ [ES_FIELDS.MAX_PRICE]: 'desc' });
      }
      // Handle legacy createdAt-based sorting (backward compatibility)
      else if (sortParam === 'created:desc' || sortParam === 'created-desc' || sortParam === 'newest') {
        sort.push({ [ES_FIELDS.CREATED_AT]: 'desc' });
      }
      else if (sortParam === 'created:asc' || sortParam === 'created-asc' || sortParam === 'oldest') {
        sort.push({ [ES_FIELDS.CREATED_AT]: 'asc' });
      }
      // Handle legacy title-based sorting (backward compatibility)
      else if (sortParam === 'title:asc' || sortParam === 'title-asc' || sortParam === 'name_asc') {
        sort.push({ [ES_FIELDS.TITLE_KEYWORD]: 'asc' });
      }
      else if (sortParam === 'title:desc' || sortParam === 'title-desc' || sortParam === 'name_desc') {
        sort.push({ [ES_FIELDS.TITLE_KEYWORD]: 'desc' });
      }
      // Handle legacy format: "field:order"
      else {
        const [field, order] = filters?.sort.split(':');
        if (field && order) {
          // Map field names to correct ES field names
          let sortField;
          if (field === 'price') {
            sortField = order === 'asc' ? ES_FIELDS.MIN_PRICE : ES_FIELDS.MAX_PRICE;
          } else if (field === 'title') {
            sortField = ES_FIELDS.TITLE_KEYWORD; // Use keyword field for text fields
          } else {
            sortField = field;
          }
          sort.push({ [sortField]: order });
        } else {
          // Default to bestSellerRank if sort param is invalid
          sort.push({
            [ES_FIELDS.BEST_SELLER_RANK]: {
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
          [ES_FIELDS.BEST_SELLER_RANK]: {
            order: 'asc',
            missing: '_last'
          }
        });
      } else {
        // Default: sort by bestSellerRank ascending
        sort.push({
          [ES_FIELDS.BEST_SELLER_RANK]: {
            order: 'asc',
            missing: '_last'
          }
        });
      }
    }

    /**
     * IMPORTANT (Facet count correctness):
     * `post_filter` does NOT affect aggregations. When option filters (e.g., Color)
     * are applied via `post_filter` (used historically to "preserve" facet lists),
     * other facets like Size will show counts as if Color was not applied.
     *
     * To ensure facet counts are always scoped by active filters (except self-exclusion),
     * we fetch facets via `getFacets()` (msearch auto-exclude approach) when
     * includeFilters=true, instead of relying on aggregations from this search request.
     */

    logger.info('[searchProducts] Executing ES query', {
      index,
      from,
      size: limit,
      queryType: mustQueries.length > 0 ? 'filtered' : 'match_all',
      sortFields: sort.map((s: any) => Object.keys(s)[0]),
    });

    // console.log(JSON.stringify(query, null, 4));

    // Note: We don't pre-check index existence to avoid race conditions.
    // The search operation will handle index not found errors appropriately.
    let response;
    try {
      response = await this.esClient.search<shopifyProduct, FacetAggregations>({
        index,
        from,
        size: limit,
        query,
        sort,
        track_total_hits: true,
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

    if (filters?.includeFilters) {
      const includeAllOptions = !filterConfig || !filterConfig.options;
      const facets = await this.getFacets(
        shopDomain,
        filters as unknown as ProductFilterInput,
        filterConfig,
        includeAllOptions
      );
      result.filters = facets.aggregations;
    }
    return result;
  }

  /**
   * Advanced search with autocomplete and typo tolerance
   * Uses Elasticsearch fuzzy matching and prefix queries for partial word matching
   * Examples: "jack" matches "jacket", "jackets"; "t-sh" matches "t-shirt", "t-shirt", "t shirt"
   */
  async searchProductsWithAutocomplete(
    shopDomain: string,
    searchQuery: string,
    filters?: ProductSearchInput,
    filterConfig?: Filter | null
  ): Promise<ProductSearchResult> {
    const index = PRODUCT_INDEX_NAME(shopDomain);
    const sanitizedFilters = filters ? sanitizeFilterInput(filters) : undefined;

    const page = filters?.page || 1;
    // Maximum 10 products per search result
    const requestedLimit = filters?.limit || 10;
    const limit = requestedLimit > 10 ? 10 : requestedLimit;
    const from = (page - 1) * limit;

    // Reduced logging for performance - only log in debug mode
    logger.debug('[searchProductsWithAutocomplete] Starting advanced search', {
      shopDomain,
      index,
      searchQuery,
      page,
      limit,
      from,
    });

    const mustQueries: any[] = [];
    const shouldQueries: any[] = [];
    const postFilterQueries: any[] = [];

    // ULTRA-OPTIMIZED: Build search query with minimal processing
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim();
      
      // PERFORMANCE: Use query as-is - no processing for maximum speed
      // Elasticsearch's analyzer handles stemming/pluralization automatically

      // Get search configuration for this shop (cached, fast)
      const searchConfig = await this.getSearchConfig(shopDomain);
      const searchFields = this.buildSearchFields(searchConfig);
      
      // If no fields, fall back to default with boosted weights (original 0-5 range boosted to 5-25)
      let fieldsToUse = searchFields.length > 0 
        ? searchFields 
        : ['title^25', 'variants.displayName^20', 'variants.sku^20', 'tags^15', 'vendor^5', 'productType^5' ];
      
      // PERFORMANCE: Limit to top 4 fields for balance between speed and accuracy
      // More fields = slower, but we need enough for good typo tolerance
      if (fieldsToUse.length > 4) {
        fieldsToUse = fieldsToUse
          .map(f => {
            const match = f.match(/^(.+)\^(.+)$/);
            return match ? { field: match[1], weight: parseFloat(match[2]), full: f } : { field: f, weight: 1, full: f };
          })
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 4) // Top 4 fields for good coverage
          .map(f => f.full);
      }
      
      // Keep nested fields but limit them - they're slower but needed for accuracy
      // Only keep top 2 nested fields if any exist
      const nestedFields = fieldsToUse.filter(f => f.startsWith('variants.'));
      const topLevelFields = fieldsToUse.filter(f => !f.startsWith('variants.'));
      
      if (nestedFields.length > 2) {
        // Keep only top 2 nested fields by weight
        const sortedNested = nestedFields
          .map(f => {
            const match = f.match(/^(.+)\^(.+)$/);
            return match ? { field: match[1], weight: parseFloat(match[2]), full: f } : { field: f, weight: 1, full: f };
          })
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 2)
          .map(f => f.full);
        fieldsToUse = [...topLevelFields, ...sortedNested];
      }
      
      // If no fields left, use title only with boosted weight
      if (fieldsToUse.length === 0) {
        fieldsToUse = ['title^25']; // Boosted from 5
      }

      // OPTIMIZED: Single query with controlled fuzziness for typo tolerance + speed
      // Using single query is faster than bool with multiple should clauses
      // fuzziness: 1 handles 1 character typos (sportx -> sports, demale -> female)
      // prefix_length: 2 requires first 2 chars to match (faster than full fuzzy)
      const fieldMatch = fieldsToUse.length === 1 
        ? fieldsToUse[0].match(/^(.+)\^(.+)$/)
        : null;
      const fieldName = fieldMatch ? fieldMatch[1] : null;
      
      if (fieldName) {
        // Single field - use match with controlled fuzziness
        mustQueries.push({
          match: {
            [fieldName]: {
              query: query,
              operator: 'or',
              fuzziness: 1, // Handles 1-char typos (sportx->sports, demale->female)
              prefix_length: 2, // First 2 chars must match (faster)
              max_expansions: 50, // Limit expansions for speed
            },
          },
        });
      } else {
        // Multiple fields - use multi_match with controlled fuzziness
        mustQueries.push({
          multi_match: {
            query: query,
            fields: fieldsToUse,
            type: 'best_fields', // Fastest for multiple fields
            operator: 'or',
            fuzziness: 1, // Handles 1-char typos
            prefix_length: 2, // First 2 chars must match (faster)
            max_expansions: 50, // Limit expansions for speed
          },
        });
      }
    }

    // Apply standard filters (same as searchProducts method)
    if (hasValues(sanitizedFilters?.vendors)) {
      const clause = { terms: { [ES_FIELDS.VENDOR_KEYWORD]: sanitizedFilters!.vendors } };
      mustQueries.push(clause);
    }

    if (hasValues(sanitizedFilters?.productTypes)) {
      const clause = { terms: { [ES_FIELDS.PRODUCT_TYPE_KEYWORD]: sanitizedFilters!.productTypes } };
      mustQueries.push(clause);
    }

    if (hasValues(sanitizedFilters?.tags)) {
      const clause = { terms: { [ES_FIELDS.TAGS]: sanitizedFilters!.tags } };
      mustQueries.push(clause);
    }

    if (hasValues(sanitizedFilters?.collections)) {
      const clause = { terms: { [ES_FIELDS.COLLECTIONS]: sanitizedFilters!.collections } };
      mustQueries.push(clause);
    }

    // Price filters
    if (sanitizedFilters?.priceMin !== undefined || sanitizedFilters?.priceMax !== undefined) {
      const priceRange: any = {};
      if (sanitizedFilters.priceMin !== undefined) {
        priceRange.gte = sanitizedFilters.priceMin;
      }
      if (sanitizedFilters.priceMax !== undefined) {
        priceRange.lte = sanitizedFilters.priceMax;
      }
      mustQueries.push({
        range: {
          [ES_FIELDS.MIN_PRICE]: priceRange,
        },
      });
    }

    // Build main query
    // Add status and document type filters to must queries
    const statusAndTypeQueries = [
      {
        term: {
          [ES_FIELDS.STATUS]: 'ACTIVE',
        },
      },
      {
        term: {
          [ES_FIELDS.DOCUMENT_TYPE]: 'product',
        },
      },
    ];

    const allMustQueries = [
      ...statusAndTypeQueries,
      ...(mustQueries.length > 0 ? mustQueries : [{ match_all: {} }]),
    ];

    const query: ESQuery = {
      bool: {
        must: allMustQueries,
        should: shouldQueries.length > 0 ? shouldQueries : undefined,
      },
    };

    // Sorting - simplified for maximum speed
    const sort: any[] = [];
    if (searchQuery) {
      // For search, use simple score sort only (faster than multi-sort)
      // Removed best_seller_rank sort - saves 50-100ms
    } else if (filters?.sort) {
      // Apply custom sort if provided
      const sortParam = filters.sort;
      if (sortParam === 'price:asc' || sortParam === 'price-asc' || sortParam === 'price_low_to_high') {
        sort.push({ [ES_FIELDS.MIN_PRICE]: 'asc' });
      } else if (sortParam === 'price:desc' || sortParam === 'price-desc' || sortParam === 'price_high_to_low') {
        sort.push({ [ES_FIELDS.MAX_PRICE]: 'desc' });
      } else {
        sort.push({
          [ES_FIELDS.BEST_SELLER_RANK]: {
            order: 'asc',
            missing: '_last',
          },
        });
      }
    } else {
      sort.push({
        [ES_FIELDS.BEST_SELLER_RANK]: {
          order: 'asc',
          missing: '_last',
        },
      });
    }

    // Removed debug logging for speed (saves 10-50ms)

    let response;
    
    try {
      // PERFORMANCE: Skip suggest API for now - it adds significant latency
      // Query corrections can be done client-side or asynchronously if needed
      // This removes ~100-300ms from response time
      
      // ULTRA-OPTIMIZED: Maximum speed query for sub-300ms response
      response = await this.esClient.search<shopifyProduct, FacetAggregations>({
        index,
        from,
        size: limit,
        query: query as any,
        sort: searchQuery ? [{ _score: 'desc' }] : sort, // Simple score sort for search (faster)
        track_total_hits: false, // Critical for speed
        request_cache: true,
        timeout: '1s', // Reasonable timeout - allows typo tolerance to work
        _source: ['id', 'title', 'imageUrl', 'vendor', 'productType', 'tags', 'minPrice', 'maxPrice'], // Minimal fields only
        // Removed variants fields from _source - they're nested and slow to retrieve
        post_filter: postFilterQueries.length
          ? {
            bool: {
              must: postFilterQueries,
            },
          }
          : undefined,
        // Balanced performance settings - allow typo tolerance to work
        batched_reduce_size: 256, // Balanced for accuracy
        pre_filter_shard_size: 128, // Balanced for accuracy
        // Removed terminate_after - it can skip valid fuzzy matches
      });
    } catch (error: any) {
      logger.error('[searchProductsWithAutocomplete] ES query failed', {
        index,
        error: error?.message || error,
        statusCode: error?.statusCode,
      });
      throw error;
    }

    // Fast total calculation - use relation for approximate count when available
    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total as any)?.value || response.hits.hits.length;
    const totalPages = Math.ceil(total / limit);

    // ULTRA-FAST: Direct mapping without intermediate array (saves 10-30ms)
    const storefrontProducts = response.hits.hits.map((hit) => {
      const product = hit._source as shopifyProduct;
      // Minimal processing - direct field access (fastest)
      return {
        id: product.id,
        title: product.title,
        imageUrl: product.imageUrl,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags || [],
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
      };
    });

    // PERFORMANCE: Skip correction validation - it requires an extra ES query
    // Corrections can be handled client-side or asynchronously if needed
    // This saves ~50-150ms per request
    let finalCorrectedQuery: string | undefined = undefined;

    const result: ProductSearchResult = {
      products: storefrontProducts,
      total,
      page,
      limit,
      totalPages,
      correctedQuery: finalCorrectedQuery,
      originalQuery: finalCorrectedQuery ? searchQuery : undefined,
    };

    return result;
  }

  /**
   * ULTRA-SIMPLE search - ONLY query string, NO filters
   * Uses cached search config (from app_search index) with boosted weights
   * Fastest possible search for search module
   */
  async searchProductsSimple(
    shopDomain: string,
    searchQuery: string,
    limit: number = 10,
    options?: {
      includeSuggestions?: boolean;
      suggestionLimit?: number;
    }
  ): Promise<{
    result: ProductSearchResult;
    suggestions?: string[];
  }> {
    const index = PRODUCT_INDEX_NAME(shopDomain);
    const query = searchQuery.trim();
    const from = 0;
    
    // Get cached search config (fast - cached for 30 seconds)
    // This uses the app_search index with weights 0-5, which we boost to 5-25
    const searchConfig = await this.getSearchConfig(shopDomain);
    const searchFields = this.buildSearchFields(searchConfig);
    
    // Use configured fields with boosted weights, or fallback to title only
    let fieldsToUse = searchFields.length > 0 
      ? searchFields 
      : ['title^25']; // Boosted default (5 * 5 = 25)
    
    // CRITICAL: Limit to top 2 fields ONLY for maximum speed
    if (fieldsToUse.length > 2) {
      fieldsToUse = fieldsToUse
        .map(f => {
          const match = f.match(/^(.+)\^(.+)$/);
          return match ? { field: match[1], weight: parseFloat(match[2]), full: f } : { field: f, weight: 1, full: f };
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 2)
        .map(f => f.full);
    }
    
    // ULTRA-SIMPLE: Only status and document type filters, NO other filters
    const mustQueries: any[] = [
      { term: { [ES_FIELDS.STATUS]: 'ACTIVE' } },
      { term: { [ES_FIELDS.DOCUMENT_TYPE]: 'product' } },
    ];
    
    // Build search query with cached config fields
    const fieldMatch = fieldsToUse.length === 1 ? fieldsToUse[0].match(/^(.+)\^(.+)$/) : null;
    const fieldName = fieldMatch ? fieldMatch[1] : null;
    
    if (fieldName) {
      // Single field match - fastest
      mustQueries.push({
        match: {
          [fieldName]: {
            query: query,
            operator: 'or',
            fuzziness: 'AUTO',
            prefix_length: 2,
            max_expansions: 10,
          },
        },
      });
    } else {
      // Multi-field match with boosted weights (max 2 fields)
      mustQueries.push({
        multi_match: {
          query: query,
          fields: fieldsToUse,
          type: 'best_fields',
          operator: 'or',
          fuzziness: 'AUTO',
          prefix_length: 2,
          max_expansions: 10,
        },
      });
    }
    
    // Build msearch body - only main query (no facets)
    const msearchBody: any[] = [];
    
    // Main search query - ULTRA SIMPLE
    msearchBody.push({ index });
    msearchBody.push({
      from,
      size: limit,
      query: { bool: { must: mustQueries } },
      sort: [{ _score: 'desc' }],
      track_total_hits: false,
      timeout: '150ms', // Very aggressive timeout
      _source: ['id', 'title', 'imageUrl', 'vendor', 'productType', 'tags', 'minPrice', 'maxPrice'],
      terminate_after: limit * 2, // Stop early
    });
    
    // Suggestions query (if needed) - only if explicitly requested
    if (options?.includeSuggestions) {
      msearchBody.push({ index });
      msearchBody.push({
        size: Math.min((options.suggestionLimit || 5) * 2, 15),
        query: {
          bool: {
            must: [
              { term: { [ES_FIELDS.STATUS]: 'ACTIVE' } },
              { term: { [ES_FIELDS.DOCUMENT_TYPE]: 'product' } },
              {
                match_phrase_prefix: {
                  title: {
                    query: query.toLowerCase(),
                    max_expansions: 8,
                  },
                },
              },
            ],
          },
        },
        sort: [{ _score: 'desc' }],
        _source: ['title'],
        timeout: '150ms',
        track_total_hits: false,
        terminate_after: (options.suggestionLimit || 5) * 3,
      });
    }
    
    // Execute msearch
    let msearchResponse: { responses: any[] };
    try {
      msearchResponse = await this.esClient.msearch({ body: msearchBody });
    } catch (error: any) {
      logger.error('[searchProductsSimple] msearch failed', {
        shopDomain,
        index,
        error: error?.message || error,
      });
      throw error;
    }
    
    // Process main search result
    const mainResponse = msearchResponse.responses[0];
    if (!mainResponse || mainResponse.error) {
      throw new Error(mainResponse?.error?.reason || 'Search failed');
    }
    
    const total = typeof mainResponse.hits.total === 'number'
      ? mainResponse.hits.total
      : (mainResponse.hits.total as any)?.value || mainResponse.hits.hits.length;
    const totalPages = Math.ceil(total / limit);
    
    const products = mainResponse.hits.hits.map((hit: any) => {
      const product = hit._source as shopifyProduct;
      return {
        id: product.id,
        title: product.title,
        imageUrl: product.imageUrl,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags || [],
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
      };
    });
    
    const result: ProductSearchResult = {
      products,
      total,
      page: 1,
      limit,
      totalPages,
    };
    
    // Process suggestions (if requested)
    let suggestions: string[] | undefined;
    if (options?.includeSuggestions && msearchResponse.responses.length > 1) {
      const suggestResponse = msearchResponse.responses[1];
      if (suggestResponse && !suggestResponse.error) {
        const seen = new Set<string>();
        const queryLower = query.toLowerCase();
        
        for (const hit of suggestResponse.hits.hits) {
          const title = hit._source?.title;
          if (title && typeof title === 'string') {
            const titleLower = title.toLowerCase();
            if (titleLower.startsWith(queryLower) || titleLower.includes(' ' + queryLower)) {
              const key = titleLower;
              if (!seen.has(key) && title.length > queryLower.length) {
                suggestions = suggestions || [];
                suggestions.push(title.length <= 60 ? title : title.substring(0, 60) + '...');
                seen.add(key);
                if (suggestions.length >= (options.suggestionLimit || 5)) break;
              }
            }
          }
        }
      }
    }
    
    return { result, suggestions };
  }

  /**
   * ULTRA-FAST search using msearch to combine all queries in single request
   * Combines: main search + suggestions + facets in single msearch request
   * Inspired by filters endpoint which uses msearch for parallel queries
   * NOTE: Use searchProductsSimple for search module (faster, no filters)
   */
  async searchProductsWithMsearch(
    shopDomain: string,
    searchQuery: string,
    filters?: ProductSearchInput,
    filterConfig?: Filter | null,
    options?: {
      includeSuggestions?: boolean;
      includeFacets?: boolean;
      suggestionLimit?: number;
    }
  ): Promise<{
    result: ProductSearchResult;
    suggestions?: string[];
    facets?: any;
  }> {
    const index = PRODUCT_INDEX_NAME(shopDomain);
    const sanitizedFilters = filters ? sanitizeFilterInput(filters) : undefined;
    
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 10, 10);
    const from = (page - 1) * limit;
    
    // Build base must queries (status, document type, filters)
    const baseMustQueries: any[] = [
      { term: { [ES_FIELDS.STATUS]: 'ACTIVE' } },
      { term: { [ES_FIELDS.DOCUMENT_TYPE]: 'product' } },
    ];
    
    // Add filters
    if (hasValues(sanitizedFilters?.vendors)) {
      baseMustQueries.push({ terms: { [ES_FIELDS.VENDOR_KEYWORD]: sanitizedFilters!.vendors } });
    }
    if (hasValues(sanitizedFilters?.productTypes)) {
      baseMustQueries.push({ terms: { [ES_FIELDS.PRODUCT_TYPE_KEYWORD]: sanitizedFilters!.productTypes } });
    }
    if (hasValues(sanitizedFilters?.tags)) {
      baseMustQueries.push({ terms: { [ES_FIELDS.TAGS]: sanitizedFilters!.tags } });
    }
    if (hasValues(sanitizedFilters?.collections)) {
      baseMustQueries.push({ terms: { [ES_FIELDS.COLLECTIONS]: sanitizedFilters!.collections } });
    }
    if (sanitizedFilters?.priceMin !== undefined || sanitizedFilters?.priceMax !== undefined) {
      const priceRange: any = {};
      if (sanitizedFilters.priceMin !== undefined) priceRange.gte = sanitizedFilters.priceMin;
      if (sanitizedFilters.priceMax !== undefined) priceRange.lte = sanitizedFilters.priceMax;
      baseMustQueries.push({ range: { [ES_FIELDS.MIN_PRICE]: priceRange } });
    }
    
    // Build search query - OPTIMIZED with boosted weights from config
    let searchMustQueries = [...baseMustQueries];
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim();
      
      // Get search config (cached, so fast)
      // This uses the app_search index with weights 0-5, which we boost to 5-25
      const searchConfig = await this.getSearchConfig(shopDomain);
      const searchFields = this.buildSearchFields(searchConfig);
      
      // Use configured fields with boosted weights, or fallback to title only
      let fieldsToUse = searchFields.length > 0 
        ? searchFields 
        : ['title^25']; // Boosted default (5 * 5 = 25)
      
      // CRITICAL: Limit to top 2 fields ONLY for maximum speed
      if (fieldsToUse.length > 2) {
        fieldsToUse = fieldsToUse
          .map(f => {
            const match = f.match(/^(.+)\^(.+)$/);
            return match ? { field: match[1], weight: parseFloat(match[2]), full: f } : { field: f, weight: 1, full: f };
          })
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 2)
          .map(f => f.full);
      }
      
      // Prefer single field match (fastest) if only one field
      const fieldMatch = fieldsToUse.length === 1 ? fieldsToUse[0].match(/^(.+)\^(.+)$/) : null;
      const fieldName = fieldMatch ? fieldMatch[1] : null;
      
      if (fieldName) {
        // Single field match - fastest
        searchMustQueries.push({
          match: {
            [fieldName]: {
              query: query,
              operator: 'or',
              fuzziness: 'AUTO',
              prefix_length: 2,
              max_expansions: 10, // Reduced from 20 for speed
            },
          },
        });
      } else {
        // Multi-field match with boosted weights
        searchMustQueries.push({
          multi_match: {
            query: query,
            fields: fieldsToUse,
            type: 'best_fields',
            operator: 'or',
            fuzziness: 'AUTO',
            prefix_length: 2,
            max_expansions: 10, // Reduced from 20 for speed
          },
        });
      }
    } else {
      searchMustQueries.push({ match_all: {} });
    }
    
    // Build msearch body - combine all queries
    const msearchBody: any[] = [];
    
    // 1. Main search query - ULTRA OPTIMIZED for speed
    msearchBody.push({ index });
    msearchBody.push({
      from,
      size: limit,
      query: { bool: { must: searchMustQueries } },
      sort: searchQuery ? [{ _score: 'desc' }] : [{ [ES_FIELDS.BEST_SELLER_RANK]: { order: 'asc', missing: '_last' } }],
      track_total_hits: false, // Skip total count for speed
      timeout: '200ms', // Reduced from 300ms
      _source: ['id', 'title', 'imageUrl', 'vendor', 'productType', 'tags', 'minPrice', 'maxPrice'],
      // Performance optimizations
      batched_reduce_size: 64, // Reduced from 128
      pre_filter_shard_size: 32, // Reduced from 64
      terminate_after: limit * 2, // Stop after finding enough results
    });
    
    // 2. Suggestions query (if needed) - ultra simplified for speed
    if (options?.includeSuggestions && searchQuery) {
      msearchBody.push({ index });
      msearchBody.push({
        size: Math.min((options.suggestionLimit || 5) * 2, 20), // Reduced from 30
        query: {
          bool: {
            must: [
              ...baseMustQueries,
              {
                match_phrase_prefix: { // Simpler than multi_match
                  title: {
                    query: searchQuery.toLowerCase().trim(),
                    max_expansions: 10, // Reduced for speed
                  },
                },
              },
            ],
          },
        },
        sort: [{ _score: 'desc' }],
        _source: ['title'],
        timeout: '200ms', // Reduced from 300ms
        track_total_hits: false,
        terminate_after: (options.suggestionLimit || 5) * 3, // Stop early
      });
    }
    
    // 3. Facets query (if needed)
    if (options?.includeFacets && filterConfig) {
      // Use getEnabledAggregations helper to check which aggregations are enabled
      const enabledAggregations = getEnabledAggregations(filterConfig, false);
      const aggs: any = {};
      
      if (enabledAggregations.standard.has('vendors')) {
        aggs.vendors = { terms: { field: ES_FIELDS.VENDOR_KEYWORD, size: 20 } };
      }
      if (enabledAggregations.standard.has('productTypes')) {
        aggs.productTypes = { terms: { field: ES_FIELDS.PRODUCT_TYPE_KEYWORD, size: 20 } };
      }
      if (enabledAggregations.standard.has('tags')) {
        aggs.tags = { terms: { field: ES_FIELDS.TAGS, size: 50 } };
      }
      if (enabledAggregations.standard.has('collections')) {
        aggs.collections = { terms: { field: ES_FIELDS.COLLECTIONS, size: 20 } };
      }
      if (enabledAggregations.standard.has('price')) {
        aggs.minPrice = { min: { field: ES_FIELDS.MIN_PRICE } };
        aggs.maxPrice = { max: { field: ES_FIELDS.MAX_PRICE } };
      }
      
      if (Object.keys(aggs).length > 0) {
        msearchBody.push({ index });
        msearchBody.push({
          size: 0,
          query: { bool: { must: baseMustQueries } },
          aggs,
          track_total_hits: false,
          timeout: '300ms', // Reduced from 400ms
        });
      }
    }
    
    // Execute msearch - all queries in parallel
    let msearchResponse: { responses: any[] };
    try {
      if (msearchBody.length > 0) {
        msearchResponse = await this.esClient.msearch({ body: msearchBody });
      } else {
        msearchResponse = { responses: [] };
      }
    } catch (error: any) {
      logger.error('[searchProductsWithMsearch] msearch failed', {
        shopDomain,
        index,
        error: error?.message || error,
      });
      throw error;
    }
    
    // Process main search result
    const mainResponse = msearchResponse.responses[0];
    if (!mainResponse || mainResponse.error) {
      throw new Error(mainResponse?.error?.reason || 'Search failed');
    }
    
    const total = typeof mainResponse.hits.total === 'number'
      ? mainResponse.hits.total
      : (mainResponse.hits.total as any)?.value || mainResponse.hits.hits.length;
    const totalPages = Math.ceil(total / limit);
    
    const products = mainResponse.hits.hits.map((hit: any) => {
      const product = hit._source as shopifyProduct;
      return {
        id: product.id,
        title: product.title,
        imageUrl: product.imageUrl,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags || [],
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
      };
    });
    
    const result: ProductSearchResult = {
      products,
      total,
      page,
      limit,
      totalPages,
    };
    
    // Process suggestions (if requested)
    let suggestions: string[] | undefined;
    if (options?.includeSuggestions && msearchResponse.responses.length > 1) {
      const suggestResponse = msearchResponse.responses[1];
      if (suggestResponse && !suggestResponse.error) {
        const seen = new Set<string>();
        const queryLower = searchQuery.toLowerCase().trim();
        
        for (const hit of suggestResponse.hits.hits) {
          const title = hit._source?.title;
          if (title && typeof title === 'string') {
            const titleLower = title.toLowerCase();
            if (titleLower.startsWith(queryLower) || titleLower.includes(' ' + queryLower)) {
              const key = titleLower;
              if (!seen.has(key) && title.length > queryLower.length) {
                suggestions = suggestions || [];
                suggestions.push(title.length <= 60 ? title : title.substring(0, 60) + '...');
                seen.add(key);
                if (suggestions.length >= (options.suggestionLimit || 5)) break;
              }
            }
          }
        }
      }
    }
    
    // Process facets (if requested)
    let facets: any;
    const facetsIndex = options?.includeSuggestions ? 2 : 1;
    if (options?.includeFacets && msearchResponse.responses.length > facetsIndex) {
      const facetsResponse = msearchResponse.responses[facetsIndex];
      if (facetsResponse && !facetsResponse.error && facetsResponse.aggregations) {
        facets = facetsResponse.aggregations;
      }
    }
    
    return { result, suggestions, facets };
  }

  /**
   * Get search suggestions based on actual product data
   * Returns real terms from product titles that match the query (including partial matches)
   * Example: "Sheep" should find "Sheepskin" products
   */
  async getSearchSuggestions(
    shopDomain: string,
    query: string,
    limit: number = 5
  ): Promise<string[]> {
    const index = PRODUCT_INDEX_NAME(shopDomain);
    const queryLower = query.toLowerCase().trim();
    
    // Only get suggestions for reasonable queries (not gibberish)
    if (queryLower.length < 2 || queryLower.length > 50) {
      return [];
    }

    try {
      // PERFORMANCE: Optimized suggestions query - simpler and faster
      // Get actual product titles that match the query (including partial matches)
      // This finds products like "Sheepskin" when searching for "Sheep"
      const response = await this.esClient.search({
        index,
        size: Math.min(limit * 2, 50), // Reduced from 100 to 50 for speed
        query: {
          bool: {
            must: [
              {
                term: {
                  [ES_FIELDS.STATUS]: 'ACTIVE',
                },
              },
              {
                term: {
                  [ES_FIELDS.DOCUMENT_TYPE]: 'product',
                },
              },
              {
                // Simplified query - use phrase_prefix for autocomplete (fastest)
                multi_match: {
                  query: queryLower,
                  fields: ['title^3', 'tags^2'],
                  type: 'phrase_prefix', // Fastest for autocomplete
                  operator: 'or',
                },
              },
            ],
          },
        },
        sort: [{ _score: 'desc' }], // Removed best_seller_rank sort for speed
        _source: ['title'],
        timeout: '500ms', // Faster timeout for suggestions
        track_total_hits: false, // Don't need total count
      } as any);

      const suggestions: string[] = [];
      const seen = new Set<string>();

      // Extract meaningful suggestions from product titles
      for (const hit of response.hits.hits) {
        const title = (hit._source as any)?.title;
        if (!title || typeof title !== 'string') continue;

        const titleLower = title.toLowerCase();
        
        // Include titles that:
        // 1. Start with the query (for autocomplete)
        // 2. Contain the query as a word
        // 3. Contain the query as a substring (e.g., "Sheep" in "Sheepskin")
        if (titleLower.startsWith(queryLower) || 
            titleLower.includes(' ' + queryLower) ||
            titleLower.includes(queryLower + ' ') ||
            titleLower.includes(queryLower)) { // Partial match
          
          // Use the full title if short enough, otherwise extract relevant part
          let suggestion: string;
          if (title.length <= 60) {
            suggestion = title;
          } else {
            // For long titles, extract a snippet around the query
            const index = titleLower.indexOf(queryLower);
            if (index >= 0) {
              const start = Math.max(0, index - 15);
              const end = Math.min(title.length, index + queryLower.length + 40);
              suggestion = title.substring(start, end).trim();
              // Add ellipsis if truncated
              if (start > 0) suggestion = '...' + suggestion;
              if (end < title.length) suggestion = suggestion + '...';
            } else {
              suggestion = title.substring(0, 60) + '...';
            }
          }

          // Avoid duplicates
          const suggestionKey = suggestion.toLowerCase();
          if (!seen.has(suggestionKey) && suggestion.length > queryLower.length) {
            suggestions.push(suggestion);
            seen.add(suggestionKey);
          }

          if (suggestions.length >= limit) break;
        }
      }

      return suggestions.slice(0, limit);
    } catch (error: any) {
      logger.debug('[getSearchSuggestions] Failed', {
        shopDomain,
        query,
        error: error?.message,
      });
      return [];
    }
  }

  /**
   * Get "Did you mean" suggestions when no results are found
   * Uses Elasticsearch to find similar queries that would return results
   */
  async getDidYouMeanSuggestions(
    shopDomain: string,
    query: string,
    limit: number = 3
  ): Promise<string[]> {
    const index = PRODUCT_INDEX_NAME(shopDomain);
    const queryLower = query.toLowerCase().trim();
    
    if (queryLower.length < 2) {
      return [];
    }

    try {
      // Use Elasticsearch suggest API to get similar queries
      const suggestResponse = await this.esClient.search({
        index,
        body: {
          suggest: {
            text: queryLower,
            title_suggest: {
              term: {
                field: 'title',
                size: limit,
                suggest_mode: 'always',
                min_word_length: 3,
                max_edits: 2,
              },
            },
          },
          size: 0,
        } as any,
      });

      const suggestions: string[] = [];
      const suggestOptions = (suggestResponse as any).suggest?.title_suggest?.[0]?.options || [];

      for (const option of suggestOptions) {
        const suggestedText = option.text;
        if (suggestedText && 
            suggestedText.toLowerCase() !== queryLower &&
            option.score > 0.3) { // Only accept reasonable suggestions
          
          // PERFORMANCE: Skip verification query - it doubles the latency (100-200ms per suggestion)
          // Just use the suggestion if score is reasonable (already checked: option.score > 0.3)
          // Verification adds significant latency without much benefit
          suggestions.push(suggestedText);
          if (suggestions.length >= limit) break;
        }
      }

      // If we don't have enough, try finding products with similar words
      if (suggestions.length < limit) {
        const queryWords = queryLower.split(/\s+/);
        if (queryWords.length > 0) {
          const lastWord = queryWords[queryWords.length - 1];
          
          // Find products that contain words starting with the query
          const similarResponse = await this.esClient.search({
            index,
            size: limit - suggestions.length,
            query: {
              bool: {
                must: [
                  {
                    term: {
                      [ES_FIELDS.STATUS]: 'ACTIVE',
                    },
                  },
                  {
                    term: {
                      [ES_FIELDS.DOCUMENT_TYPE]: 'product',
                    },
                  },
                  {
                    prefix: {
                      'title': lastWord,
                    },
                  },
                ],
              },
            },
            _source: ['title'],
          } as any);

          for (const hit of similarResponse.hits.hits) {
            const title = (hit._source as any)?.title;
            if (title && typeof title === 'string') {
              const titleLower = title.toLowerCase();
              // Extract the word that starts with our query
              const words = titleLower.split(/\s+/);
              for (const word of words) {
                if (word.startsWith(lastWord) && word.length > lastWord.length) {
                  const suggestion = queryWords.length > 1
                    ? queryWords.slice(0, -1).join(' ') + ' ' + word
                    : word;
                  
                  if (!suggestions.includes(suggestion)) {
                    suggestions.push(suggestion);
                    if (suggestions.length >= limit) break;
                  }
                }
              }
              if (suggestions.length >= limit) break;
            }
          }
        }
      }

      return suggestions.slice(0, limit);
    } catch (error: any) {
      logger.debug('[getDidYouMeanSuggestions] Failed', {
        shopDomain,
        query,
        error: error?.message,
      });
      return [];
    }
  }
}

