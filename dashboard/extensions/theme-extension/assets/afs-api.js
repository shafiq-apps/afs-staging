/**
 * Advanced Filter Search - API Client
 * Complete API client with caching, retry logic, and fetch methods
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  const Logger = global.AFS?.Logger || {};
  const Utils = global.AFS?.Utils || {};
  const StateManager = global.AFS?.StateManager || {};
  const FilterConfigIndex = global.AFS?.FilterConfigIndex || {};
  const HashUtils = global.AFS?.HashUtils || {};
  
  // ============================================================================
  // API CLIENT CORE (Caching, Retry, Validation)
  // ============================================================================
  const APIClient = {
    baseURL: 'https://fstaging.digitalcoo.com',
    cache: new Map(),
    cacheTimestamps: new Map(),
    cacheTypes: new Map(),
    pendingRequests: new Map(),
    requestDeduplication: new Map(),
    
    setBaseURL(url) {
      this.baseURL = url;
    },
    
    getCacheKey(filters, pagination, sort) {
      return HashUtils.generateCacheKey ? HashUtils.generateCacheKey(filters, pagination, sort) : JSON.stringify({ filters, pagination, sort });
    },
    
    getCacheTTL(type = 'products') {
      return type === 'filters' ? CONSTANTS.CACHE_TTL_FILTERS : CONSTANTS.CACHE_TTL_PRODUCTS;
    },
    
    evictOldestCache() {
      if (this.cache.size <= CONSTANTS.MAX_CACHE_SIZE) return;
      const entries = Array.from(this.cacheTimestamps.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.cache.size - CONSTANTS.MAX_CACHE_SIZE);
      entries.forEach(([key]) => {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
        this.cacheTypes.delete(key);
      });
      Logger.debug('Cache evicted', { removed: entries.length, remaining: this.cache.size });
    },
    
    getFromCache(key, type = 'products') {
      const timestamp = this.cacheTimestamps.get(key);
      if (!timestamp) return null;
      const ttl = this.getCacheTTL(type);
      if (Date.now() - timestamp > ttl) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
        this.cacheTypes.delete(key);
        return null;
      }
      return this.cache.get(key);
    },
    
    setCache(key, value, type = 'products') {
      this.cache.set(key, value);
      this.cacheTimestamps.set(key, Date.now());
      this.cacheTypes.set(key, type);
      this.evictOldestCache();
    },
    
    async fetchWithRetry(url, options, timeout, maxRetries = CONSTANTS.MAX_RETRIES, requestType = 'products') {
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
              if (response.status >= 400 && response.status < 500) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
          } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
              if (attempt < maxRetries) {
                lastError = new Error('Request timeout');
                const delay = Utils.getRetryDelay ? Utils.getRetryDelay(attempt) : CONSTANTS.RETRY_DELAY_BASE * Math.pow(2, attempt);
                Logger.debug(`Request timeout, retrying in ${delay}ms`, { attempt: attempt + 1, maxRetries });
                await (Utils.sleep ? Utils.sleep(delay) : new Promise(r => setTimeout(r, delay)));
                continue;
              }
              throw new Error('Request timeout after retries');
            }
            throw error;
          }
        } catch (error) {
          lastError = error;
          const errorType = Utils.categorizeError ? Utils.categorizeError(error) : 'unknown';
          if (errorType === 'parse' || (errorType === 'http' && error.message?.includes('4'))) {
            throw error;
          }
          if (attempt < maxRetries) {
            const delay = Utils.getRetryDelay ? Utils.getRetryDelay(attempt) : CONSTANTS.RETRY_DELAY_BASE * Math.pow(2, attempt);
            Logger.debug(`Request failed, retrying in ${delay}ms`, { 
              attempt: attempt + 1, 
              maxRetries, 
              errorType,
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
            });
            await (Utils.sleep ? Utils.sleep(delay) : new Promise(r => setTimeout(r, delay)));
          }
        }
      }
      throw lastError || new Error('Request failed after retries');
    },
    
    validateResponse(data, responseType = 'products') {
      try {
        if (Utils.validateAPIResponse) {
          Utils.validateAPIResponse(data, { required: ['success'] });
        } else {
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid response: must be an object');
          }
        }
        if (!data.success) {
          const errorMessage = data.message || 'API request failed';
          throw new Error(errorMessage);
        }
        if (responseType === 'products') {
          if (!Array.isArray(data.data)) {
            throw new Error('Invalid response: data must be an array');
          }
          if (data.pagination) {
            if (typeof data.pagination.page !== 'number' || 
                typeof data.pagination.limit !== 'number' ||
                typeof data.pagination.total !== 'number') {
              Logger.warn('Invalid pagination structure in response', { pagination: data.pagination });
            }
          }
        } else if (responseType === 'filters') {
          if (!data.aggregations && !data.data) {
            throw new Error('Invalid filters response: missing aggregations or data');
          }
        }
        return true;
      } catch (error) {
        Logger.error('Response validation failed', {
          error: error.message,
          responseType,
          hasData: !!data?.data,
          hasAggregations: !!data?.aggregations,
          success: data?.success
        });
        throw error;
      }
    },
    
    // ============================================================================
    // FETCH METHODS
    // ============================================================================
    async fetchProducts(filters, pagination, sort) {
      const cacheKey = this.getCacheKey(filters, pagination, sort);
      const cached = this.getFromCache(cacheKey, 'products');
      if (cached) {
        Logger.debug('Cache hit', { filters, pagination });
        return cached;
      }
      if (this.requestDeduplication.has(cacheKey)) {
        Logger.debug('Request deduplication: reusing in-flight request', { cacheKey });
        try {
          return await this.requestDeduplication.get(cacheKey);
        } catch (error) {
          this.requestDeduplication.delete(cacheKey);
          throw error;
        }
      }
      if (this.pendingRequests.has(cacheKey)) {
        this.pendingRequests.get(cacheKey).abort();
      }
      const params = {
        shop: StateManager.state?.shop,
        ...filters,
        page: pagination.page,
        limit: pagination.limit
      };
      if (sort && sort.field) {
        params.sort = `${sort.field}:${sort.order || 'desc'}`;
      }
      const queryString = Utils.buildQueryString ? Utils.buildQueryString(params, false) : new URLSearchParams(params).toString();
      const url = `${this.baseURL}/storefront/products?${queryString}`;
      Logger.debug('Fetching products', { url, filters, pagination });
      const controller = new AbortController();
      this.pendingRequests.set(cacheKey, controller);
      const requestPromise = (async () => {
        try {
          const response = await this.fetchWithRetry(
            url,
            { signal: controller.signal },
            CONSTANTS.DEFAULT_TIMEOUT_PRODUCTS,
            CONSTANTS.MAX_RETRIES,
            'products'
          );
          let responseData;
          try {
            responseData = await response.json();
          } catch (parseError) {
            Logger.error('Failed to parse products response as JSON', {
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(parseError) : parseError.message,
              status: response.status,
              statusText: response.statusText
            });
            throw new Error('Invalid response format: not valid JSON');
          }
          Logger.debug('Products response received', { 
            hasBody: !!responseData.body,
            hasData: !!responseData.data,
            responseKeys: Object.keys(responseData || {})
          });
          let data = responseData;
          if (responseData?.body) {
            data = responseData.body;
          }
          this.validateResponse(data, 'products');
          if (data?.filterConfig) {
            if (data.filterConfig.id && Array.isArray(data.filterConfig.options)) {
              if (StateManager.updateState) {
                StateManager.updateState({ filterConfig: data.filterConfig });
              }
              if (FilterConfigIndex.buildIndex) {
                FilterConfigIndex.buildIndex(data.filterConfig);
              }
              Logger.debug('Filter config stored from products response', { 
                filterId: data.filterConfig.id,
                optionsCount: data.filterConfig.options.length
              });
            } else {
              Logger.warn('Invalid filterConfig structure in products response', {
                hasId: !!data.filterConfig.id,
                hasOptions: Array.isArray(data.filterConfig.options)
              });
            }
          }
          this.setCache(cacheKey, data, 'products');
          this.pendingRequests.delete(cacheKey);
          this.requestDeduplication.delete(cacheKey);
          Logger.info('Products fetched successfully', { 
            count: data.data ? data.data.length : 0,
            pagination: data.pagination 
          });
          return data;
        } catch (error) {
          this.pendingRequests.delete(cacheKey);
          this.requestDeduplication.delete(cacheKey);
          const errorType = error.type || (Utils.categorizeError ? Utils.categorizeError(error) : 'unknown');
          const sanitizedError = new Error(Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message);
          sanitizedError.type = errorType;
          sanitizedError.originalError = error;
          if (errorType === 'timeout') {
            Logger.error('Products request timeout', {
              url,
              filters,
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
            });
          } else if (errorType === 'network') {
            Logger.error('Network error fetching products', {
              url,
              filters,
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
            });
          } else {
            Logger.error('Failed to fetch products', {
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message,
              errorType,
              url,
              filters
            });
          }
          throw sanitizedError;
        }
      })();
      this.requestDeduplication.set(cacheKey, requestPromise);
      return requestPromise;
    },
    
    async fetchFilters(filters) {
      const cacheKey = this.getCacheKey(filters, { page: 1, limit: 1 }, null);
      const cached = this.getFromCache(cacheKey, 'filters');
      if (cached) {
        Logger.debug('Cache hit for filters', { filters });
        return cached;
      }
      if (this.requestDeduplication.has(cacheKey)) {
        Logger.debug('Request deduplication: reusing in-flight filters request', { cacheKey });
        try {
          return await this.requestDeduplication.get(cacheKey);
        } catch (error) {
          this.requestDeduplication.delete(cacheKey);
          throw error;
        }
      }
      const params = {
        shop: StateManager.state?.shop,
        ...filters
      };
      const queryString = Utils.buildQueryString ? Utils.buildQueryString(params, false) : new URLSearchParams(params).toString();
      const url = `${this.baseURL}/storefront/filters?${queryString}`;
      Logger.debug('Fetching filters', { url, filters });
      const requestPromise = (async () => {
        try {
          const response = await this.fetchWithRetry(
            url,
            {},
            CONSTANTS.DEFAULT_TIMEOUT_FILTERS,
            CONSTANTS.MAX_RETRIES,
            'filters'
          );
          let responseData;
          try {
            responseData = await response.json();
          } catch (parseError) {
            Logger.error('Failed to parse filters response as JSON', {
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(parseError) : parseError.message,
              status: response.status,
              statusText: response.statusText
            });
            throw new Error('Invalid response format: not valid JSON');
          }
          Logger.debug('Filters response received', { 
            hasBody: !!responseData.body,
            hasAggregations: !!responseData.aggregations,
            hasData: !!responseData.data,
            responseKeys: Object.keys(responseData || {})
          });
          let data = responseData;
          if (responseData?.body) {
            data = responseData.body;
          }
          if (!data) {
            Logger.error('Empty filters response', { responseData });
            throw new Error('Empty filters response');
          }
          this.validateResponse(data, 'filters');
          if (data?.filterConfig) {
            if (data.filterConfig.id && Array.isArray(data.filterConfig.options)) {
              if (StateManager.updateState) {
                StateManager.updateState({ filterConfig: data.filterConfig });
              }
              if (FilterConfigIndex.buildIndex) {
                FilterConfigIndex.buildIndex(data.filterConfig);
              }
              Logger.debug('Filter config stored', { 
                filterId: data.filterConfig.id,
                optionsCount: data.filterConfig.options.length
              });
            } else {
              Logger.warn('Invalid filterConfig structure in filters response', {
                hasId: !!data.filterConfig.id,
                hasOptions: Array.isArray(data.filterConfig.options)
              });
            }
          }
          const aggregations = data.aggregations || data.data;
          if (!aggregations) {
            Logger.error('Invalid filters response: missing aggregations/data', { data });
            throw new Error('Invalid filters response: missing aggregations/data');
          }
          this.setCache(cacheKey, aggregations, 'filters');
          this.requestDeduplication.delete(cacheKey);
          const filterCount = typeof aggregations === 'object' && !Array.isArray(aggregations) 
            ? Object.keys(aggregations).length 
            : (Array.isArray(aggregations) ? aggregations.length : 0);
          Logger.info('Filters fetched successfully', { filterCount });
          return aggregations;
        } catch (error) {
          this.requestDeduplication.delete(cacheKey);
          const errorType = error.type || (Utils.categorizeError ? Utils.categorizeError(error) : 'unknown');
          const sanitizedError = new Error(Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message);
          sanitizedError.type = errorType;
          sanitizedError.originalError = error;
          Logger.error('Failed to fetch filters', {
            error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message,
            errorType,
            url,
            filters
          });
          throw sanitizedError;
        }
      })();
      this.requestDeduplication.set(cacheKey, requestPromise);
      return requestPromise;
    }
  };
  
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.APIClient = APIClient;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.APIClient = APIClient;
  }
  
})(typeof window !== 'undefined' ? window : this);
