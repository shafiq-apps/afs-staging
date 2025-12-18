/**
 * Cache GraphQL Schema
 * Admin/debug endpoints for inspecting and clearing in-memory cache.
 */
export const cacheSchema = `
  enum CacheArea {
    search
    filters
    filterList
  }

  type CacheConfig {
    enabled: Boolean!
    maxSize: Int!
    defaultTTL: Int!
    checkInterval: Int!
    searchTTL: Int!
    filterTTL: Int!
    filterListTTL: Int!
    statsEnabled: Boolean!
    logDisabled: Boolean!
  }

  type CacheEntry {
    area: CacheArea!
    key: String!
    ageMs: Float!
    expiresInMs: Float!
    accessCount: Int!
    lastAccessed: Float!
    isExpired: Boolean!
  }

  input CacheEntriesInput {
    area: CacheArea
    shop: String
    keyContains: String
    limit: Int
    includeExpired: Boolean
  }

  type CacheClearResult {
    success: Boolean!
    cleared: Int!
    details: JSON
  }

  type Query {
    cacheConfig: CacheConfig!
    cacheStats: JSON!
    cacheEntries(input: CacheEntriesInput): [CacheEntry!]!
  }

  type Mutation {
    cacheClearAll: CacheClearResult!
    cacheClearShop(shop: String!): CacheClearResult!
    cacheClearByKeyContains(keyContains: String!, area: CacheArea): CacheClearResult!
  }
`;

