export const APP_NAME = "Advanced Filters & Search";

export const ONE_MINUTE_MS = 60000;

export const RATE_LIMIT = {
  DEFAULT: {
    MAX: 500,
    BUCKET_DURATION_MS: ONE_MINUTE_MS,
  },
  STOREFRONT_PRODUCTS: {
    MAX: 500,
    BUCKET_DURATION_MS: ONE_MINUTE_MS,
  },
  STOREFRONT_FILTERS: {
    MAX: 500,
    BUCKET_DURATION_MS: ONE_MINUTE_MS,
  },
  STOREFRONT_SEARCH: {
    MAX: 500,
    BUCKET_DURATION_MS: ONE_MINUTE_MS,
  },
  GRAPHQL_ENDPOINT: {
    MAX: 1000,
    BUCKET_DURATION_MS: ONE_MINUTE_MS,
  },
  REINDEXING: {
    MAX: 1,
    BUCKET_DURATION_MS: ONE_MINUTE_MS * 10, // 10 minutes wait until next request for indexing
  },
  EVENTS: {
    MAX: 100,
    BUCKET_DURATION_MS: ONE_MINUTE_MS * 5,
  },
};

export const RATE_LIMIT_PER_SECOND = {
  DEFAULT: {
    MAX: 30,
    BUCKET_DURATION_MS: 1000, // 1 second
  },
  STOREFRONT_PRODUCTS: {
    MAX: 30,
    BUCKET_DURATION_MS: 1000, // 1 second
  },
  STOREFRONT_FILTERS: {
    MAX: 30,
    BUCKET_DURATION_MS: 1000, // 1 second
  },
  STOREFRONT_SEARCH: {
    MAX: 30,
    BUCKET_DURATION_MS: 1000, // 1 second
  },
  GRAPHQL_ENDPOINT: {
    MAX: 50,
    BUCKET_DURATION_MS: 1000, // 1 second
  },
  REINDEXING: {
    MAX: 1,
    BUCKET_DURATION_MS: 1000, // 1 second - allow 1 request per second for indexing to prevent overload
  },
  EVENTS: {
    MAX: 30,
    BUCKET_DURATION_MS: 1000, // 1 second
  },
};