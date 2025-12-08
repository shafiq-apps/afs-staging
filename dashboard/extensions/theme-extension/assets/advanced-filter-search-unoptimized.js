/**
 * Advanced Filter Search - Main JavaScript File
 * Fastest filter system for Shopify storefronts
 * 
 * Features:
 * - Zero page refresh (History API)
 * - Incremental DOM updates
 * - Debounced API calls
 * - Response caching
 * - Error handling
 * - Logger (can be disabled in production)
 */

(function(global) {
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  
  const CONSTANTS = {
    DEFAULT_DEBOUNCE_FILTERS: 150,
    DEFAULT_DEBOUNCE_SEARCH: 300,
    DEFAULT_TIMEOUT: 10000,
    DEFAULT_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    DEFAULT_PAGE_SIZE: 20,
    MAX_RETRIES: 3
  };

  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  const Utils = {
    /**
     * Debounce function
     */
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    /**
     * Sanitize HTML input
     */
    sanitizeHTML(input) {
      if (typeof input !== 'string') return '';
      const div = document.createElement('div');
      div.textContent = input;
      return div.innerHTML;
    },

    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    /**
     * Escape CSS selector special characters
     * Escapes characters that have special meaning in CSS attribute selectors
     * This prevents invalid selectors when attribute values contain special characters
     * 
     * For attribute selectors with double quotes, we need to escape:
     * - Backslashes: \ becomes \\
     * - Double quotes: " becomes \" (backslash-quote in the final CSS selector)
     * 
     * Since we're using template literals, we need to escape properly:
     * - To get \" in the final CSS, we need \\" in the JS string
     */
    escapeCSSSelector(str) {
      if (typeof str !== 'string') return '';
      // Escape backslashes first (they need to be escaped before other characters)
      // In the final CSS selector, we need \\ so in JS string we need \\\\
      let escaped = str.replace(/\\/g, '\\\\');
      // Escape double quotes (since we use double quotes in the selector)
      // In the final CSS selector, we need \" so in JS template literal we need \\"
      // This means in the JS string we need \\" which is written as '\\"'
      escaped = escaped.replace(/"/g, '\\"');
      return escaped;
    },

    /**
     * Parse comma-separated string to array
     */
    parseCommaSeparated(value) {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      return value.split(',').map(s => s.trim()).filter(Boolean);
    },

    /**
     * Get handle for an option name from filterConfig
     * Returns the handle if found, otherwise returns the original optionName
     * 
     * @param {string} optionName - The option name (e.g., "plyoboxes", "size", "color")
     * @param {object|null} filterConfig - The filter configuration object
     * @returns {string} - The handle (e.g., "pl_abc123") or original optionName if not found
     */
    getHandleForOptionName(optionName, filterConfig) {
      if (!optionName || !filterConfig || !filterConfig.options) {
        return optionName;
      }

      const lowerOptionName = String(optionName).toLowerCase().trim();
      
      // Find matching option in filterConfig
      const option = filterConfig.options.find(opt => {
        if (!opt.status || opt.status !== 'published') return false;
        
        // Match by variantOptionKey (most reliable)
        if (opt.variantOptionKey && opt.variantOptionKey.toLowerCase().trim() === lowerOptionName) {
          return true;
        }
        
        // Match by optionType
        if (opt.optionType && opt.optionType.toLowerCase().trim() === lowerOptionName) {
          return true;
        }
        
        // Match by label (case-insensitive)
        if (opt.label && opt.label.toLowerCase().trim() === lowerOptionName) {
          return true;
        }
        
        return false;
      });

      // Return handle if found, otherwise return original optionName
      if (option && option.handle) {
        return option.handle;
      }

      return optionName;
    },

    /**
     * Get option name for a handle from filterConfig
     * Returns the variantOptionKey (or optionType) if found, otherwise returns the original handle
     * 
     * @param {string} handle - The handle (e.g., "pl_abc123")
     * @param {object|null} filterConfig - The filter configuration object
     * @returns {string} - The option name (e.g., "plyoboxes") or original handle if not found
     */
    getOptionNameForHandle(handle, filterConfig) {
      if (!handle || !filterConfig || !filterConfig.options) {
        return handle;
      }

      const handleStr = String(handle).trim();
      
      // Find matching option in filterConfig by handle
      const option = filterConfig.options.find(opt => {
        if (!opt.status || opt.status !== 'published') return false;
        
        // Match by handle
        if (opt.handle && opt.handle === handleStr) {
          return true;
        }
        
        return false;
      });

      // Return variantOptionKey if available, otherwise optionType, otherwise original handle
      if (option) {
        return option.variantOptionKey || option.optionType || handle;
      }

      return handle;
    },

    /**
     * Determine if a key matches the short handle format (e.g., pr_a3k9x)
     */
    looksLikeHandle(key) {
      if (!key || typeof key !== 'string') return false;
      return /^[a-z]{2,3}_[a-z0-9]{3,10}$/.test(key.trim());
    },

    /**
     * Build query string from object
     * For options, converts option names to direct handles using filterConfig
     */
    buildQueryString(params, filterConfig = null, optionHandleMap = {}) {
      const searchParams = new URLSearchParams();
      Object.keys(params).forEach(key => {
        const value = params[key];
        if (value !== null && value !== undefined && value !== '') {
          // Handle options object structure
          if (key === 'options' && typeof value === 'object' && !Array.isArray(value)) {
            Object.keys(value).forEach(optKey => {
              const optValues = value[optKey];
              if (optValues !== null && optValues !== undefined && optValues !== '') {
                const normalizedKey = typeof optKey === 'string' ? optKey.toLowerCase() : '';
                const handleOrName =
                  (optionHandleMap && optionHandleMap[normalizedKey]) ||
                  (filterConfig ? Utils.getHandleForOptionName(optKey, filterConfig) : optKey);
                const paramKey = String(handleOrName || optKey).trim();
                if (!paramKey) {
                  return;
                }
                
                if (Array.isArray(optValues) && optValues.length > 0) {
                  // Ensure all values are strings
                  optValues.forEach(v => {
                    const stringValue = String(v).trim();
                    if (stringValue && stringValue !== '[object Object]') {
                      searchParams.append(paramKey, stringValue);
                    }
                  });
                } else if (typeof optValues === 'string' && optValues.trim() !== '') {
                  searchParams.set(paramKey, optValues.trim());
                }
              }
            });
          } else if (Array.isArray(value)) {
            // Ensure all array values are strings
            value.forEach(v => {
              const stringValue = String(v).trim();
              if (stringValue && stringValue !== '[object Object]') {
                searchParams.append(key, stringValue);
              }
            });
          } else if (typeof value === 'object' && value !== null) {
            // Skip objects that aren't options (they would become [object Object])
            // This shouldn't happen for other filter types, but handle it gracefully
            Logger.warn('Skipping object value in buildQueryString', { key, value });
          } else {
            const stringValue = String(value).trim();
            if (stringValue && stringValue !== '[object Object]') {
              searchParams.set(key, stringValue);
            }
          }
        }
      });
      return searchParams.toString();
    },

    /**
     * Parse query string to object
     */
    parseQueryString(queryString) {
      const params = {};
      const searchParams = new URLSearchParams(queryString);
      searchParams.forEach((value, key) => {
        if (params[key]) {
          if (Array.isArray(params[key])) {
            params[key].push(value);
          } else {
            params[key] = [params[key], value];
          }
        } else {
          params[key] = value;
        }
      });
      return params;
    },

    /**
     * Measure performance
     */
    measurePerformance(name, fn) {
      const start = performance.now();
      const result = fn();
      const duration = performance.now() - start;
      Logger.performance(name, duration);
      return result;
    }
  };

function buildOptionHandleMap(filters) {
  const map = {};
  if (!Array.isArray(filters)) {
    return map;
  }

  filters.forEach((filter) => {
    if (!filter || filter.type !== 'option') return;
    const key =
      String(filter.queryKey || filter.optionKey || filter.label || filter.handle || '')
        .toLowerCase()
        .trim();
    const handle = String(filter.handle || filter.queryKey || filter.optionKey || filter.label || '').trim();
    if (key && handle) {
      map[key] = handle;
    }
  });

  return map;
}

  // ============================================================================
  // LOGGER
  // ============================================================================
  
  const Logger = {
    enabled: false,
    level: 'error',
    prefix: '[AFS]',

    enable() {
      this.enabled = true;
      this.level = 'debug';
      this.info('Logger enabled');
    },

    disable() {
      this.enabled = false;
    },

    setLevel(level) {
      const levels = { error: 0, warn: 1, info: 2, debug: 3 };
      if (levels[level] === undefined) {
        throw new Error(`Invalid log level: ${level}`);
      }
      this.level = level;
    },

    shouldLog(level) {
      if (!this.enabled) return false;
      const levels = { error: 0, warn: 1, info: 2, debug: 3 };
      return levels[level] <= levels[this.level];
    },

    error(message, data) {
      if (!this.shouldLog('error')) return;
      console.error(`${this.prefix} [Error] ${message}`, data || '');
    },

    warn(message, data) {
      if (!this.shouldLog('warn')) return;
      console.warn(`${this.prefix} [Warn] ${message}`, data || '');
    },

    info(message, data) {
      if (!this.shouldLog('info')) return;
      console.info(`${this.prefix} [Info] ${message}`, data || '');
    },

    debug(message, data) {
      if (!this.shouldLog('debug')) return;
      console.debug(`${this.prefix} [Debug] ${message}`, data || '');
    },

    performance(name, duration) {
      if (!this.shouldLog('debug')) return;
      console.debug(`${this.prefix} [Performance] ${name}: ${duration.toFixed(2)}ms`);
      if (duration > 100) {
        this.warn(`${name} exceeded 100ms target: ${duration.toFixed(2)}ms`);
      }
    }
  };

  // Auto-enable in development
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('dev')) {
      Logger.enable();
    }
  }

  // ============================================================================
  // STATE MANAGER
  // ============================================================================
  
  const StateManager = {
    state: {
      shop: null,
      filters: {
        vendor: [],
        productType: [],
        tags: [],
        collections: [],
        options: {},
        search: ''
      },
      products: [],
      pagination: {
        page: 1,
        limit: CONSTANTS.DEFAULT_PAGE_SIZE,
        total: 0,
        totalPages: 0
      },
      sort: {
        field: 'createdAt',
        order: 'desc'
      },
      loading: false,
      error: null,
      availableFilters: [],
      filterConfig: null,
      optionHandleMap: {},
      preserveFilters: []
    },

    /**
     * Get current state
     */
    getState() {
      return { ...this.state };
    },

    /**
     * Update state (immutable)
     */
    updateState(updates) {
      const nextState = {
        ...this.state,
        ...updates,
        filters: updates.filters ? { ...this.state.filters, ...updates.filters } : this.state.filters
      };

      if ('availableFilters' in updates && Array.isArray(updates.availableFilters)) {
        nextState.availableFilters = updates.availableFilters;
        nextState.optionHandleMap = buildOptionHandleMap(updates.availableFilters);
      }

      if ('optionHandleMap' in updates) {
        nextState.optionHandleMap = updates.optionHandleMap || {};
      }

      if ('preserveFilters' in updates) {
        nextState.preserveFilters = updates.preserveFilters || [];
      }

      this.state = nextState;
      Logger.debug('State updated', this.state);
    },

    /**
     * Update filters
     */
    updateFilters(filters) {
      this.updateState({
        filters: { ...this.state.filters, ...filters }
      });
    },

    /**
     * Update products
     */
    updateProducts(products, pagination) {
      this.updateState({
        products: products || [],
        pagination: pagination || this.state.pagination,
        loading: false
      });
    },

    getOptionHandle(optionKey) {
      if (!optionKey) return null;
      const map = this.state.optionHandleMap || {};
      return map[String(optionKey).toLowerCase()] || null;
    },

    getPreserveFilters() {
      return this.state.preserveFilters || [];
    },

    /**
     * Set loading state
     */
    setLoading(loading) {
      this.updateState({ loading });
    },

    /**
     * Set error
     */
    setError(error) {
      this.updateState({ error, loading: false });
    }
  };

  // ============================================================================
  // URL MANAGER
  // ============================================================================
  
  const URLManager = {
    /**
     * Parse URL parameters
     * Converts handles in query params back to option names using filterConfig
     * Uses dynamic values from filterConfig.options or filters array based on handle matching
     */
    parseURL(filterConfig = null) {
      const url = new URL(window.location);
      const hasPreserveParam =
        url.searchParams.has('preserveFilters') || url.searchParams.has('preserveFilter');
      const params = {};
      
      // Get availableFilters from state for handle matching
      const state = StateManager.getState();
      const availableFilters = state.availableFilters || [];
      
      url.searchParams.forEach((value, key) => {
        // Skip shop - it's in config, not URL
        if (key === 'shop' || key === 'shop_domain') {
          // Don't parse shop from URL, it's in config
          return;
        } else if (key === 'vendor' || key === 'vendors') {
          params.vendor = Utils.parseCommaSeparated(value);
        } else if (key === 'productType' || key === 'productTypes') {
          params.productType = Utils.parseCommaSeparated(value);
        } else if (key === 'tag' || key === 'tags') {
          params.tags = Utils.parseCommaSeparated(value);
        } else if (key === 'collection' || key === 'collections') {
          params.collections = Utils.parseCommaSeparated(value);
        } else if (key === 'search') {
          params.search = value;
        } else if (key === 'page') {
          params.page = parseInt(value, 10) || 1;
        } else if (key === 'limit') {
          params.limit = parseInt(value, 10) || CONSTANTS.DEFAULT_PAGE_SIZE;
        } else if (key === 'sort') {
          const [field, order] = value.split(':');
          params.sort = { field, order: order || 'desc' };
        } else if (key === 'preserveFilters' || key === 'preserveFilter') {
          params.preserveFilters = Utils.parseCommaSeparated(value);
        } else if (key.startsWith('options[') || key.startsWith('option.')) {
          // Extract handle from query param
          const handle = key.replace(/^options?\[|\]|^option\./g, '');
          // Convert handle to option name using filterConfig
          const optionName = filterConfig 
            ? Utils.getOptionNameForHandle(handle, filterConfig)
            : handle;
          if (!params.options) params.options = {};
          params.options[optionName] = Utils.parseCommaSeparated(value);
        } else {
          // Check if key matches any option's handle in filterConfig.options
          let matchingOption = null;
          if (filterConfig && filterConfig.options && Array.isArray(filterConfig.options)) {
            matchingOption = filterConfig.options.find(opt => {
              if (!opt || !opt.status || opt.status !== 'published') return false;
              // Match by handle (exact match)
              return opt.handle && opt.handle === key;
            });
          }
          
          // If not found in filterConfig.options, check availableFilters array
          if (!matchingOption && Array.isArray(availableFilters)) {
            const matchingFilter = availableFilters.find(filter => {
              if (!filter || filter.type !== 'option') return false;
              // Match by handle (exact match)
              return filter.handle && filter.handle === key;
            });
            
            if (matchingFilter) {
              // Use the dynamic value from the matching filter
              // Get option name from queryKey, optionKey, or handle
              const optionName = matchingFilter.queryKey || matchingFilter.optionKey || matchingFilter.handle || key;
              if (!params.options) params.options = {};
              params.options[optionName] = Utils.parseCommaSeparated(value);
              return; // Skip further processing
            }
          }
          
          // If found in filterConfig.options, use that
          if (matchingOption) {
            // Use the dynamic value from the matching option
            // Convert handle to option name for internal use
            const optionName = matchingOption.variantOptionKey || matchingOption.optionType || matchingOption.handle || key;
            if (!params.options) params.options = {};
            params.options[optionName] = Utils.parseCommaSeparated(value);
          }
        }
      });
      
      if (params.preserveFilters) {
        StateManager.updateState({ preserveFilters: params.preserveFilters });
        delete params.preserveFilters;
      } else if (!hasPreserveParam) {
        StateManager.updateState({ preserveFilters: [] });
      }
      
      return params;
    },

    /**
     * Check if a value is empty
     */
    isEmpty(value) {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string') return value.trim() === '';
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return false;
    },

    /**
     * Check if filter has any actual values
     */
    hasFilterValues(filters) {
      return Object.keys(filters).some(key => {
        const value = filters[key];
        if (this.isEmpty(value)) return false;
        
        // For options object, check if any option has values
        if (key === 'options' && typeof value === 'object') {
          return Object.keys(value).some(optKey => {
            return !this.isEmpty(value[optKey]);
          });
        }
        
        return true;
      });
    },

    /**
     * Update URL without page refresh
     * Only includes parameters that user explicitly set (filters, pagination if > 1)
     * For options, converts option names to handles using filterConfig
     */
    updateURL(filters, pagination, sort, options = {}) {
      const url = new URL(window.location);
      const state = StateManager.getState();
      
      // Get filterConfig from state if available
      const filterConfig = options.filterConfig || state.filterConfig;
      const optionHandleMap = state.optionHandleMap || {};
      
      // Clear existing params
      url.search = '';
      
      // DO NOT add shop - it's in config, not URL
      
      // Only add filters if they have actual values
      if (filters && this.hasFilterValues(filters)) {
        Object.keys(filters).forEach(key => {
          const value = filters[key];
          
          // Skip empty values
          if (this.isEmpty(value)) return;
          
          // Handle array filters (vendor, productType, tags, collections)
          if (Array.isArray(value) && value.length > 0) {
            url.searchParams.set(key, value.join(','));
          } 
          // Handle options object - convert option names to handles
          else if (key === 'options' && typeof value === 'object' && !Array.isArray(value)) {
            Object.keys(value).forEach(optKey => {
              const optValues = value[optKey];
              if (!this.isEmpty(optValues) && Array.isArray(optValues) && optValues.length > 0) {
                const normalizedKey = optKey.toLowerCase();
                const handle =
                  optionHandleMap[normalizedKey] ||
                  (filterConfig ? Utils.getHandleForOptionName(optKey, filterConfig) : optKey);
                const paramKey = String(handle || optKey).trim();
                if (!paramKey) return;
                url.searchParams.set(paramKey, optValues.join(','));
              }
            });
          }
          // Handle search string
          else if (key === 'search' && typeof value === 'string' && value.trim() !== '') {
            url.searchParams.set(key, value.trim());
          }
        });
      }
      
      // Only add pagination if user explicitly navigated (page > 1)
      // Don't add limit unless user explicitly changed it (handled separately)
      if (pagination && pagination.page > 1) {
        url.searchParams.set('page', pagination.page);
      }
      // Don't add limit - it's a default, not user action
      
      const preserveFilters = state.preserveFilters || [];
      if (preserveFilters.length > 0) {
        url.searchParams.set('preserveFilters', preserveFilters.join(','));
      }
      
      // Update URL (no page refresh)
      history.pushState({ filters, pagination, sort }, '', url);
      Logger.debug('URL updated', url.toString());
    }
  };

  // ============================================================================
  // API CLIENT
  // ============================================================================
  
  const APIClient = {
    baseURL: 'http://localhost:3554',
    cache: new Map(),
    cacheTimestamps: new Map(),
    pendingRequests: new Map(),

    /**
     * Set base URL
     */
    setBaseURL(url) {
      this.baseURL = url;
    },

    /**
     * Get cache key
     */
    getCacheKey(filters, pagination, sort) {
      return JSON.stringify({ filters, pagination, sort });
    },

    /**
     * Get from cache
     */
    getFromCache(key) {
      const timestamp = this.cacheTimestamps.get(key);
      if (!timestamp) return null;
      
      if (Date.now() - timestamp > CONSTANTS.DEFAULT_CACHE_TTL) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
        return null;
      }
      
      return this.cache.get(key);
    },

    /**
     * Set cache
     */
    setCache(key, value) {
      this.cache.set(key, value);
      this.cacheTimestamps.set(key, Date.now());
    },

    /**
     * Fetch with timeout
     */
    async fetchWithTimeout(url, options, timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    },

    /**
     * Validate API response
     */
    validateResponse(data) {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response: must be an object');
      }
      if (!data.success) {
        throw new Error(data.message || 'API request failed');
      }
      if (!data.data || typeof data.data !== 'object') {
        throw new Error('Invalid response: data must be an object');
      }
      // For products response, check if products array exists
      if (data.data.products && !Array.isArray(data.data.products)) {
        throw new Error('Invalid response: products must be an array');
      }
      return true;
    },

    /**
     * Fetch products
     */
    async fetchProducts(filters, pagination, sort) {
      const cacheKey = this.getCacheKey(filters, pagination, sort);
      
      // Check cache
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        Logger.debug('Cache hit', { filters, pagination });
        return cached;
      }
      
      // Cancel previous request
      if (this.pendingRequests.has(cacheKey)) {
        this.pendingRequests.get(cacheKey).abort();
      }
      
      // Build URL
      const state = StateManager.getState();
      const params = {
        shop: state.shop,
        ...filters,
        page: pagination.page,
        limit: pagination.limit
      };

      const preserveFilters = state.preserveFilters || [];
      if (preserveFilters.length > 0) {
        params.preserveFilters = preserveFilters;
      }
      
      if (sort && sort.field) {
        params.sort = `${sort.field}:${sort.order || 'desc'}`;
      }
      
      // Get filterConfig from state for handle conversion
      const filterConfig = state.filterConfig;
      const optionHandleMap = state.optionHandleMap || {};
      const queryString = Utils.buildQueryString(params, filterConfig, optionHandleMap);
      const url = `${this.baseURL}/storefront/products?${queryString}`;
      
      Logger.debug('Fetching products', { url, filters, pagination });
      
      // Create abort controller
      const controller = new AbortController();
      this.pendingRequests.set(cacheKey, controller);
      
      try {
        const response = await this.fetchWithTimeout(
          url,
          { signal: controller.signal },
          CONSTANTS.DEFAULT_TIMEOUT
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseData = await response.json();
        
        Logger.debug('Products response received', { 
          hasData: !!responseData.data,
          responseKeys: Object.keys(responseData || {})
        });
        
        // Response structure: { success: true, data: { products, pagination, filters, filterConfig } }
        this.validateResponse(responseData);
        
        // Extract the data object (contains products, pagination, filters, filterConfig)
        const productsData = responseData.data;
        
        // Cache the processed data object (not the full response)
        this.setCache(cacheKey, productsData);
        
        // Clean up
        this.pendingRequests.delete(cacheKey);
        
        Logger.info('Products fetched successfully', { 
          count: productsData?.products ? productsData.products.length : 0,
          pagination: productsData?.pagination 
        });
        
        // Return the data object (contains products, pagination, filters, filterConfig)
        return productsData;
        
      } catch (error) {
        this.pendingRequests.delete(cacheKey);
        
        if (error.name === 'AbortError') {
          Logger.debug('Request cancelled');
          return null;
        }
        
        Logger.error('Failed to fetch products', {
          error: error.message,
          url,
          filters
        });
        
        throw error;
      }
    },

    /**
     * Fetch filters
     */
    async fetchFilters(filters) {
      const state = StateManager.getState();
      const params = {
        shop: state.shop,
        ...filters
      };

      const preserveFilters = state.preserveFilters || [];
      if (preserveFilters.length > 0) {
        params.preserveFilters = preserveFilters;
      }
      
      // Get filterConfig from state for handle conversion
      const filterConfig = state.filterConfig;
      const optionHandleMap = state.optionHandleMap || {};
      const queryString = Utils.buildQueryString(params, filterConfig, optionHandleMap);
      const url = `${this.baseURL}/storefront/filters?${queryString}`;
      
      Logger.debug('Fetching filters', { url, filters });
      
      try {
        const response = await this.fetchWithTimeout(
          url,
          {},
          CONSTANTS.DEFAULT_TIMEOUT
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseData = await response.json();
        
        Logger.debug('Filters response received', { responseData });
        
        // Response structure: { success: true, data: { filters, filterConfig, appliedFilters } }
        if (!responseData) {
          Logger.error('Empty filters response', { responseData });
          throw new Error('Empty filters response');
        }
        
        if (!responseData.success) {
          Logger.error('Filters request failed', { 
            message: responseData.message || 'Unknown error',
            responseData 
          });
          throw new Error(responseData.message || 'Filters request failed');
        }
        
        if (!responseData.data) {
          Logger.error('Invalid filters response: missing data', { responseData });
          throw new Error('Invalid filters response: missing data');
        }
        
        // Return filters object (contains filters, filterConfig, appliedFilters)
        const filtersData = Array.isArray(responseData.data.filters) ? responseData.data.filters : [];
        const filterCount = filtersData.length;
        
        Logger.info('Filters fetched successfully', { filterCount });
        
        // Return the full data object (contains filters, filterConfig, appliedFilters)
        return responseData.data;
        
      } catch (error) {
        Logger.error('Failed to fetch filters', {
          error: error.message,
          url,
          filters
        });
        
        throw error;
      }
    }
  };

  // ============================================================================
  // DOM RENDERER
  // ============================================================================
  
  const DOMRenderer = {
    container: null,
    appliedFiltersContainer: null,
    filtersContainer: null,
    productsInfoContainer: null,
    productsContainer: null,
    loadingIndicator: null,

    /**
     * Initialize containers
     */
    init(containerSelector, filtersSelector, productsSelector) {
      // Find container
      this.container = this.findElement(containerSelector);
      if (!this.container) {
        throw new Error(`Container not found: ${containerSelector}`);
      }
      
      // Set data attribute
      this.container.setAttribute('data-afs-container', 'true');
      
      // Create applied filters container (above everything)
      this.appliedFiltersContainer = document.createElement('div');
      this.appliedFiltersContainer.className = 'afs-applied-filters';
      this.container.insertBefore(this.appliedFiltersContainer, this.container.firstChild);
      
      // Create main content wrapper (filters and products side by side)
      let mainWrapper = this.container.querySelector('.afs-main-content');
      if (!mainWrapper) {
        mainWrapper = document.createElement('div');
        mainWrapper.className = 'afs-main-content';
        this.container.appendChild(mainWrapper);
      }
      
      // Find or create filters container
      this.filtersContainer = this.findElement(filtersSelector);
      if (!this.filtersContainer) {
        this.filtersContainer = document.createElement('div');
        this.filtersContainer.className = 'afs-filters-container';
        mainWrapper.appendChild(this.filtersContainer);
      } else if (this.filtersContainer.parentNode !== mainWrapper) {
        mainWrapper.appendChild(this.filtersContainer);
      }
      
      // Find or create products container
      this.productsContainer = this.findElement(productsSelector);
      if (!this.productsContainer) {
        this.productsContainer = document.createElement('div');
        this.productsContainer.className = 'afs-products-container';
        mainWrapper.appendChild(this.productsContainer);
      } else if (this.productsContainer.parentNode !== mainWrapper) {
        mainWrapper.appendChild(this.productsContainer);
      }
      
      // Create products info container (above products grid)
      this.productsInfoContainer = document.createElement('div');
      this.productsInfoContainer.className = 'afs-products-info';
      this.productsContainer.insertBefore(this.productsInfoContainer, this.productsContainer.firstChild);
      
      Logger.info('DOM containers initialized');
    },

    /**
     * Find element by selector (ID, class, or attribute)
     */
    findElement(selector) {
      if (!selector) return null;
      
      // Try ID
      if (selector.startsWith('#')) {
        return document.querySelector(selector);
      }
      
      // Try class
      if (selector.startsWith('.')) {
        return document.querySelector(selector);
      }
      
      // Try attribute
      if (selector.startsWith('[') && selector.endsWith(']')) {
        return document.querySelector(selector);
      }
      
      // Try as ID without #
      const byId = document.getElementById(selector);
      if (byId) return byId;
      
      // Try as class without .
      const byClass = document.querySelector(`.${selector}`);
      if (byClass) return byClass;
      
      // Try as attribute
      const byAttr = document.querySelector(`[${selector}]`);
      if (byAttr) return byAttr;
      
      return null;
    },

    /**
     * Render filters
     */
    renderFilters(filters, filterConfig = null) {
      if (!this.filtersContainer) return;
      
      const startTime = performance.now();
      
      if (!Array.isArray(filters)) {
        Logger.warn('Invalid filters data provided to renderFilters', { filters });
        this.filtersContainer.innerHTML = '';
        return;
      }
      
      const savedStates = {};
      const existingGroups = this.filtersContainer.querySelectorAll('.afs-filter-group');
      existingGroups.forEach(group => {
        const key =
          group.getAttribute('data-afs-filter-key') ||
          group.getAttribute('data-afs-option-name') ||
          group.getAttribute('data-afs-filter-type');
        
        if (!key) return;
        
        savedStates[key] = {
          collapsed: group.getAttribute('data-afs-collapsed') === 'true',
          searchValue: group.querySelector('.afs-filter-group__search-input')?.value || ''
        };
      });
      
      this.filtersContainer.innerHTML = '';
      
      Logger.debug('Rendering filters', { filterCount: filters.length });
      
      filters.forEach((filter) => {
        if (!filter) return;
        
        if (filter.type === 'priceRange' || filter.type === 'variantPriceRange') {
          // TODO: implement UI for range filters
          return;
        }
        
        const values = Array.isArray(filter.values) ? filter.values : [];
        if (values.length === 0) {
          return;
        }
        
        const isOptionFilter = filter.type === 'option';
        const optionName = isOptionFilter ? filter.queryKey : null;
        const baseFilterType = isOptionFilter ? `options_${optionName}` : filter.queryKey || filter.key;
        if (!baseFilterType) return;
        
        const displayLabel = filter.label || optionName || baseFilterType;
        const filterGroup = this.createFilterGroup(
          baseFilterType,
          values,
          optionName,
          displayLabel,
          filter
        );
        
        const stateKey = filter.key || (optionName ? `options:${optionName}` : baseFilterType);
        filterGroup.setAttribute('data-afs-filter-key', stateKey);
        
        const savedState = savedStates[stateKey];
        this.applySavedStateToGroup(filterGroup, savedState, filter);
        
        this.filtersContainer.appendChild(filterGroup);
      });
      
      const duration = performance.now() - startTime;
      Logger.performance('renderFilters', duration);
    },

    /**
     * Apply saved UI state (collapsed/search) to filter group
     */
    applySavedStateToGroup(group, savedState, filterMeta) {
      const shouldCollapse = savedState?.collapsed ?? (filterMeta?.collapsed === true);
      const toggleButton = group.querySelector('.afs-filter-group__toggle');
      
      group.setAttribute('data-afs-collapsed', shouldCollapse ? 'true' : 'false');
      if (toggleButton) {
        toggleButton.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
      }
      
      const searchInput = group.querySelector('.afs-filter-group__search-input');
      const searchValue = savedState?.searchValue || '';
      if (searchInput) {
        searchInput.value = searchValue;
        if (searchValue) {
          setTimeout(() => {
            const event = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(event);
          }, 0);
        }
      }
    },

    /**
     * Create filter group
     * @param {string} filterType - The filter type (e.g., 'vendors', 'options_Size')
     * @param {Array} items - Array of filter items
     * @param {string|null} optionName - Option name/key for filtering (used for data attributes)
     * @param {string|null} displayName - Display name for label (optional, defaults to optionName)
     * @param {object|null} configOption - Filter option config with settings (searchable, showCount, etc.)
     */
    createFilterGroup(filterType, items, optionName = null, displayName = null, configOption = null) {
      const group = document.createElement('div');
      // For options, use the base filterType but store optionName
      const baseFilterType = filterType.startsWith('options_') ? 'options' : filterType;
      group.className = 'afs-filter-group';
      group.setAttribute('data-afs-filter-type', baseFilterType);
      if (optionName) {
        group.setAttribute('data-afs-option-name', optionName);
      }
      
      // Collapsible header
      const header = document.createElement('div');
      header.className = 'afs-filter-group__header';
      
      // Toggle button with icon
      const toggleButton = document.createElement('button');
      toggleButton.className = 'afs-filter-group__toggle';
      toggleButton.setAttribute('type', 'button');
      toggleButton.setAttribute('aria-expanded', 'true');
      toggleButton.setAttribute('aria-label', 'Toggle filter section');
      
      // Collapse icon (chevron down when expanded)
      const icon = document.createElement('span');
      icon.className = 'afs-filter-group__icon';
      icon.innerHTML = '▼'; // Down arrow when expanded
      toggleButton.appendChild(icon);
      
      // Filter label - use displayName if provided, otherwise optionName, otherwise formatFilterLabel
      const label = document.createElement('label');
      label.className = 'afs-filter-group__label';
      label.textContent = displayName || optionName || this.formatFilterLabel(baseFilterType);
      toggleButton.appendChild(label);
      
      header.appendChild(toggleButton);
      group.appendChild(header);
      
      // Collapsible content wrapper
      const content = document.createElement('div');
      content.className = 'afs-filter-group__content';
      
      // Set initial state (expanded by default)
      group.setAttribute('data-afs-collapsed', 'false');
      
      // Search input - only show if searchable is true (top-level field)
      const isSearchable = configOption && configOption.searchable === true;
      if (isSearchable) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'afs-filter-group__search';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'afs-filter-group__search-input';
        searchInput.placeholder = 'Search...';
        searchInput.setAttribute('aria-label', `Search ${displayName || optionName || this.formatFilterLabel(baseFilterType)}`);
        searchContainer.appendChild(searchInput);
        
        content.appendChild(searchContainer);
      }
      
      // Filter items container
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'afs-filter-group__items';
      itemsContainer.setAttribute('data-afs-all-items', JSON.stringify(items.map(item => {
        const value = typeof item === 'string' ? item : (item.value || item.key || item.name || '');
        const label = typeof item === 'string' ? item : (item.label || item.value || item.key || item.name || '');
        return { value, label, original: item };
      })));
      
      items.forEach(item => {
        const itemElement = this.createFilterItem(baseFilterType, item, optionName, configOption);
        if (itemElement) {
          itemsContainer.appendChild(itemElement);
        }
      });
      
      content.appendChild(itemsContainer);
      group.appendChild(content);
      
      return group;
    },

    /**
     * Format filter label
     */
    formatFilterLabel(filterType) {
      const labels = {
        vendors: 'Vendor',
        productTypes: 'ProductType',
        tags: 'Tags',
        collections: 'Collections',
        options: 'Options'
      };
      return labels[filterType] || filterType;
    },

    /**
     * Create filter item (checkbox style)
     * @param {string} filterType - The filter type
     * @param {object|string} item - Filter item data
     * @param {string|null} optionName - Option name for options filters
     * @param {object|null} configOption - Filter option config with settings (showCount, etc.)
     */
    createFilterItem(filterType, item, optionName = null, configOption = null) {
      // Handle different item structures
      let itemValue, itemLabel;
      
      if (typeof item === 'string') {
        itemValue = item;
        itemLabel = item;
      } else if (typeof item === 'object' && item !== null) {
        // Extract value - handle case where value itself might be an object
        let rawValue = item.value || item.key || item.name || '';
        let rawLabel = item.label || item.value || item.key || item.name || '';
        
        // If rawValue is an object, try to extract a string from it
        if (typeof rawValue === 'object' && rawValue !== null) {
          // Try common object properties
          rawValue = rawValue.value || rawValue.key || rawValue.name || rawValue.label || '';
          // If still an object, convert to string (but this should be avoided)
          if (typeof rawValue === 'object' && rawValue !== null) {
            Logger.warn('Filter item value is nested object', { item, filterType, optionName });
            rawValue = '';
          }
        }
        
        // If rawLabel is an object, try to extract a string from it
        if (typeof rawLabel === 'object' && rawLabel !== null) {
          rawLabel = rawLabel.label || rawLabel.value || rawLabel.key || rawLabel.name || '';
          if (typeof rawLabel === 'object' && rawLabel !== null) {
            rawLabel = '';
          }
        }
        
        itemValue = rawValue;
        itemLabel = rawLabel;
        
        // If still no value, try to stringify safely
        if (!itemValue && !itemLabel) {
          Logger.warn('Filter item has no recognizable value', { item, filterType, optionName });
          return null; // Skip invalid items
        }
      } else {
        Logger.warn('Invalid filter item type', { item, filterType, optionName, type: typeof item });
        return null; // Skip invalid items
      }
      
      // Convert to string and validate
      const stringValue = String(itemValue).trim();
      
      // Skip if value is empty or invalid
      if (!stringValue || stringValue === '[object Object]' || stringValue === 'undefined' || stringValue === 'null' || stringValue === '') {
        Logger.warn('Filter item has invalid value', { itemValue, stringValue, item, filterType, optionName });
        return null;
      }
      
      // Use the validated string value
      itemValue = stringValue;
      
      // Create container
      const itemElement = document.createElement('label');
      itemElement.className = 'afs-filter-item';
      itemElement.setAttribute('data-afs-filter-type', filterType);
      itemElement.setAttribute('data-afs-filter-value', String(itemValue));
      if (optionName) {
        itemElement.setAttribute('data-afs-option-name', optionName);
      }
      
      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'afs-filter-item__checkbox';
      checkbox.setAttribute('data-afs-filter-type', filterType);
      checkbox.setAttribute('data-afs-filter-value', String(itemValue));
      if (optionName) {
        checkbox.setAttribute('data-afs-option-name', optionName);
      }
      checkbox.checked = false;
      itemElement.appendChild(checkbox);
      
      // Item label (always show)
      const label = document.createElement('span');
      label.className = 'afs-filter-item__label';
      label.textContent = String(itemLabel || itemValue);
      itemElement.appendChild(label);
      
      // Count badge - only show if showCount is true (top-level field)
      const shouldShowCount = configOption && configOption.showCount === true;
      if (shouldShowCount && item && typeof item === 'object' && item.count !== undefined) {
        const count = document.createElement('span');
        count.className = 'afs-filter-item__count';
        count.textContent = `(${item.count})`;
        itemElement.appendChild(count);
      }
      
      return itemElement;
    },

    /**
     * Update filter item active state
     */
    updateFilterActiveState(filterType, value, active, optionName = null) {
      // Escape special characters in selector values to prevent invalid selectors
      const escapedFilterType = Utils.escapeCSSSelector(String(filterType));
      const escapedValue = Utils.escapeCSSSelector(String(value));
      
      let selector = `.afs-filter-item[data-afs-filter-type="${escapedFilterType}"][data-afs-filter-value="${escapedValue}"]`;
      if (optionName) {
        const escapedOptionName = Utils.escapeCSSSelector(String(optionName));
        selector = `.afs-filter-item[data-afs-filter-type="${escapedFilterType}"][data-afs-option-name="${escapedOptionName}"][data-afs-filter-value="${escapedValue}"]`;
      }
      
      try {
        const item = this.filtersContainer.querySelector(selector);
        if (item) {
          const checkbox = item.querySelector('.afs-filter-item__checkbox');
          if (checkbox) {
            checkbox.checked = active;
          }
          item.classList.toggle('afs-filter-item--active', active);
        }
      } catch (error) {
        Logger.error('Invalid selector in updateFilterActiveState', {
          selector,
          filterType,
          value,
          optionName,
          error: error.message
        });
        // Fallback: find by iterating through elements
        const allItems = this.filtersContainer.querySelectorAll('.afs-filter-item');
        for (const item of allItems) {
          const itemFilterType = item.getAttribute('data-afs-filter-type');
          const itemValue = item.getAttribute('data-afs-filter-value');
          const itemOptionName = item.getAttribute('data-afs-option-name');
          
          if (itemFilterType === String(filterType) && 
              itemValue === String(value) &&
              (!optionName || itemOptionName === String(optionName))) {
            const checkbox = item.querySelector('.afs-filter-item__checkbox');
            if (checkbox) {
              checkbox.checked = active;
            }
            item.classList.toggle('afs-filter-item--active', active);
            break;
          }
        }
      }
    },

    /**
     * Render products
     */
    renderProducts(products, oldProducts = []) {
      if (!this.productsContainer) return;
      
      const startTime = performance.now();
      
      // Find or create products grid wrapper
      let productsGrid = this.productsContainer.querySelector('.afs-products-grid');
      if (!productsGrid) {
        productsGrid = document.createElement('div');
        productsGrid.className = 'afs-products-grid';
        // Insert after products info
        if (this.productsInfoContainer && this.productsInfoContainer.nextSibling) {
          this.productsContainer.insertBefore(productsGrid, this.productsInfoContainer.nextSibling);
        } else {
          this.productsContainer.appendChild(productsGrid);
        }
      }
      
      // Get existing product IDs
      const oldIds = new Set(oldProducts.map(p => p.id || p.gid));
      const newIds = new Set(products.map(p => p.id || p.gid));
      
      // Remove products not in new list
      const productsToRemove = oldProducts.filter(p => !newIds.has(p.id || p.gid));
      productsToRemove.forEach(product => {
        const element = productsGrid.querySelector(`[data-afs-product-id="${product.id || product.gid}"]`);
        if (element) {
          element.remove();
        }
      });
      
      // Create fragment for new products
      const fragment = document.createDocumentFragment();
      const productsToAdd = products.filter(p => !oldIds.has(p.id || p.gid));
      
      productsToAdd.forEach(product => {
        const productElement = this.createProductElement(product);
        fragment.appendChild(productElement);
      });
      
      // Update existing products
      products.forEach(product => {
        if (oldIds.has(product.id || product.gid)) {
          this.updateProductElement(product, productsGrid);
        }
      });
      
      // Insert new products
      if (fragment.children.length > 0) {
        productsGrid.appendChild(fragment);
      }
      
      const duration = performance.now() - startTime;
      Logger.performance('renderProducts', duration);
    },

    /**
     * Create product element
     */
    createProductElement(product) {
      const card = document.createElement('div');
      card.className = 'afs-product-card';
      card.setAttribute('data-afs-product-id', product.id || product.gid);
      
      // Product image
      if (product.imageUrl || product.featuredImage) {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'afs-product-card__image';
        
        const img = document.createElement('img');
        img.src = product.imageUrl || product.featuredImage?.url || '';
        img.alt = product.title || '';
        img.loading = 'lazy';
        imageContainer.appendChild(img);
        card.appendChild(imageContainer);
      }
      
      // Product info
      const info = document.createElement('div');
      info.className = 'afs-product-card__info';
      
      // Title
      const title = document.createElement('h3');
      title.className = 'afs-product-card__title';
      title.textContent = product.title || 'Untitled Product';
      info.appendChild(title);
      
      // Vendor
      if (product.vendor) {
        const vendor = document.createElement('div');
        vendor.className = 'afs-product-card__vendor';
        vendor.textContent = product.vendor;
        info.appendChild(vendor);
      }
      
      // Price
      if (product.priceRange) {
        const price = document.createElement('div');
        price.className = 'afs-product-card__price';
        const minPrice = product.priceRange.minVariantPrice?.amount || '0';
        const maxPrice = product.priceRange.maxVariantPrice?.amount || '0';
        if (minPrice === maxPrice) {
          price.textContent = `$${parseFloat(minPrice).toFixed(2)}`;
        } else {
          price.textContent = `$${parseFloat(minPrice).toFixed(2)} - $${parseFloat(maxPrice).toFixed(2)}`;
        }
        info.appendChild(price);
      }
      
      card.appendChild(info);
      
      return card;
    },

    /**
     * Update product element
     */
    updateProductElement(product, container = null) {
      const searchContainer = container || this.productsContainer;
      const element = searchContainer.querySelector(`[data-afs-product-id="${product.id || product.gid}"]`);
      if (!element) return;
      
      // Update title if changed
      const titleElement = element.querySelector('.afs-product-card__title');
      if (titleElement && titleElement.textContent !== product.title) {
        titleElement.textContent = product.title || 'Untitled Product';
      }
      
      // Update price if changed
      const priceElement = element.querySelector('.afs-product-card__price');
      if (priceElement && product.priceRange) {
        const minPrice = product.priceRange.minVariantPrice?.amount || '0';
        const maxPrice = product.priceRange.maxVariantPrice?.amount || '0';
        const newPrice = minPrice === maxPrice 
          ? `$${parseFloat(minPrice).toFixed(2)}`
          : `$${parseFloat(minPrice).toFixed(2)} - $${parseFloat(maxPrice).toFixed(2)}`;
        
        if (priceElement.textContent !== newPrice) {
          priceElement.textContent = newPrice;
        }
      }
    },

    /**
     * Show loading indicator
     */
    showLoading() {
      if (!this.productsContainer) return;
      
      if (!this.loadingIndicator) {
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.className = 'afs-loading-indicator';
        this.loadingIndicator.innerHTML = '<div class="afs-loading-spinner"></div><p>Loading products...</p>';
      }
      
      this.productsContainer.appendChild(this.loadingIndicator);
    },

    /**
     * Hide loading indicator
     */
    hideLoading() {
      if (this.loadingIndicator && this.loadingIndicator.parentNode) {
        this.loadingIndicator.remove();
      }
    },

    /**
     * Show error message
     */
    showError(message) {
      if (!this.productsContainer) return;
      
      const errorElement = document.createElement('div');
      errorElement.className = 'afs-error-message';
      errorElement.textContent = message || 'An error occurred. Please try again.';
      
      this.productsContainer.innerHTML = '';
      this.productsContainer.appendChild(errorElement);
    },

    /**
     * Render applied filters
     */
    renderAppliedFilters(filters) {
      if (!this.appliedFiltersContainer) return;
      
      const startTime = performance.now();
      
      // Clear existing
      this.appliedFiltersContainer.innerHTML = '';
      
      // Check if any filters are applied
      const hasFilters = Object.keys(filters).some(key => {
        const value = filters[key];
        if (Array.isArray(value)) {
          return value.length > 0;
        } else if (typeof value === 'object' && value !== null) {
          return Object.keys(value).length > 0;
        } else {
          return value && value !== '';
        }
      });
      
      if (!hasFilters) {
        const duration = performance.now() - startTime;
        Logger.performance('renderAppliedFilters', duration);
        return;
      }
      
      // Create header
      const header = document.createElement('div');
      header.className = 'afs-applied-filters__header';
      const headerLabel = document.createElement('span');
      headerLabel.className = 'afs-applied-filters__label';
      headerLabel.textContent = 'Applied Filters:';
      header.appendChild(headerLabel);
      this.appliedFiltersContainer.appendChild(header);
      
      // Create filters list
      const filtersList = document.createElement('div');
      filtersList.className = 'afs-applied-filters__list';
      
      // Render each filter type
      Object.keys(filters).forEach(filterType => {
        const value = filters[filterType];
        
        if (Array.isArray(value) && value.length > 0) {
          value.forEach(filterValue => {
            // Validate and sanitize value
            const sanitizedValue = this.sanitizeFilterValue(filterValue);
            if (sanitizedValue) {
              const filterChip = this.createAppliedFilterChip(filterType, sanitizedValue);
              if (filterChip) {
                filtersList.appendChild(filterChip);
              }
            }
          });
        } else if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
          // Handle options object
          Object.keys(value).forEach(optionName => {
            const optionValues = value[optionName];
            if (Array.isArray(optionValues) && optionValues.length > 0) {
              optionValues.forEach(optionValue => {
                // Validate and sanitize option value
                const sanitizedOptionValue = this.sanitizeFilterValue(optionValue);
                if (sanitizedOptionValue) {
                  const filterChip = this.createAppliedFilterChip('options', sanitizedOptionValue, optionName, sanitizedOptionValue);
                  if (filterChip) {
                    filtersList.appendChild(filterChip);
                  }
                }
              });
            }
          });
        } else if (value && value !== '') {
          // Handle search string
          const sanitizedValue = this.sanitizeFilterValue(value);
          if (sanitizedValue) {
            const filterChip = this.createAppliedFilterChip(filterType, sanitizedValue);
            if (filterChip) {
              filtersList.appendChild(filterChip);
            }
          }
        }
      });
      
      // Clear all button
      const clearAllButton = document.createElement('button');
      clearAllButton.className = 'afs-applied-filters__clear-all';
      clearAllButton.textContent = 'Clear All';
      clearAllButton.setAttribute('type', 'button');
      clearAllButton.setAttribute('data-afs-action', 'clear-all');
      filtersList.appendChild(clearAllButton);
      
      this.appliedFiltersContainer.appendChild(filtersList);
      
      const duration = performance.now() - startTime;
      Logger.performance('renderAppliedFilters', duration);
    },

    /**
     * Sanitize filter value for display
     */
    sanitizeFilterValue(value) {
      if (value === null || value === undefined) return null;
      
      // If it's an object, try to extract a meaningful value
      if (typeof value === 'object') {
        // Try common object properties
        if (value.value !== undefined) return String(value.value);
        if (value.key !== undefined) return String(value.key);
        if (value.name !== undefined) return String(value.name);
        if (value.label !== undefined) return String(value.label);
        // If it's an array, join it
        if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null;
        // Skip objects we can't convert
        Logger.warn('Cannot convert object to filter value', { value });
        return null;
      }
      
      // Convert to string and trim
      const stringValue = String(value).trim();
      
      // Skip empty or invalid values
      if (!stringValue || 
          stringValue === 'undefined' || 
          stringValue === 'null' || 
          stringValue === '[object Object]' ||
          stringValue === '') {
        return null;
      }
      
      return stringValue;
    },

    /**
     * Create applied filter chip
     */
    createAppliedFilterChip(filterType, value, optionName = null, optionValue = null) {
      // Sanitize values
      const sanitizedValue = this.sanitizeFilterValue(value);
      if (!sanitizedValue) {
        Logger.warn('Invalid filter value for chip', { filterType, value, optionName, optionValue });
        return null;
      }
      
      const sanitizedOptionValue = optionValue ? this.sanitizeFilterValue(optionValue) : null;
      const displayValue = sanitizedOptionValue || sanitizedValue;
      
      const chip = document.createElement('div');
      chip.className = 'afs-applied-filter-chip';
      chip.setAttribute('data-afs-filter-type', filterType);
      chip.setAttribute('data-afs-filter-value', sanitizedValue);
      
      // Label
      const label = document.createElement('span');
      label.className = 'afs-applied-filter-chip__label';
      
      // Format label based on filter type
      const filterLabels = {
        vendor: 'Vendor',
        vendors: 'Vendor',
        productType: 'ProductType',
        productTypes: 'ProductType',
        tags: 'Tag',
        tag: 'Tag',
        collections: 'Collection',
        collection: 'Collection',
        search: 'Search',
        options: optionName || 'Option'
      };
      
      const typeLabel = filterLabels[filterType] || filterType;
      label.textContent = optionName 
        ? `${typeLabel}: ${displayValue}`
        : `${typeLabel}: ${displayValue}`;
      
      chip.appendChild(label);
      
      // Remove button
      const removeButton = document.createElement('button');
      removeButton.className = 'afs-applied-filter-chip__remove';
      removeButton.setAttribute('type', 'button');
      removeButton.setAttribute('aria-label', 'Remove filter');
      removeButton.textContent = '×';
      removeButton.setAttribute('data-afs-filter-type', filterType);
      removeButton.setAttribute('data-afs-filter-value', sanitizedValue);
      if (optionName) {
        removeButton.setAttribute('data-afs-option-name', optionName);
        removeButton.setAttribute('data-afs-option-value', sanitizedOptionValue || sanitizedValue);
      }
      // Prevent event bubbling
      removeButton.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      chip.appendChild(removeButton);
      
      return chip;
    },

    /**
     * Render products info (results count, pagination info)
     */
    renderProductsInfo(pagination, total) {
      if (!this.productsInfoContainer) return;
      
      const startTime = performance.now();
      
      // Clear existing
      this.productsInfoContainer.innerHTML = '';
      
      if (!pagination || total === undefined) return;
      
      // Calculate range
      const start = (pagination.page - 1) * pagination.limit + 1;
      const end = Math.min(pagination.page * pagination.limit, total);
      
      // Results count
      const resultsText = document.createElement('div');
      resultsText.className = 'afs-products-info__results';
      
      if (total === 0) {
        resultsText.textContent = 'No products found';
      } else if (total === 1) {
        resultsText.textContent = '1 product found';
      } else {
        resultsText.textContent = `Showing ${start}-${end} of ${total} products`;
      }
      
      this.productsInfoContainer.appendChild(resultsText);
      
      // Page info (if multiple pages)
      if (pagination.totalPages > 1) {
        const pageInfo = document.createElement('div');
        pageInfo.className = 'afs-products-info__page';
        pageInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
        this.productsInfoContainer.appendChild(pageInfo);
      }
      
      const duration = performance.now() - startTime;
      Logger.performance('renderProductsInfo', duration);
    },

    /**
     * Render pagination
     */
    renderPagination(pagination) {
      // Remove existing pagination
      const existing = this.productsContainer.querySelector('.afs-pagination');
      if (existing) existing.remove();
      
      if (!pagination || pagination.totalPages <= 1) return;
      
      const paginationElement = document.createElement('div');
      paginationElement.className = 'afs-pagination';
      
      // Previous button
      const prevButton = document.createElement('button');
      prevButton.className = 'afs-pagination__button afs-pagination__button--prev';
      prevButton.textContent = 'Previous';
      prevButton.disabled = pagination.page === 1;
      prevButton.setAttribute('data-afs-page', pagination.page - 1);
      paginationElement.appendChild(prevButton);
      
      // Page numbers
      const pageInfo = document.createElement('span');
      pageInfo.className = 'afs-pagination__info';
      pageInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
      paginationElement.appendChild(pageInfo);
      
      // Next button
      const nextButton = document.createElement('button');
      nextButton.className = 'afs-pagination__button afs-pagination__button--next';
      nextButton.textContent = 'Next';
      nextButton.disabled = pagination.page >= pagination.totalPages;
      nextButton.setAttribute('data-afs-page', pagination.page + 1);
      paginationElement.appendChild(nextButton);
      
      this.productsContainer.appendChild(paginationElement);
    }
  };

  // ============================================================================
  // FILTER MANAGER
  // ============================================================================
  
  const FilterManager = {
    /**
     * Update preserveFilters set
     */
    updatePreserveFlag(key, shouldPreserve) {
      if (!key) return;
      const normalizedKey = String(key).trim();
      if (!normalizedKey) return;
      const current = new Set(StateManager.getState().preserveFilters || []);
      if (shouldPreserve) {
        current.add(normalizedKey);
      } else {
        current.delete(normalizedKey);
      }
      StateManager.updateState({ preserveFilters: Array.from(current) });
    },

    /**
     * Toggle filter value
     */
    toggleFilter(filterType, value) {
      const state = StateManager.getState();
      const currentValues = state.filters[filterType] || [];
      
      let newValues;
      if (Array.isArray(currentValues)) {
        if (currentValues.includes(value)) {
          newValues = currentValues.filter(v => String(v) !== String(value));
        } else {
          newValues = [...currentValues, value];
        }
      } else {
        newValues = [value];
      }
      
      StateManager.updateFilters({ [filterType]: newValues });
      
      // Reset pagination to page 1 when filters change
      const updatedPagination = { ...state.pagination, page: 1 };
      StateManager.updateState({ pagination: updatedPagination });
      
      // Update URL (page 1 won't be added to URL, only filters)
      this.updatePreserveFlag(filterType, newValues.length > 0);

      URLManager.updateURL(
        { ...state.filters, [filterType]: newValues },
        updatedPagination,
        state.sort,
        { filterConfig: state.filterConfig }
      );
      
      // Update active state in DOM
      const isActive = newValues.includes(value);
      DOMRenderer.updateFilterActiveState(filterType, value, isActive);
      
      // Trigger filter change
      this.applyFilters();
    },

    /**
     * Toggle option filter
     */
    toggleOptionFilter(optionName, optionValue) {
      // Normalize optionValue to string
      const normalizedValue = String(optionValue).trim();
      if (!normalizedValue || normalizedValue === '[object Object]' || normalizedValue === 'undefined' || normalizedValue === 'null') {
        Logger.warn('Invalid option value', { optionName, optionValue, normalizedValue });
        return;
      }
      
      const state = StateManager.getState();
      const currentOptions = { ...(state.filters.options || {}) };
      
      if (!currentOptions[optionName]) {
        currentOptions[optionName] = [];
      }
      
      if (Array.isArray(currentOptions[optionName])) {
        // Normalize existing values to strings for comparison
        const normalizedExisting = currentOptions[optionName].map(v => String(v).trim());
        if (normalizedExisting.includes(normalizedValue)) {
          currentOptions[optionName] = currentOptions[optionName]
            .map(v => String(v).trim())
            .filter(v => v !== normalizedValue);
          if (currentOptions[optionName].length === 0) {
            delete currentOptions[optionName];
          }
        } else {
          currentOptions[optionName] = [...currentOptions[optionName], normalizedValue];
        }
      } else {
        currentOptions[optionName] = [normalizedValue];
      }
      
      StateManager.updateFilters({ options: currentOptions });
      
      // Reset pagination to page 1 when filters change
      const updatedPagination = { ...state.pagination, page: 1 };
      StateManager.updateState({ pagination: updatedPagination });
      
      // Update URL (page 1 won't be added to URL, only filters)
      const optionHandle = StateManager.getOptionHandle(optionName) || optionName;
      const currentValues = currentOptions[optionName]?.map(v => String(v).trim()) || [];
      const isActive = currentValues.includes(normalizedValue);
      this.updatePreserveFlag(optionHandle, currentValues.length > 0);

      URLManager.updateURL(
        { ...state.filters, options: currentOptions },
        updatedPagination,
        state.sort,
        { filterConfig: state.filterConfig }
      );
      
      // Update active state in DOM
      DOMRenderer.updateFilterActiveState('options', normalizedValue, isActive, optionName);
      
      // Trigger filter change
      this.applyFilters();
    },

    /**
     * Apply filters (debounced)
     */
    applyFilters: Utils.debounce(async function() {
      const state = StateManager.getState();
      
      Logger.debug('Applying filters', state.filters);
      
      StateManager.setLoading(true);
      DOMRenderer.showLoading();
      
      try {
        // Fetch products
        const productsData = await APIClient.fetchProducts(
          state.filters,
          state.pagination,
          state.sort
        );
        
        if (!productsData) return; // Request was cancelled
        
        // Update state
        const oldProducts = state.products;
        const products = productsData.products || [];
        const paginationData = productsData.pagination || state.pagination;
        
        StateManager.updateProducts(products, paginationData);
        
        // Use filters and filterConfig from products response if available, otherwise fetch separately
        if (productsData.filters) {
          // Store filters and filterConfig from products response
          StateManager.updateState({ 
            availableFilters: productsData.filters,
            filterConfig: productsData.filterConfig 
          });
          DOMRenderer.renderFilters(productsData.filters, productsData.filterConfig);
          FilterManager.updateFilterActiveStates();
        } else {
          // Fetch filters separately if not included in products response
          const filtersData = await APIClient.fetchFilters(state.filters);
          if (filtersData && filtersData.filters) {
            // Store both filters and filterConfig
            StateManager.updateState({ 
              availableFilters: filtersData.filters,
              filterConfig: filtersData.filterConfig 
            });
            DOMRenderer.renderFilters(filtersData.filters, filtersData.filterConfig);
            FilterManager.updateFilterActiveStates();
          }
        }
        
        // Render products
        DOMRenderer.renderProducts(products, oldProducts);
        DOMRenderer.renderProductsInfo(paginationData, paginationData.total || 0);
        DOMRenderer.renderPagination(paginationData);
        DOMRenderer.renderAppliedFilters(state.filters);
        DOMRenderer.hideLoading();
        
        // Dispatch event
        const event = new CustomEvent('afs:productsLoaded', {
          detail: { products, pagination: paginationData }
        });
        DOMRenderer.container.dispatchEvent(event);
        
      } catch (error) {
        StateManager.setError(error.message);
        DOMRenderer.hideLoading();
        DOMRenderer.showError('Unable to load products. Please try again.');
        
        Logger.error('Failed to apply filters', {
          error: error.message,
          stack: error.stack,
          filters: state.filters
        });
      }
    }, CONSTANTS.DEFAULT_DEBOUNCE_FILTERS),

    /**
     * Update filter active states
     */
    updateFilterActiveStates() {
      const state = StateManager.getState();
      
      Object.keys(state.filters).forEach(filterType => {
        const values = state.filters[filterType];
        if (Array.isArray(values)) {
          values.forEach(value => {
            DOMRenderer.updateFilterActiveState(filterType, value, true);
          });
        } else if (filterType === 'options' && typeof values === 'object' && values !== null) {
          // Handle options filters
          Object.keys(values).forEach(optionName => {
            const optionValues = values[optionName];
            if (Array.isArray(optionValues)) {
              optionValues.forEach(optionValue => {
                // Normalize to string for consistent comparison
                const normalizedValue = String(optionValue).trim();
                if (normalizedValue && normalizedValue !== '[object Object]') {
                  DOMRenderer.updateFilterActiveState('options', normalizedValue, true, optionName);
                }
              });
            }
          });
        }
      });
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  const EventHandlers = {
    /**
     * Handle filter group toggle (collapse/expand)
     */
    handleFilterGroupToggle(e) {
      const toggleButton = e.target.closest('.afs-filter-group__toggle');
      if (!toggleButton) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const group = toggleButton.closest('.afs-filter-group');
      if (!group) return;
      
      const isCollapsed = group.getAttribute('data-afs-collapsed') === 'true';
      group.setAttribute('data-afs-collapsed', isCollapsed ? 'false' : 'true');
      toggleButton.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
      
      Logger.debug('Filter group toggled', {
        filterType: group.getAttribute('data-afs-filter-type'),
        collapsed: !isCollapsed
      });
    },

    /**
     * Handle filter group search
     */
    handleFilterGroupSearch(e) {
      const searchInput = e.target;
      if (!searchInput.classList.contains('afs-filter-group__search-input')) return;
      
      const group = searchInput.closest('.afs-filter-group');
      if (!group) return;
      
      const itemsContainer = group.querySelector('.afs-filter-group__items');
      if (!itemsContainer) return;
      
      const searchTerm = searchInput.value.toLowerCase().trim();
      const allItemsData = itemsContainer.getAttribute('data-afs-all-items');
      
      if (!allItemsData) return;
      
      try {
        const allItems = JSON.parse(allItemsData);
        
        // Show/hide items based on search
        const items = itemsContainer.querySelectorAll('.afs-filter-item');
        items.forEach((itemElement, index) => {
          const itemData = allItems[index];
          if (!itemData) return;
          
          const itemLabel = String(itemData.label || itemData.value || '').toLowerCase();
          const itemValue = String(itemData.value || '').toLowerCase();
          
          const matches = !searchTerm || 
            itemLabel.includes(searchTerm) || 
            itemValue.includes(searchTerm);
          
          itemElement.style.display = matches ? '' : 'none';
        });
        
        Logger.debug('Filter search', {
          filterType: group.getAttribute('data-afs-filter-type'),
          searchTerm,
          visibleItems: Array.from(items).filter(el => el.style.display !== 'none').length
        });
      } catch (error) {
        Logger.error('Failed to parse filter items for search', error);
      }
    },

    /**
     * Handle filter item click (checkbox)
     */
    handleFilterClick(e) {
      // Check if click is on checkbox or label
      let checkbox = null;
      let item = null;
      
      if (e.target.type === 'checkbox' && e.target.classList.contains('afs-filter-item__checkbox')) {
        checkbox = e.target;
        item = checkbox.closest('.afs-filter-item');
      } else if (e.target.closest('.afs-filter-item')) {
        item = e.target.closest('.afs-filter-item');
        checkbox = item.querySelector('.afs-filter-item__checkbox');
      }
      
      if (!checkbox || !item) return;
      
      const filterType = item.getAttribute('data-afs-filter-type');
      const filterValue = item.getAttribute('data-afs-filter-value');
      const optionName = item.getAttribute('data-afs-option-name');
      
      if (filterType && filterValue) {
        if (filterType === 'options' && optionName) {
          // Handle options filter
          FilterManager.toggleOptionFilter(optionName, filterValue);
        } else {
          // Handle regular filter
          FilterManager.toggleFilter(filterType, filterValue);
        }
      }
    },

    /**
     * Handle applied filter remove click
     */
    handleAppliedFilterRemove(e) {
      // Check if click is on the button or the × character inside it
      let button = e.target.closest('.afs-applied-filter-chip__remove');
      if (!button) {
        // If clicked on the chip itself, find the remove button
        const chip = e.target.closest('.afs-applied-filter-chip');
        if (chip) {
          button = chip.querySelector('.afs-applied-filter-chip__remove');
        }
      }
      
      if (!button) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const filterType = button.getAttribute('data-afs-filter-type');
      const filterValue = button.getAttribute('data-afs-filter-value');
      const optionName = button.getAttribute('data-afs-option-name');
      const optionValue = button.getAttribute('data-afs-option-value');
      
      Logger.debug('Removing filter', { filterType, filterValue, optionName, optionValue });
      
      if (filterType === 'options' && optionName && optionValue) {
        // Handle options filter removal
        const normalizedOptionValue = String(optionValue).trim();
        const state = StateManager.getState();
        const currentOptions = { ...(state.filters.options || {}) };
        
        if (currentOptions[optionName] && Array.isArray(currentOptions[optionName])) {
          // Normalize all values for comparison
          currentOptions[optionName] = currentOptions[optionName]
            .map(v => String(v).trim())
            .filter(v => v !== normalizedOptionValue);
          if (currentOptions[optionName].length === 0) {
            delete currentOptions[optionName];
          }
        }
        
        StateManager.updateFilters({ options: currentOptions });
        const optionHandle = StateManager.getOptionHandle(optionName) || optionName;
        FilterManager.updatePreserveFlag(optionHandle, currentOptions[optionName]?.length > 0);
        
        // Reset pagination to page 1 when filters change
        const updatedPagination = { ...state.pagination, page: 1 };
        StateManager.updateState({ pagination: updatedPagination });
        
        URLManager.updateURL(
          { ...state.filters, options: currentOptions },
          updatedPagination,
          state.sort,
          { filterConfig: state.filterConfig }
        );
        FilterManager.applyFilters();
      } else if (filterType && filterValue) {
        // Handle regular filter removal
        FilterManager.toggleFilter(filterType, filterValue);
      }
    },

    /**
     * Handle clear all filters
     */
    handleClearAllFilters() {
      const state = StateManager.getState();
      
      // Reset filters
      StateManager.updateFilters({
        vendor: [],
        productType: [],
        tags: [],
        collections: [],
        options: {},
        search: ''
      });
      
      // Reset pagination to page 1
      StateManager.updateState({
        pagination: { ...state.pagination, page: 1 }
      });

      StateManager.updateState({ preserveFilters: [] });
      
      // Update URL (empty filters and page 1 won't be added to URL)
      URLManager.updateURL(
        { vendor: [], productType: [], tags: [], collections: [], options: {}, search: '' },
        { ...state.pagination, page: 1 },
        state.sort,
        { filterConfig: state.filterConfig }
      );
      
      // Apply filters
      FilterManager.applyFilters();
    },

    /**
     * Handle pagination click
     */
    handlePaginationClick(e) {
      const button = e.target.closest('.afs-pagination__button');
      if (!button || button.disabled) return;
      
      const page = parseInt(button.getAttribute('data-afs-page'), 10);
      if (!page) return;
      
      const state = StateManager.getState();
      StateManager.updateState({
        pagination: { ...state.pagination, page }
      });
      
      URLManager.updateURL(
        state.filters, 
        { ...state.pagination, page }, 
        state.sort,
        { filterConfig: state.filterConfig }
      );
      FilterManager.applyFilters();
    },

    /**
     * Handle popstate (back/forward)
     */
    handlePopState(e) {
      Logger.debug('Popstate event', e.state);
      
      // Get filterConfig from state for handle-to-option-name conversion
      const state = StateManager.getState();
      const urlParams = URLManager.parseURL(state.filterConfig);
      
      // Don't restore shop from URL - it's in config
      // Restore filters from URL (only user-applied filters)
      if (urlParams.vendor || urlParams.productType || urlParams.tags || urlParams.collections || urlParams.search || urlParams.options) {
        StateManager.updateFilters({
          vendor: urlParams.vendor || [],
          productType: urlParams.productType || [],
          tags: urlParams.tags || [],
          collections: urlParams.collections || [],
          search: urlParams.search || '',
          options: urlParams.options || {}
        });
      }
      
      if (urlParams.page) {
        StateManager.updateState({
          pagination: { ...StateManager.state.pagination, page: urlParams.page }
        });
      }
      
      // Apply filters
      FilterManager.applyFilters();
    },

    /**
     * Attach all event listeners
     */
    attach() {
      if (!DOMRenderer.container) return;
      
      // Filter clicks (event delegation)
      DOMRenderer.container.addEventListener('click', (e) => {
        // Check for applied filter remove first (more specific)
        if (e.target.closest('.afs-applied-filter-chip__remove') || 
            (e.target.closest('.afs-applied-filter-chip') && e.target.textContent === '×')) {
          this.handleAppliedFilterRemove(e);
        } else if (e.target.closest('[data-afs-action="clear-all"]')) {
          e.preventDefault();
          this.handleClearAllFilters();
        } else if (e.target.closest('.afs-filter-group__toggle')) {
          this.handleFilterGroupToggle(e);
        } else if (e.target.closest('.afs-filter-item') || (e.target.type === 'checkbox' && e.target.classList.contains('afs-filter-item__checkbox'))) {
          this.handleFilterClick(e);
        } else if (e.target.closest('.afs-pagination__button')) {
          this.handlePaginationClick(e);
        }
      });
      
      // Handle search input
      DOMRenderer.container.addEventListener('input', (e) => {
        if (e.target.classList.contains('afs-filter-group__search-input')) {
          this.handleFilterGroupSearch(e);
        }
      });
      
      // Also handle change event for checkboxes (for accessibility and keyboard navigation)
      DOMRenderer.container.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.classList.contains('afs-filter-item__checkbox')) {
          this.handleFilterClick(e);
        }
      });
      
      // Popstate (back/forward)
      window.addEventListener('popstate', (e) => {
        this.handlePopState(e);
      });
      
      Logger.info('Event listeners attached');
    }
  };

  // ============================================================================
  // MAIN API
  // ============================================================================
  
  const AFS = {
    /**
     * Initialize
     */
    init(config = {}) {
      try {
        Logger.info('Initializing Advanced Filter Search', config);
        
        // Set API base URL
        if (config.apiBaseUrl) {
          APIClient.setBaseURL(config.apiBaseUrl);
        }

        // Initialize state - shop comes from config only, not URL
        if (config.shop) {
          StateManager.updateState({ shop: config.shop });
        } else {
          throw new Error('Shop parameter is required in config');
        }
        
        // Initialize DOM
        const containerSelector = config.container || '[data-afs-container]';
        const filtersSelector = config.filtersContainer || '.afs-filters-container';
        const productsSelector = config.productsContainer || '.afs-products-container';
        
        DOMRenderer.init(containerSelector, filtersSelector, productsSelector);
        
        // Attach event listeners
        EventHandlers.attach();
        
        // Load initial data (this will load filterConfig first, then parse URL with it)
        this.loadInitialData();
        
        Logger.info('Initialization complete');
        
      } catch (error) {
        Logger.error('Initialization failed', error);
        throw error;
      }
    },

    /**
     * Load initial data
     */
    async loadInitialData() {
      const state = StateManager.getState();
      
      try {
        StateManager.setLoading(true);
        DOMRenderer.showLoading();
        
        // Load filters first to get filterConfig
        const filtersData = await APIClient.fetchFilters(state.filters);
        if (filtersData && filtersData.filters) {
          // Store both filters and filterConfig
          StateManager.updateState({ 
            availableFilters: filtersData.filters,
            filterConfig: filtersData.filterConfig 
          });
        }
        
        // Parse URL now that we have filterConfig (converts handles to option names)
        const updatedState = StateManager.getState();
        const urlParams = URLManager.parseURL(updatedState.filterConfig);
        
        // Initialize filters from URL (only user-applied filters)
        // This will override any default filters with URL params
        if (urlParams.vendor || urlParams.productType || urlParams.tags || urlParams.collections || urlParams.search || urlParams.options) {
          StateManager.updateFilters({
            vendor: urlParams.vendor || [],
            productType: urlParams.productType || [],
            tags: urlParams.tags || [],
            collections: urlParams.collections || [],
            search: urlParams.search || '',
            options: urlParams.options || {}
          });
        }
        
        // Initialize pagination from URL
        if (urlParams.page || urlParams.limit) {
          StateManager.updateState({
            pagination: {
              page: urlParams.page || 1,
              limit: urlParams.limit || CONSTANTS.DEFAULT_PAGE_SIZE
            }
          });
        }
        
        // Get updated state after URL parsing
        const finalState = StateManager.getState();
        
        // Render filters with filterConfig
        if (filtersData && filtersData.filters) {
          DOMRenderer.renderFilters(filtersData.filters, filtersData.filterConfig);
          FilterManager.updateFilterActiveStates();
        }
        
        // Load products with filters from URL
        const productsData = await APIClient.fetchProducts(
          finalState.filters,
          finalState.pagination,
          finalState.sort
        );
        
        if (productsData) {
          const products = productsData.products || [];
          const paginationData = productsData.pagination || state.pagination;
          
          StateManager.updateProducts(products, paginationData);
          
          // Update filters from products response if available (more up-to-date)
          if (productsData.filters) {
            StateManager.updateState({ 
              availableFilters: productsData.filters,
              filterConfig: productsData.filterConfig 
            });
            DOMRenderer.renderFilters(productsData.filters, productsData.filterConfig);
            FilterManager.updateFilterActiveStates();
          }
          
          DOMRenderer.renderProducts(products);
          DOMRenderer.renderProductsInfo(paginationData, paginationData.total || 0);
          DOMRenderer.renderPagination(paginationData);
          DOMRenderer.renderAppliedFilters(finalState.filters);
        }
        
        DOMRenderer.hideLoading();
        
      } catch (error) {
        StateManager.setError(error.message);
        DOMRenderer.hideLoading();
        DOMRenderer.showError('Unable to load data. Please try again.');
        Logger.error('Failed to load initial data', {
          error: error.message,
          stack: error.stack,
          filters: state.filters
        });
      }
    },

    /**
     * Destroy instance
     */
    destroy() {
      // Clear state
      StateManager.state = {
        shop: null,
        filters: {
          vendor: [],
          productType: [],
          tags: [],
          collections: [],
          options: {},
          search: ''
        },
        products: [],
        pagination: { page: 1, limit: CONSTANTS.DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
        sort: { field: 'createdAt', order: 'desc' },
        loading: false,
        error: null,
        availableFilters: [],
        filterConfig: null,
        optionHandleMap: {},
        preserveFilters: []
      };
      
      // Clear cache
      APIClient.cache.clear();
      APIClient.cacheTimestamps.clear();
      
      // Clear DOM
      if (DOMRenderer.filtersContainer) {
        DOMRenderer.filtersContainer.innerHTML = '';
      }
      if (DOMRenderer.productsContainer) {
        DOMRenderer.productsContainer.innerHTML = '';
      }
      
      Logger.info('Instance destroyed');
    },

    // Expose logger for configuration
    Logger: Logger
  };

  // ============================================================================
  // EXPOSE TO GLOBAL
  // ============================================================================
  
  if (typeof window !== 'undefined') {
    window.AFS = AFS;
  } else if (typeof global !== 'undefined') {
    global.AFS = AFS;
  }

})(typeof window !== 'undefined' ? window : this);

