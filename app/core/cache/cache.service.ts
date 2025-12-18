/**
 * Cache Service
 * High-level cache service for product search and filters
 */

import { CacheManager, CacheOptions } from './cache.manager';
import { generateSearchCacheKey, generateFilterCacheKey, generateCacheKeyPattern, matchesPattern } from './cache.key';
import { ProductSearchInput, ProductSearchResult, FacetAggregations, ProductFilterInput } from '@shared/storefront/types';
import { createModuleLogger } from '@shared/utils/logger.util';
import { Filter } from '@shared/filters/types';

// Enable cache service logging (can be disabled via env var)
const logger = createModuleLogger('cache-service', {
  disabled: process.env.CACHE_LOG_DISABLED === 'true'
});

export interface CacheServiceOptions extends CacheOptions {
  searchTTL?: number; // TTL for search results (default: 5 minutes)
  filterTTL?: number; // TTL for filter results (default: 10 minutes)
  filterListTTL?: number; // TTL for filter list results (default: 10 minutes)
  enableStats?: boolean; // Enable cache statistics tracking
}

export class CacheService {
  private searchCache: CacheManager<ProductSearchResult>;
  private filterCache: CacheManager<FacetAggregations>;
  private filterListCache: CacheManager<{ filters: Filter[]; total: number }>;
  private readonly searchTTL: number;
  private readonly filterTTL: number;
  private readonly filterListTTL: number;
  private readonly enableStats: boolean;

  // Statistics
  private searchHits = 0;
  private searchMisses = 0;
  private filterHits = 0;
  private filterMisses = 0;
  private filterListHits = 0;
  private filterListMisses = 0;

  constructor(options: CacheServiceOptions = {}) {
    const cacheOptions: CacheOptions = {
      ttl: options.ttl,
      maxSize: options.maxSize || parseInt(process.env.CACHE_MAX_SIZE || '2000'),
      checkInterval: options.checkInterval,
    };

    this.searchCache = new CacheManager<ProductSearchResult>(cacheOptions);
    this.filterCache = new CacheManager<FacetAggregations>(cacheOptions);
    this.filterListCache = new CacheManager<{ filters: Filter[]; total: number }>(cacheOptions);
    this.searchTTL = options.searchTTL || parseInt(process.env.CACHE_SEARCH_TTL || '300000'); // 5 minutes
    this.filterTTL = options.filterTTL || parseInt(process.env.CACHE_FILTER_TTL || '600000'); // 10 minutes
    this.filterListTTL = options.filterListTTL || parseInt(process.env.CACHE_FILTER_LIST_TTL || '600000'); // 10 minutes
    this.enableStats = options.enableStats !== false;

    if (this.isEnabled() === false) {
      logger.info('Cache service disabled');
      return null;
    }
    else{
      logger.info('Cache service initialized', {
        searchTTL: this.searchTTL,
        filterTTL: this.filterTTL,
        filterListTTL: this.filterListTTL,
        enableStats: this.enableStats,
      });
    }
  }

  isEnabled(): boolean {
    return !(process.env.CACHE_DISABLED === 'true' || process.env.CACHE_DISABLED === '1');
  }

  /**
   * Get cached filter list for a shop
   * Caches based on shop + cpid (collection page ID) for optimal performance
   */
  getFilterList(shopDomain: string, cpid?: string): { filters: Filter[]; total: number } | null {
    const key = this.generateFilterListCacheKey(shopDomain, cpid);
    const result = this.filterListCache.get(key);

    if (result) {
      if (this.enableStats) {
        this.filterListHits++;
      }
      logger.info('Filter list cache hit', { key, shopDomain, cpid: cpid || 'none' });
      return result;
    }

    if (this.enableStats) {
      this.filterListMisses++;
    }
    logger.info('Filter list cache miss', { key, shopDomain, cpid: cpid || 'none' });
    return null;
  }

  /**
   * Set cached filter list for a shop
   */
  setFilterList(
    shopDomain: string,
    data: { filters: Filter[]; total: number },
    ttl?: number,
    cpid?: string
  ): void {
    if (this.isEnabled() === false) {
      logger.info('Cache disabled', { shopDomain });
      return null;
    }
    const key = this.generateFilterListCacheKey(shopDomain, cpid);
    this.filterListCache.set(key, data, ttl || this.filterListTTL);
    logger.info('Filter list cached', { key, shopDomain, cpid: cpid || 'none', filterCount: data.filters.length });
  }

  /**
   * Generate cache key for filter list
   * Key format: filter-list:shopDomain:cpid:hash
   * If cpid is not provided, uses 'all' as placeholder
   */
  private generateFilterListCacheKey(shopDomain: string, cpid?: string): string {
    // Normalize cpid: extract numeric ID if it's in GID format
    const normalizedCpid = cpid 
      ? (cpid.startsWith('gid://') ? cpid.split('/').pop() || cpid : cpid)
      : 'all';
    
    return `filter-list:${shopDomain}:cpid:${normalizedCpid}`;
  }

  /**
   * Invalidate filter list cache for a shop
   * Optionally invalidate only for a specific cpid
   */
  invalidateFilterList(shopDomain: string, cpid?: string): void {
    if (cpid) {
      // Invalidate specific cpid cache
      const key = this.generateFilterListCacheKey(shopDomain, cpid);
      const deleted = this.filterListCache.delete(key);
      if (deleted) {
        logger.info('Filter list cache invalidated for specific cpid', { key, shopDomain, cpid });
      }
    } else {
      // Invalidate all filter list caches for this shop
      const pattern = `filter-list:${shopDomain}:cpid:*`;
      let invalidated = 0;
      for (const key of this.filterListCache.keys()) {
        if (matchesPattern(key, pattern)) {
          this.filterListCache.delete(key);
          invalidated++;
        }
      }
      if (invalidated > 0) {
        logger.info('Filter list cache invalidated for shop', { shopDomain, invalidated });
      }
    }
  }

  /**
   * Get cached search results
   */
  getSearchResults(shopDomain: string, filters?: ProductSearchInput, filterConfigHash?: string): ProductSearchResult | null {
    if (this.isEnabled() === false) {
      logger.info('Cache disabled', { shopDomain });
      return null;
    }
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
    if (this.isEnabled() === false) {
      logger.info('Cache disabled', { shopDomain });
      return null;
    }
    const key = generateSearchCacheKey(shopDomain, filters, filterConfigHash);
    this.searchCache.set(key, results, ttl || this.searchTTL);
    logger.info('Search results cached', { key, shopDomain });
  }

  /**
   * Get cached filter results
   */
  getFilterResults(shopDomain: string, filters?: ProductFilterInput, filterConfigHash?: string): FacetAggregations | null {
    if (this.isEnabled() === false) {
      logger.info('Cache disabled', { shopDomain });
      return null;
    }
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
    if (this.isEnabled() === false) {
      logger.info('Cache disabled', { shopDomain });
      return null;
    }
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
    let filterListInvalidated = 0;

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

    // Invalidate filter list cache
    this.invalidateFilterList(shopDomain);
    const filterListPattern = `filter-list:${shopDomain}:cpid:*`;
    for (const key of this.filterListCache.keys()) {
      if (matchesPattern(key, filterListPattern)) {
        this.filterListCache.delete(key);
        filterListInvalidated++;
      }
    }

    logger.info('Shop cache invalidated', {
      shopDomain,
      searchInvalidated,
      filterInvalidated,
      filterListInvalidated,
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
    this.filterListCache.clear();
    this.resetStats();
    logger.info('All cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const searchStats = this.searchCache.getStats();
    const filterStats = this.filterCache.getStats();
    const filterListStats = this.filterListCache.getStats();

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
      filterList: {
        ...filterListStats,
        hits: this.filterListHits,
        misses: this.filterListMisses,
        hitRate: this.calculateHitRate(this.filterListHits, this.filterListMisses),
      },
      total: {
        size: searchStats.size + filterStats.size + filterListStats.size,
        hits: this.searchHits + this.filterHits + this.filterListHits,
        misses: this.searchMisses + this.filterMisses + this.filterListMisses,
        hitRate: this.calculateHitRate(
          this.searchHits + this.filterHits + this.filterListHits,
          this.searchMisses + this.filterMisses + this.filterListMisses
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
    this.filterListHits = 0;
    this.filterListMisses = 0;
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

