/**
 * Cache GraphQL Resolvers
 * Exposes cache inspection and clearing via GraphQL.
 */

import { getCacheService } from '@core/cache';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('cache-resolvers');

type CacheArea = 'search' | 'filters' | 'filterList';

function normalizeArea(area: unknown): CacheArea | undefined {
  if (area === 'search' || area === 'filters' || area === 'filterList') return area;
  return undefined;
}

function isCacheAdminEnabled(): boolean {
  // Default: enabled in non-production, disabled in production unless explicitly enabled.
  const env = (process.env.NODE_ENV || 'development').toLowerCase().trim();
  const raw = process.env.GRAPHQL_CACHE_ADMIN_ENABLED;
  if (raw !== undefined) {
    const v = String(raw).toLowerCase().trim();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
  }
  return env !== 'production';
}

function requireCacheAdminEnabled(): void {
  if (!isCacheAdminEnabled()) {
    throw new Error('Cache admin GraphQL operations are disabled (set GRAPHQL_CACHE_ADMIN_ENABLED=true to enable)');
  }
}

export const cacheResolvers = {
  Query: {
    cacheConfig: async () => {
      requireCacheAdminEnabled();
      const cache = getCacheService();
      return cache.getConfig();
    },
    cacheStats: async () => {
      requireCacheAdminEnabled();
      const cache = getCacheService();
      return cache.getStats();
    },
    cacheEntries: async (_parent: any, args: { input?: any }) => {
      requireCacheAdminEnabled();
      const cache = getCacheService();
      const input = args?.input || {};
      const area = normalizeArea(input.area);
      const limit = typeof input.limit === 'number' ? input.limit : undefined;
      return cache.listEntries({
        area,
        shop: input.shop,
        keyContains: input.keyContains,
        limit,
        includeExpired: input.includeExpired === true,
      });
    },
  },
  Mutation: {
    cacheClearAll: async () => {
      requireCacheAdminEnabled();
      const cache = getCacheService();
      const { cleared } = cache.clearWithCounts();
      logger.info('cacheClearAll executed', { cleared });
      return { success: true, cleared, details: { scope: 'all' } };
    },
    cacheClearShop: async (_parent: any, args: { shop: string }) => {
      requireCacheAdminEnabled();
      const cache = getCacheService();
      const shop = String(args.shop || '').trim();
      if (!shop) {
        return { success: false, cleared: 0, details: { error: 'shop is required' } };
      }
      const counts = cache.invalidateShop(shop);
      const cleared = counts.searchInvalidated + counts.filterInvalidated + counts.filterListInvalidated;
      logger.info('cacheClearShop executed', { shop, ...counts });
      return { success: true, cleared, details: { shop, ...counts } };
    },
    cacheClearByKeyContains: async (_parent: any, args: { keyContains: string; area?: string }) => {
      requireCacheAdminEnabled();
      const cache = getCacheService();
      const needle = String(args.keyContains || '').trim();
      const area = normalizeArea(args.area);
      const { cleared } = cache.clearByKeyContains(needle, area);
      logger.info('cacheClearByKeyContains executed', { keyContains: needle, area: area || 'all', cleared });
      return { success: true, cleared, details: { keyContains: needle, area: area || 'all' } };
    },
  },
};

