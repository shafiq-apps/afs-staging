/**
 * Product Filters Format Helper
 * Utility functions for formatting filter aggregations
 */

import { FacetAggregations, FacetValue } from './products.type';
import { PRODUCT_OPTION_PAIR_SEPARATOR } from '@shared/constants/products.constants';

/**
 * Normalize Elasticsearch aggregation buckets to FacetValue array
 */
export function normalizeBuckets(agg?: { buckets?: Array<{ key: string; doc_count: number }> }): FacetValue[] {
  return (agg?.buckets ?? [])
    .filter((bucket) => bucket.key)
    .map((bucket) => ({
      value: bucket.key,
      count: bucket.doc_count,
    }));
}

/**
 * Format option pairs from aggregations
 */
export function formatOptionPairs(optionPairsBuckets?: Array<{ key: string; doc_count: number }>): Record<string, FacetValue[]> {
  const optionEntries: Record<string, FacetValue[]> = {};
  const buckets = optionPairsBuckets ?? [];

  for (const bucket of buckets) {
    const key = bucket.key || '';
    if (!key.includes(PRODUCT_OPTION_PAIR_SEPARATOR)) continue;
    const [optionName, optionValue] = key.split(PRODUCT_OPTION_PAIR_SEPARATOR);
    if (!optionName || !optionValue) continue;

    if (!optionEntries[optionName]) {
      optionEntries[optionName] = [];
    }

    optionEntries[optionName].push({
      value: optionValue,
      count: bucket.doc_count,
    });
  }

  // Sort by count descending
  for (const entry of Object.values(optionEntries)) {
    entry.sort((a, b) => b.count - a.count);
  }

  return optionEntries;
}

/**
 * Format filter aggregations to ProductFilters format
 */
export function formatFilters(aggregations?: FacetAggregations) {
  if (!aggregations) {
    return {
      vendors: [],
      productTypes: [],
      tags: [],
      collections: [],
      options: {},
      priceRange: undefined,
      variantPriceRange: undefined,
    };
  }

  return {
    vendors: normalizeBuckets(aggregations.vendors),
    productTypes: normalizeBuckets(aggregations.productTypes),
    tags: normalizeBuckets(aggregations.tags),
    collections: normalizeBuckets(aggregations.collections),
    options: formatOptionPairs(aggregations.optionPairs?.buckets),
    priceRange: aggregations.priceRange,
    variantPriceRange: aggregations.variantPriceRange,
  };
}

