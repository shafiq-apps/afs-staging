/**
 * Products Service
 * Business logic for product filtering and searching
 */

import { Injectable } from '@shared/types/global.type';
import { productsRepository } from './products.repository';
import {
  ProductFilterInput,
  ProductSearchInput,
  ProductFilters,
  ProductSearchResult,
  FacetAggregations,
  TermsAggregation,
} from './products.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { getCacheService } from '@core/cache';
import { Filter } from '@modules/filters/filters.type';
import { getFilterConfigHash } from './products.filter-config.helper';

const logger = createModuleLogger('products-service');

export class productsService implements Injectable {
  private readonly log = logger;
  private readonly cache = getCacheService();

  constructor(private repo: productsRepository) {}

  /**
   * Get product filters (facets/aggregations)
   * Only calculates aggregations for enabled filter options in filterConfig
   */
  async getFilters(shop: string, filters?: ProductFilterInput, filterConfig?: Filter | null): Promise<ProductFilters> {
    if (!shop) {
      throw new Error('Shop parameter is required');
    }

    // Generate filter config hash for cache key
    const filterConfigHash = getFilterConfigHash(filterConfig);
    
    // Try to get from cache first (include filterConfig hash in cache key)
    const cachedAggregations = this.cache.getFilterResults(shop, filters, filterConfigHash);
    if (cachedAggregations) {
      this.log.info('Cache hit for filters', { shop, filters, filterConfigHash });
      return this.formatAggregations(cachedAggregations);
    }

    this.log.info(`Fetching filters for shop: ${shop}`, filters);

    const { aggregations } = await this.repo.getFacets(shop, filters, filterConfig);

    // Cache the raw aggregations (include filterConfig hash in cache key for smart invalidation)
    this.cache.setFilterResults(shop, filters, aggregations, undefined, filterConfigHash);

    return this.formatAggregations(aggregations);
  }

  /**
   * Search products with filters
   * Only calculates aggregations for enabled filter options in filterConfig
   */
  async searchProducts(shop: string, filters?: ProductSearchInput, filterConfig?: Filter | null): Promise<ProductSearchResult> {
    if (!shop) {
      throw new Error('Shop parameter is required');
    }

    // Generate filter config hash for cache key
    const filterConfigHash = getFilterConfigHash(filterConfig);
    
    // Try to get from cache first (include filterConfig hash in cache key)
    const cachedResult = this.cache.getSearchResults(shop, filters, filterConfigHash);
    if (cachedResult) {
      this.log.info('Cache hit for search', { shop, filters, filterConfigHash });
      return cachedResult;
    }

    this.log.info(`Searching products for shop: ${shop}`, filters);

    const result = await this.repo.searchProducts(shop, filters, filterConfig);

    // Cache the result (include filterConfig hash in cache key for smart invalidation)
    this.cache.setSearchResults(shop, filters, result, undefined, filterConfigHash);

    this.log.info(`Found ${result.total} products (page ${result.page} of ${result.totalPages})`);

    return result;
  }

  /**
   * Format aggregations to ProductFilters format
   * Converts Elasticsearch aggregation buckets to the format expected by the frontend
   */
  private formatAggregations(aggregations: FacetAggregations): ProductFilters {
    const normalizeBuckets = (agg?: TermsAggregation): Array<{ value: string; count: number }> =>
      (agg?.buckets ?? [])
        .filter((bucket) => bucket.key)
        .map((bucket) => ({
          value: bucket.key,
          count: bucket.doc_count,
        }));

    const optionEntries: Record<string, Array<{ value: string; count: number }>> = {};
    const optionBuckets = aggregations?.optionPairs?.buckets ?? [];

    for (const bucket of optionBuckets) {
      const key = bucket.key || '';
      if (!key.includes('::')) continue;
      const [optionName, optionValue] = key.split('::');
      if (!optionName || !optionValue) continue;

      if (!optionEntries[optionName]) {
        optionEntries[optionName] = [];
      }

      optionEntries[optionName].push({
        value: optionValue,
        count: bucket.doc_count,
      });
    }

    for (const entry of Object.values(optionEntries)) {
      entry.sort((a, b) => b.count - a.count);
    }

    return {
      vendors: normalizeBuckets(aggregations?.vendors),
      productTypes: normalizeBuckets(aggregations?.productTypes),
      tags: normalizeBuckets(aggregations?.tags),
      collections: normalizeBuckets(aggregations?.collections),
      options: optionEntries,
      priceRange: aggregations?.priceRange,
      variantPriceRange: aggregations?.variantPriceRange,
    };
  }
}

