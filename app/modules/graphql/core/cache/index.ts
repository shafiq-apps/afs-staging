/**
 * Cache Module
 * Full-featured caching system for high-performance filtering and searching
 */

export { CacheManager } from './cache.manager';
export type { CacheOptions } from './cache.manager';
export { generateSearchCacheKey, generateFilterCacheKey, generateCacheKeyPattern, matchesPattern } from './cache.key';
export { CacheService, getCacheService } from './cache.service';
export type { CacheServiceOptions } from './cache.service';

