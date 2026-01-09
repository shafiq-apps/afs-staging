/**
 * Products Service
 * Business logic for product filtering and searching
 */

import { Injectable } from '@shared/types/global.type';
import { StorefrontSearchRepository } from './repository';
import {
  ProductFilterInput,
  ProductSearchInput,
  ProductFilters,
  ProductSearchResult,
  FacetAggregations,
  FacetValue,
  TermsAggregation,
} from './types';
import { createModuleLogger } from '@shared/utils/logger.util';
import { getCacheService } from '@core/cache';
import { Filter } from '@shared/filters/types';
import { getFilterConfigHash } from './filter-config.helper';

const logger = createModuleLogger('storefront-service');

export class StorefrontSearchService implements Injectable {
  private readonly log = logger;
  private readonly cache = getCacheService();

  constructor(private repo: StorefrontSearchRepository) { }

  /**
   * Get product filters (facets/aggregations)
   * Only calculates aggregations for enabled filter options in filterConfig
   */
  async getFilters(shop: string, filters?: ProductFilterInput, filterConfig?: Filter | null): Promise<ProductFilters> {
    if (!shop) {
      throw new Error('Shop parameter is required');
    }

    // Generate filter config hash for cache key (include runtime filters)
    const filterConfigHash = getFilterConfigHash(filterConfig, filters);

    // Try to get from cache first (include filterConfig hash in cache key)
    const cachedAggregations = this.cache.getFilterResults(shop, filters, filterConfigHash);
    if (cachedAggregations) {
      this.log.info('Cache hit for filters', { shop, filters, filterConfigHash });
      return this.formatAggregations(cachedAggregations);
    }

    this.log.info(`Fetching filters for shop: ${shop}`, filters);

    // When filterConfig is null/undefined, include all options (for GraphQL and general use)
    const includeAllOptions = !filterConfig || !filterConfig.options;
    const { aggregations } = await this.repo.getFacets(shop, filters, filterConfig, includeAllOptions);

    // Cache the raw aggregations (include filterConfig hash in cache key for smart invalidation)
    this.cache.setFilterResults(shop, filters, aggregations, undefined, filterConfigHash);

    return this.formatAggregations(aggregations);
  }

  /**
   * Fetch raw facet aggregations without formatting
   * Used by modules that need full control over formatting logic
   * 
   * Smart caching: First checks filter cache, then checks if aggregations
   * were already computed in a previous products endpoint call (search cache)
   * to avoid redundant ES queries.
   */
  async getRawAggregations(shop: string, filters?: ProductFilterInput, filterConfig?: Filter | null): Promise<FacetAggregations> {
    // Generate filter config hash for cache key (include runtime filters)
    const filterConfigHash = getFilterConfigHash(filterConfig, filters);

    // Step 1: Check filter cache first (fastest path)
    const cachedAggregations = this.cache.getFilterResults(shop, filters, filterConfigHash);
    if (cachedAggregations) {
      this.log.info('Cache hit for raw aggregations (filter cache)', { shop, filters, filterConfigHash });
      return cachedAggregations;
    }

    // Step 2: Check if aggregations were already computed in products endpoint (search cache)
    // Convert ProductFilterInput to ProductSearchInput (they're compatible, ProductFilterInput is a subset)
    // Try common pagination values that products endpoint typically uses
    const searchInput: ProductSearchInput = {
      ...filters,
      includeFilters: true, // Products endpoint includes filters when this is true
    };

    // Try to find cached search results with same filters (pagination may vary, but aggregations are the same)
    // Try most common case first: page 1, limit 20
    const commonSearchInput: ProductSearchInput = {
      ...searchInput,
      page: 1,
      limit: 20,
    };

    const cachedSearchResult = this.cache.getSearchResults(shop, commonSearchInput, filterConfigHash);
    if (cachedSearchResult?.filters) {
      this.log.info('Cache hit for raw aggregations (search cache)', {
        shop,
        filters,
        filterConfigHash,
        source: 'products_endpoint_cache'
      });

      // Cache the aggregations in filter cache for future direct lookups
      this.cache.setFilterResults(shop, filters, cachedSearchResult.filters, undefined, filterConfigHash);

      return cachedSearchResult.filters;
    }

    // Step 3: Cache miss - query ES and cache the result
    this.log.info('Cache miss for raw aggregations, querying ES', { shop, filters, filterConfigHash });
    // For REST endpoint, we want all options when filterConfig is null/undefined
    // This ensures format Filters gets all aggregations to work with
    const includeAllOptions = !filterConfig || !filterConfig.options;
    const { aggregations } = await this.repo.getFacets(shop, filters, filterConfig, includeAllOptions);

    // Cache the raw aggregations for future requests
    this.cache.setFilterResults(shop, filters, aggregations, undefined, filterConfigHash);

    return aggregations;
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
    const filterConfigHash = getFilterConfigHash(filterConfig, filters);

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
   * Advanced search with autocomplete and typo tolerance
   * Uses Elasticsearch fuzzy matching and prefix queries for partial word matching
   * Optimized for maximum speed with caching
   */
  async searchProductsWithAutocomplete(
    shop: string,
    searchQuery: string,
    filters?: ProductSearchInput,
    filterConfig?: Filter | null
  ): Promise<ProductSearchResult> {
    if (!shop) {
      throw new Error('Shop parameter is required');
    }

    if (!searchQuery || !searchQuery.trim()) {
      throw new Error('Search query is required');
    }

    const trimmedQuery = searchQuery.trim();
    
    // Generate cache key for autocomplete search
    const filterConfigHash = getFilterConfigHash(filterConfig, filters);
    const cacheKey = `autocomplete:${shop}:${trimmedQuery}:${JSON.stringify(filters || {})}:${filterConfigHash || ''}`;
    
    // Try cache first for maximum speed
    const cachedResult = this.cache.getSearchResults(shop, { ...filters, search: trimmedQuery }, filterConfigHash);
    if (cachedResult) {
      this.log.debug('Autocomplete cache hit', { shop, query: trimmedQuery });
      return cachedResult;
    }

    // Perform search
    const result = await this.repo.searchProductsWithAutocomplete(shop, trimmedQuery, filters, filterConfig);

    // Cache the result for fast subsequent requests
    this.cache.setSearchResults(shop, { ...filters, search: trimmedQuery }, result, undefined, filterConfigHash);

    return result;
  }

  /**
   * Get search suggestions based on actual product data from Elasticsearch
   * Returns real suggestions from product titles, not fake ones
   * Includes partial matches (e.g., "Sheep" finds "Sheepskin")
   */
  async getSearchSuggestions(
    shop: string,
    query: string,
    limit: number = 5
  ): Promise<string[]> {
    if (!shop || !query) {
      return [];
    }

    try {
      const suggestions = await this.repo.getSearchSuggestions(shop, query.trim(), limit);
      return suggestions;
    } catch (error: any) {
      this.log.debug('Failed to get search suggestions', { shop, query, error: error?.message });
      return [];
    }
  }

  /**
   * Get "Did you mean" suggestions when no results are found
   * Returns similar queries that would return results
   */
  async getDidYouMeanSuggestions(
    shop: string,
    query: string,
    limit: number = 3
  ): Promise<string[]> {
    if (!shop || !query) {
      return [];
    }

    try {
      const suggestions = await this.repo.getDidYouMeanSuggestions(shop, query.trim(), limit);
      return suggestions;
    } catch (error: any) {
      this.log.debug('Failed to get did you mean suggestions', { shop, query, error: error?.message });
      return [];
    }
  }

  /**
   * Format aggregations to ProductFilters format
   * Converts Elasticsearch aggregation buckets to the format expected by the frontend
   */
  private formatAggregations(aggregations: FacetAggregations): ProductFilters {
    const normalizeBuckets = (agg?: TermsAggregation): FacetValue[] =>
      (agg?.buckets ?? [])
        .filter((bucket) => bucket.key)
        .map((bucket) => ({
          value: bucket.key, // Original value for filtering
          count: bucket.doc_count,
          label: bucket.key, // Label for display (initially same as value)
        }));

    const optionEntries: Record<string, FacetValue[]> = {};
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
        value: optionValue, // Original value for filtering
        count: bucket.doc_count,
        label: optionValue, // Label for display (initially same as value)
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
      price: aggregations?.price
    };
  }
}

