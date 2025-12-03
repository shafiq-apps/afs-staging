/**
 * Advanced Filter Search - Constants
 * Configuration constants for the filter system
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = {
    DEFAULT_DEBOUNCE_FILTERS: 150,
    DEFAULT_DEBOUNCE_SEARCH: 300,
    DEFAULT_TIMEOUT: 10000,
    DEFAULT_TIMEOUT_FILTERS: 5000,
    DEFAULT_TIMEOUT_PRODUCTS: 15000,
    CACHE_TTL_PRODUCTS: 2 * 60 * 1000,
    CACHE_TTL_FILTERS: 5 * 60 * 1000,
    DEFAULT_PAGE_SIZE: 20,
    MAX_RETRIES: 3,
    RETRY_DELAY_BASE: 1000,
    MAX_CACHE_SIZE: 100,
    PERFORMANCE_TARGET_RENDER: 100,
    PERFORMANCE_TARGET_API: 300
  };
  
  // Expose to global namespace
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.CONSTANTS = CONSTANTS;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.CONSTANTS = CONSTANTS;
  }
  
})(typeof window !== 'undefined' ? window : this);

