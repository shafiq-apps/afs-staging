export const APP_NAME = "Advanced Filters & Search";

export const ONE_MINUTE_MS = 60000;

export const RATE_LIMIT = {
  DEFAULT: {
    MAX: 60,
    BUCKET_DURATION_MS: ONE_MINUTE_MS,
  },
  STOREFRONT_PRODUCTS: {
    MAX: 120,
    BUCKET_DURATION_MS: ONE_MINUTE_MS,
  },
  STOREFRONT_FILTERS: {
    MAX: 120,
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
