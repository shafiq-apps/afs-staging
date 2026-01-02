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
  shopifyProduct
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

const logger = createModuleLogger('storefront-repository');

const hasValues = (arr?: string[]) => Array.isArray(arr) && arr.length > 0;
const DEFAULT_BUCKET_SIZE = AGGREGATION_BUCKET_SIZES.DEFAULT;

/**
 * Aggregation mapping result
 * Contains both standard aggregations and variant option-specific aggregations
 */
interface AggregationMapping {
  standard: Set<string>; // Standard aggregations: vendors, tags, collections, etc.
  variantOptions: Map<string, string>; // Map of aggregation name -> optionType (e.g., "option.Color" -> "Color")
}

/**
 * Elasticsearch Query Types
 * Type definitions for ES query structures to replace 'any' types
 */
interface ESTermQuery {
  term: Record<string, string | number | boolean>;
}

interface ESTermsQuery {
  terms: Record<string, string[]>;
}

interface ESRangeQuery {
  range: Record<string, { gte?: number; lte?: number; gt?: number }>;
}

interface ESBoolQuery {
  bool: {
    must?: ESQuery[];
    should?: ESQuery[];
    minimum_should_match?: number;
  };
}

interface ESNestedQuery {
  nested: {
    path: string;
    query: ESQuery;
  };
}

interface ESMultiMatchQuery {
  multi_match: {
    query: string;
    fields: string[];
    type: string;
    operator: string;
  };
}

interface ESMatchAllQuery {
  match_all: Record<string, never>;
}

type ESQuery = ESTermQuery | ESTermsQuery | ESRangeQuery | ESBoolQuery | ESNestedQuery | ESMultiMatchQuery | ESMatchAllQuery;

interface AggregationConfig {
  name: string;
  field: string;
  sizeMult?: number;
  type?: 'terms' | 'stats' | 'option';
}

interface HandleMapping {
  handleToBaseField?: Record<string, string>;
  baseFieldToHandles?: Record<string, string[]>;
  handleToValues?: Record<string, string[]>;
  standardFieldToHandles?: Record<string, string[]>;
}

interface SanitizedFilterInputWithMapping extends ProductFilterInput {
  __handleMapping?: HandleMapping;
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

export class StorefrontSearchRepository {
  constructor(private esClient: Client) { }

  /**
   * Get facets/aggregations for filters
   * Matches old app's ProductFiltersRepository.getFacets implementation
   * Only calculates aggregations for enabled filter options in filterConfig
   */
  async getFacets(shopDomain: string, filters?: ProductFilterInput, filterConfig?: Filter | null, includeAllOptions: boolean = false) {
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
          terms: { [ES_FIELDS.OPTION_PAIRS]: encodedValues },
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

    logger.debug('[searchProducts] Executing ES query', {
      index,
      from,
      size: limit,
      queryType: mustQueries.length > 0 ? 'filtered' : 'match_all',
      sortFields: sort.map((s: any) => Object.keys(s)[0]),
    });

    console.log(JSON.stringify(query, null, 4));

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
}

