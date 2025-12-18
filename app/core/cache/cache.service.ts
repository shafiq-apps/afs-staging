/**
 * Cache Service
 * High-level cache service for product search and filters
 */

import { CacheManager, CacheOptions } from './cache.manager';
import { generateSearchCacheKey, generateFilterCacheKey, generateCacheKeyPattern, matchesPattern } from './cache.key';
import { ProductSearchInput, ProductSearchResult, FacetAggregations, ProductFilterInput } from '@shared/storefront/types';
import { createModuleLogger } from '@shared/utils/logger.util';
import { Filter } from '@shared/filters/types';

const logger = createModuleLogger('cache-service');

export interface CacheServiceOptions extends CacheOptions {
  searchTTL?: number; // TTL for search results (default: 5 minutes)
  filterTTL?: number; // TTL for filter results (default: 10 minutes)
  filterListTTL?: number; // TTL for filter list results (default: 10 minutes)
  enableStats?: boolean; // Enable cache statistics tracking
}

export type CacheArea = 'search' | 'filters' | 'filterList';

export interface CacheEntryInfo {
  area: CacheArea;
  key: string;
  ageMs: number;
  expiresInMs: number;
  accessCount: number;
  lastAccessed: number;
  isExpired: boolean;
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
    const envMaxSize = parseInt(process.env.CACHE_MAX_SIZE || '2000', 10);
    const envDefaultTTL = parseInt(process.env.CACHE_TTL || process.env.CACHE_DEFAULT_TTL || '300000', 10);
    const envCheckInterval = parseInt(process.env.CACHE_CHECK_INTERVAL || '60000', 10);

    const cacheOptions: CacheOptions = {
      ttl: options.ttl ?? (isNaN(envDefaultTTL) ? 300000 : envDefaultTTL),
      maxSize: options.maxSize ?? (isNaN(envMaxSize) ? 2000 : envMaxSize),
      checkInterval: options.checkInterval ?? (isNaN(envCheckInterval) ? 60000 : envCheckInterval),
    };

    this.searchCache = new CacheManager<ProductSearchResult>(cacheOptions);
    this.filterCache = new CacheManager<FacetAggregations>(cacheOptions);
    this.filterListCache = new CacheManager<{ filters: Filter[]; total: number }>(cacheOptions);

    const envSearchTTL = parseInt(process.env.CACHE_SEARCH_TTL || '300000', 10); // 5 minutes
    const envFilterTTL = parseInt(process.env.CACHE_FILTER_TTL || '600000', 10); // 10 minutes
    const envFilterListTTL = parseInt(process.env.CACHE_FILTER_LIST_TTL || '600000', 10); // 10 minutes
    const envStatsEnabled = process.env.CACHE_STATS_ENABLED !== undefined
      ? !(['false', '0', 'no', 'off'].includes(String(process.env.CACHE_STATS_ENABLED).toLowerCase().trim()))
      : true;

    this.searchTTL = options.searchTTL ?? (isNaN(envSearchTTL) ? 300000 : envSearchTTL);
    this.filterTTL = options.filterTTL ?? (isNaN(envFilterTTL) ? 600000 : envFilterTTL);
    this.filterListTTL = options.filterListTTL ?? (isNaN(envFilterListTTL) ? 600000 : envFilterListTTL);
    this.enableStats = options.enableStats ?? envStatsEnabled;

    logger.info('Cache service initialized', {
      enabled: this.isEnabled(),
      defaultTTL: cacheOptions.ttl,
      maxSize: cacheOptions.maxSize,
      checkInterval: cacheOptions.checkInterval,
      searchTTL: this.searchTTL,
      filterTTL: this.filterTTL,
      filterListTTL: this.filterListTTL,
      enableStats: this.enableStats,
    });
  }

  isEnabled(): boolean {
    // Prefer CACHE_ENABLED if set; otherwise fallback to CACHE_DISABLED.
    if (process.env.CACHE_ENABLED !== undefined) {
      const v = String(process.env.CACHE_ENABLED).toLowerCase().trim();
      return !(v === 'false' || v === '0' || v === 'no' || v === 'off');
    }
    return !(process.env.CACHE_DISABLED === 'true' || process.env.CACHE_DISABLED === '1');
  }

  /**
   * Expose current cache configuration (for debugging/admin usage)
   */
  getConfig() {
    const maxSize = (this.searchCache.getStats()?.maxSize ?? undefined) as any;
    return {
      enabled: this.isEnabled(),
      maxSize: typeof maxSize === 'number' ? maxSize : parseInt(process.env.CACHE_MAX_SIZE || '2000', 10),
      defaultTTL: parseInt(process.env.CACHE_TTL || process.env.CACHE_DEFAULT_TTL || '300000', 10),
      checkInterval: parseInt(process.env.CACHE_CHECK_INTERVAL || '60000', 10),
      searchTTL: this.searchTTL,
      filterTTL: this.filterTTL,
      filterListTTL: this.filterListTTL,
      statsEnabled: this.enableStats,
      logDisabled: ['true', '1', 'yes', 'on'].includes(String(process.env.CACHE_LOG_DISABLED || '').toLowerCase().trim()),
    };
  }

  /**
   * List cache entry metadata (does not return values)
   */
  listEntries(options?: {
    area?: CacheArea;
    shop?: string;
    keyContains?: string;
    limit?: number;
    includeExpired?: boolean;
  }): CacheEntryInfo[] {
    const area = options?.area;
    const shop = options?.shop?.trim();
    const keyContains = options?.keyContains?.trim();
    const limit = Math.max(0, options?.limit ?? 200);
    const includeExpired = options?.includeExpired === true;

    const collect = (a: CacheArea, mgr: CacheManager<any>): CacheEntryInfo[] => {
      const keys = mgr.keys();
      const out: CacheEntryInfo[] = [];
      for (const key of keys) {
        if (shop && !key.includes(`:${shop}:`) && !key.includes(`:${shop}`)) continue;
        if (keyContains && !key.includes(keyContains)) continue;
        const info = mgr.getEntryInfo(key);
        if (!info) continue;
        if (!includeExpired && info.isExpired) continue;
        out.push({
          area: a,
          key: info.key,
          ageMs: info.age,
          expiresInMs: info.expiresIn,
          accessCount: info.accessCount,
          lastAccessed: info.lastAccessed,
          isExpired: info.isExpired,
        });
        if (limit > 0 && out.length >= limit) break;
      }
      return out;
    };

    const result: CacheEntryInfo[] = [];
    if (!area || area === 'search') result.push(...collect('search', this.searchCache));
    if (!area || area === 'filters') result.push(...collect('filters', this.filterCache));
    if (!area || area === 'filterList') result.push(...collect('filterList', this.filterListCache));
    return result.slice(0, limit > 0 ? limit : result.length);
  }

  /**
   * Clear cache entries by simple substring match on key.
   */
  clearByKeyContains(keyContains: string, area?: CacheArea): { cleared: number } {
    const needle = (keyContains || '').trim();
    if (!needle) return { cleared: 0 };

    const clearIn = (mgr: CacheManager<any>): number => {
      let cleared = 0;
      for (const key of mgr.keys()) {
        if (key.includes(needle)) {
          if (mgr.delete(key)) cleared++;
        }
      }
      return cleared;
    };

    let cleared = 0;
    if (!area || area === 'search') cleared += clearIn(this.searchCache);
    if (!area || area === 'filters') cleared += clearIn(this.filterCache);
    if (!area || area === 'filterList') cleared += clearIn(this.filterListCache);
    logger.info('Cache cleared by key substring', { keyContains: needle, area: area || 'all', cleared });
    return { cleared };
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
  invalidateShop(shopDomain: string): { searchInvalidated: number; filterInvalidated: number; filterListInvalidated: number } {
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

    return { searchInvalidated, filterInvalidated, filterListInvalidated };
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
   * Clear all cache and return number of entries removed
   */
  clearWithCounts(): { cleared: number } {
    const before =
      this.searchCache.keys().length +
      this.filterCache.keys().length +
      this.filterListCache.keys().length;
    this.clear();
    return { cleared: before };
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

