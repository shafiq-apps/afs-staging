/**
 * Cache Service
 * High-level cache service for product search and filters
 */

import { CacheManager, CacheOptions } from './cache.manager';
import { generateSearchCacheKey, generateFilterCacheKey, generateCacheKeyPattern, matchesPattern } from './cache.key';
import { ProductSearchInput, ProductSearchResult, FacetAggregations, ProductFilterInput } from '@shared/storefront/types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('cache-service', {disabled: true});

export interface CacheServiceOptions extends CacheOptions {
  searchTTL?: number; // TTL for search results (default: 5 minutes)
  filterTTL?: number; // TTL for filter results (default: 10 minutes)
  enableStats?: boolean; // Enable cache statistics tracking
}

export class CacheService {
  private searchCache: CacheManager<ProductSearchResult>;
  private filterCache: CacheManager<FacetAggregations>;
  private readonly searchTTL: number;
  private readonly filterTTL: number;
  private readonly enableStats: boolean;

  // Statistics
  private searchHits = 0;
  private searchMisses = 0;
  private filterHits = 0;
  private filterMisses = 0;

  constructor(options: CacheServiceOptions = {}) {
    const cacheOptions: CacheOptions = {
      ttl: options.ttl,
      maxSize: options.maxSize || parseInt(process.env.CACHE_MAX_SIZE || '2000'),
      checkInterval: options.checkInterval,
    };

    this.searchCache = new CacheManager<ProductSearchResult>(cacheOptions);
    this.filterCache = new CacheManager<FacetAggregations>(cacheOptions);
    this.searchTTL = options.searchTTL || parseInt(process.env.CACHE_SEARCH_TTL || '300000'); // 5 minutes
    this.filterTTL = options.filterTTL || parseInt(process.env.CACHE_FILTER_TTL || '600000'); // 10 minutes
    this.enableStats = options.enableStats !== false;

    logger.info('Cache service initialized', {
      searchTTL: this.searchTTL,
      filterTTL: this.filterTTL,
      enableStats: this.enableStats,
    });
  }

  /**
   * Get cached search results
   */
  getSearchResults(shopDomain: string, filters?: ProductSearchInput, filterConfigHash?: string): ProductSearchResult | null {
    const key = generateSearchCacheKey(shopDomain, filters, filterConfigHash);
    const result = this.searchCache.get(key);

    if (result) {
      if (this.enableStats) {
        this.searchHits++;
      }
      logger.info('Search cache hit', { key, shopDomain });
      return result;
    }

    if (this.enableStats) {
      this.searchMisses++;
    }
    logger.info('Search cache miss', { key, shopDomain });
    return null;
  }

  /**
   * Set cached search results
   */
  setSearchResults(
    shopDomain: string,
    filters: ProductSearchInput | undefined,
    results: ProductSearchResult,
    ttl?: number,
    filterConfigHash?: string
  ): void {
    const key = generateSearchCacheKey(shopDomain, filters, filterConfigHash);
    this.searchCache.set(key, results, ttl || this.searchTTL);
    logger.info('Search results cached', { key, shopDomain });
  }

  /**
   * Get cached filter results
   */
  getFilterResults(shopDomain: string, filters?: ProductFilterInput, filterConfigHash?: string): FacetAggregations | null {
    const key = generateFilterCacheKey(shopDomain, filters, filterConfigHash);
    const result = this.filterCache.get(key);

    if (result) {
      if (this.enableStats) {
        this.filterHits++;
      }
      logger.info('Filter cache hit', { key, shopDomain });
      return result;
    }

    if (this.enableStats) {
      this.filterMisses++;
    }
    logger.info('Filter cache miss', { key, shopDomain });
    return null;
  }

  /**
   * Set cached filter results
   */
  setFilterResults(
    shopDomain: string,
    filters: ProductFilterInput | undefined,
    results: FacetAggregations,
    ttl?: number,
    filterConfigHash?: string
  ): void {
    const key = generateFilterCacheKey(shopDomain, filters, filterConfigHash);
    this.filterCache.set(key, results, ttl || this.filterTTL);
    logger.info('Filter results cached', { key, shopDomain });
  }

  /**
   * Invalidate all cache for a shop
   */
  invalidateShop(shopDomain: string): void {
    const searchPattern = generateCacheKeyPattern('search', shopDomain);
    const filterPattern = generateCacheKeyPattern('filters', shopDomain);

    let searchInvalidated = 0;
    let filterInvalidated = 0;

    // Invalidate search cache
    for (const key of this.searchCache.keys()) {
      if (matchesPattern(key, searchPattern)) {
        this.searchCache.delete(key);
        searchInvalidated++;
      }
    }

    // Invalidate filter cache
    for (const key of this.filterCache.keys()) {
      if (matchesPattern(key, filterPattern)) {
        this.filterCache.delete(key);
        filterInvalidated++;
      }
    }

    logger.info('Shop cache invalidated', {
      shopDomain,
      searchInvalidated,
      filterInvalidated,
    });
  }

  /**
   * Invalidate specific search cache entry
   */
  invalidateSearch(shopDomain: string, filters?: ProductSearchInput): void {
    const key = generateSearchCacheKey(shopDomain, filters);
    const deleted = this.searchCache.delete(key);
    if (deleted) {
      logger.info('Search cache invalidated', { key, shopDomain });
    }
  }

  /**
   * Invalidate specific filter cache entry
   */
  invalidateFilter(shopDomain: string, filters?: ProductFilterInput): void {
    const key = generateFilterCacheKey(shopDomain, filters);
    const deleted = this.filterCache.delete(key);
    if (deleted) {
      logger.info('Filter cache invalidated', { key, shopDomain });
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.searchCache.clear();
    this.filterCache.clear();
    this.resetStats();
    logger.info('All cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const searchStats = this.searchCache.getStats();
    const filterStats = this.filterCache.getStats();

    const stats = {
      search: {
        ...searchStats,
        hits: this.searchHits,
        misses: this.searchMisses,
        hitRate: this.calculateHitRate(this.searchHits, this.searchMisses),
      },
      filter: {
        ...filterStats,
        hits: this.filterHits,
        misses: this.filterMisses,
        hitRate: this.calculateHitRate(this.filterHits, this.filterMisses),
      },
      total: {
        size: searchStats.size + filterStats.size,
        hits: this.searchHits + this.filterHits,
        misses: this.searchMisses + this.filterMisses,
        hitRate: this.calculateHitRate(
          this.searchHits + this.filterHits,
          this.searchMisses + this.filterMisses
        ),
      },
    };

    return stats;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.searchHits = 0;
    this.searchMisses = 0;
    this.filterHits = 0;
    this.filterMisses = 0;
    logger.info('Cache statistics reset');
  }

  /**
   * Calculate hit rate percentage
   */
  private calculateHitRate(hits: number, misses: number): string {
    const total = hits + misses;
    if (total === 0) {
      return '0%';
    }
    return ((hits / total) * 100).toFixed(2) + '%';
  }
}

// Singleton instance
let cacheServiceInstance: CacheService | null = null;

/**
 * Get or create cache service instance
 */
export function getCacheService(options?: CacheServiceOptions): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService(options);
  }
  return cacheServiceInstance;
}

