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
     * Parse comma-separated string to array
     */
    parseCommaSeparated(value) {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      return value.split(',').map(s => s.trim()).filter(Boolean);
    },

    /**
     * Build query string from object
     */
    buildQueryString(params) {
      const searchParams = new URLSearchParams();
      Object.keys(params).forEach(key => {
        const value = params[key];
        if (value !== null && value !== undefined && value !== '') {
          // Handle options object structure
          if (key === 'options' && typeof value === 'object' && !Array.isArray(value)) {
            Object.keys(value).forEach(optKey => {
              const optValues = value[optKey];
              if (optValues !== null && optValues !== undefined && optValues !== '') {
                if (Array.isArray(optValues) && optValues.length > 0) {
                  // Ensure all values are strings
                  optValues.forEach(v => {
                    const stringValue = String(v).trim();
                    if (stringValue && stringValue !== '[object Object]') {
                      searchParams.append(`options[${optKey}]`, stringValue);
                    }
                  });
                } else if (typeof optValues === 'string' && optValues.trim() !== '') {
                  searchParams.set(`options[${optKey}]`, optValues.trim());
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
      availableFilters: {},
      filterConfig: null
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
      this.state = {
        ...this.state,
        ...updates,
        filters: updates.filters ? { ...this.state.filters, ...updates.filters } : this.state.filters
      };
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
     */
    parseURL() {
      const url = new URL(window.location);
      const params = {};
      
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
        } else if (key.startsWith('options[') || key.startsWith('option.')) {
          const optionName = key.replace(/^options?\[|\]|^option\./g, '');
          if (!params.options) params.options = {};
          params.options[optionName] = Utils.parseCommaSeparated(value);
        }
      });
      
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
     */
    updateURL(filters, pagination, sort, options = {}) {
      const url = new URL(window.location);
      
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
          // Handle options object
          else if (key === 'options' && typeof value === 'object' && !Array.isArray(value)) {
            Object.keys(value).forEach(optKey => {
              const optValues = value[optKey];
              if (!this.isEmpty(optValues) && Array.isArray(optValues) && optValues.length > 0) {
                url.searchParams.set(`options[${optKey}]`, optValues.join(','));
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
      
      // Only add sort if user explicitly sorted (not default)
      // For now, we'll skip sort unless explicitly set by user action
      // This can be enabled later if sort UI is added
      
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
      const params = {
        shop: StateManager.state.shop,
        ...filters,
        page: pagination.page,
        limit: pagination.limit
      };
      
      if (sort && sort.field) {
        params.sort = `${sort.field}:${sort.order || 'desc'}`;
      }
      
      const queryString = Utils.buildQueryString(params);
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
      const params = {
        shop: StateManager.state.shop,
        ...filters
      };
      
      const queryString = Utils.buildQueryString(params);
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
        const filtersData = responseData.data.filters || {};
        const filterCount = typeof filtersData === 'object' && !Array.isArray(filtersData) 
          ? Object.keys(filtersData).length 
          : (Array.isArray(filtersData) ? filtersData.length : 0);
        
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
    renderFilters(filters) {
      if (!this.filtersContainer) return;
      
      const startTime = performance.now();
      
      // Store collapse and search states before clearing
      const savedStates = {};
      const existingGroups = this.filtersContainer.querySelectorAll('.afs-filter-group');
      existingGroups.forEach(group => {
        const filterType = group.getAttribute('data-afs-filter-type');
        const optionName = group.getAttribute('data-afs-option-name');
        const key = optionName ? `${filterType}_${optionName}` : filterType;
        
        savedStates[key] = {
          collapsed: group.getAttribute('data-afs-collapsed') === 'true',
          searchValue: group.querySelector('.afs-filter-group__search-input')?.value || ''
        };
      });
      
      // Clear existing filters
      this.filtersContainer.innerHTML = '';
      
      // Render each filter group
      Object.keys(filters).forEach(filterType => {
        const filterData = filters[filterType];
        
        // Skip if no data
        if (!filterData) return;
        
        // Handle options filter (object with option names as keys)
        if (filterType === 'options' && typeof filterData === 'object' && !Array.isArray(filterData)) {
          // Render each option group separately
          Object.keys(filterData).forEach(optionName => {
            const optionItems = filterData[optionName];
            if (Array.isArray(optionItems) && optionItems.length > 0) {
              const filterGroup = this.createFilterGroup(`options_${optionName}`, optionItems, optionName);
              const key = `options_${optionName}`;
              
              // Restore saved state
              if (savedStates[key]) {
                if (savedStates[key].collapsed) {
                  filterGroup.setAttribute('data-afs-collapsed', 'true');
                  filterGroup.querySelector('.afs-filter-group__toggle')?.setAttribute('aria-expanded', 'false');
                }
                const searchInput = filterGroup.querySelector('.afs-filter-group__search-input');
                if (searchInput && savedStates[key].searchValue) {
                  searchInput.value = savedStates[key].searchValue;
                  // Trigger search to filter items
                  setTimeout(() => {
                    const event = new Event('input', { bubbles: true });
                    searchInput.dispatchEvent(event);
                  }, 0);
                }
              }
              
              this.filtersContainer.appendChild(filterGroup);
            }
          });
          return;
        }
        
        // Handle regular array filters
        if (!Array.isArray(filterData) || filterData.length === 0) {
          return;
        }
        
        const filterGroup = this.createFilterGroup(filterType, filterData);
        
        // Restore saved state
        if (savedStates[filterType]) {
          if (savedStates[filterType].collapsed) {
            filterGroup.setAttribute('data-afs-collapsed', 'true');
            filterGroup.querySelector('.afs-filter-group__toggle')?.setAttribute('aria-expanded', 'false');
          }
          const searchInput = filterGroup.querySelector('.afs-filter-group__search-input');
          if (searchInput && savedStates[filterType].searchValue) {
            searchInput.value = savedStates[filterType].searchValue;
            // Trigger search to filter items
            setTimeout(() => {
              const event = new Event('input', { bubbles: true });
              searchInput.dispatchEvent(event);
            }, 0);
          }
        }
        
        this.filtersContainer.appendChild(filterGroup);
      });
      
      const duration = performance.now() - startTime;
      Logger.performance('renderFilters', duration);
    },

    /**
     * Create filter group
     */
    createFilterGroup(filterType, items, optionName = null) {
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
      
      // Filter label
      const label = document.createElement('label');
      label.className = 'afs-filter-group__label';
      label.textContent = optionName || this.formatFilterLabel(baseFilterType);
      toggleButton.appendChild(label);
      
      header.appendChild(toggleButton);
      group.appendChild(header);
      
      // Collapsible content wrapper
      const content = document.createElement('div');
      content.className = 'afs-filter-group__content';
      
      // Set initial state (expanded by default)
      group.setAttribute('data-afs-collapsed', 'false');
      
      // Search input
      const searchContainer = document.createElement('div');
      searchContainer.className = 'afs-filter-group__search';
      
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'afs-filter-group__search-input';
      searchInput.placeholder = 'Search...';
      searchInput.setAttribute('aria-label', `Search ${optionName || this.formatFilterLabel(baseFilterType)}`);
      searchContainer.appendChild(searchInput);
      
      content.appendChild(searchContainer);
      
      // Filter items container
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'afs-filter-group__items';
      itemsContainer.setAttribute('data-afs-all-items', JSON.stringify(items.map(item => {
        const value = typeof item === 'string' ? item : (item.value || item.key || item.name || '');
        const label = typeof item === 'string' ? item : (item.label || item.value || item.key || item.name || '');
        return { value, label, original: item };
      })));
      
      items.forEach(item => {
        const itemElement = this.createFilterItem(baseFilterType, item, optionName);
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
        productTypes: 'Product Type',
        tags: 'Tags',
        collections: 'Collections',
        options: 'Options'
      };
      return labels[filterType] || filterType;
    },

    /**
     * Create filter item (checkbox style)
     */
    createFilterItem(filterType, item, optionName = null) {
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
      
      // Item label
      const label = document.createElement('span');
      label.className = 'afs-filter-item__label';
      label.textContent = String(itemLabel || itemValue);
      itemElement.appendChild(label);
      
      // Count badge
      if (item && typeof item === 'object' && item.count !== undefined) {
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
      let selector = `.afs-filter-item[data-afs-filter-type="${filterType}"][data-afs-filter-value="${value}"]`;
      if (optionName) {
        selector = `.afs-filter-item[data-afs-filter-type="${filterType}"][data-afs-option-name="${optionName}"][data-afs-filter-value="${value}"]`;
      }
      const item = this.filtersContainer.querySelector(selector);
      if (item) {
        const checkbox = item.querySelector('.afs-filter-item__checkbox');
        if (checkbox) {
          checkbox.checked = active;
        }
        item.classList.toggle('afs-filter-item--active', active);
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
        productType: 'Product Type',
        productTypes: 'Product Type',
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
      URLManager.updateURL(
        { ...state.filters, [filterType]: newValues },
        updatedPagination,
        state.sort
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
      URLManager.updateURL(
        { ...state.filters, options: currentOptions },
        updatedPagination,
        state.sort
      );
      
      // Update active state in DOM
      const isActive = currentOptions[optionName] && 
        currentOptions[optionName].map(v => String(v).trim()).includes(normalizedValue);
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
        
        // Render products
        DOMRenderer.renderProducts(products, oldProducts);
        DOMRenderer.renderProductsInfo(paginationData, paginationData.total || 0);
        DOMRenderer.renderPagination(paginationData);
        DOMRenderer.renderAppliedFilters(state.filters);
        DOMRenderer.hideLoading();
        
        // Fetch updated filters
        const filtersData = await APIClient.fetchFilters(state.filters);
        if (filtersData) {
          // Store both filters and filterConfig
          StateManager.updateState({ 
            availableFilters: filtersData.filters || filtersData,
            filterConfig: filtersData.filterConfig 
          });
          DOMRenderer.renderFilters(filtersData.filters || filtersData);
          FilterManager.updateFilterActiveStates();
        }
        
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
        
        // Reset pagination to page 1 when filters change
        const updatedPagination = { ...state.pagination, page: 1 };
        StateManager.updateState({ pagination: updatedPagination });
        
        URLManager.updateURL(
          { ...state.filters, options: currentOptions },
          updatedPagination,
          state.sort
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
      
      // Update URL (empty filters and page 1 won't be added to URL)
      URLManager.updateURL(
        { vendor: [], productType: [], tags: [], collections: [], options: {}, search: '' },
        { ...state.pagination, page: 1 },
        state.sort
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
      
      URLManager.updateURL(state.filters, { ...state.pagination, page }, state.sort);
      FilterManager.applyFilters();
    },

    /**
     * Handle popstate (back/forward)
     */
    handlePopState(e) {
      Logger.debug('Popstate event', e.state);
      
      const urlParams = URLManager.parseURL();
      
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
        
        // Parse URL to get initial state
        const urlParams = URLManager.parseURL();
        
        // Initialize state - shop comes from config only, not URL
        if (config.shop) {
          StateManager.updateState({ shop: config.shop });
        } else {
          throw new Error('Shop parameter is required in config');
        }
        
        // Initialize filters from URL (only user-applied filters)
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
        
        // Initialize DOM
        const containerSelector = config.container || '[data-afs-container]';
        const filtersSelector = config.filtersContainer || '.afs-filters-container';
        const productsSelector = config.productsContainer || '.afs-products-container';
        
        DOMRenderer.init(containerSelector, filtersSelector, productsSelector);
        
        // Attach event listeners
        EventHandlers.attach();
        
        // Load initial data
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
        
        // Load filters first
        const filtersData = await APIClient.fetchFilters(state.filters);
        if (filtersData) {
          // Store both filters and filterConfig
          StateManager.updateState({ 
            availableFilters: filtersData.filters || filtersData,
            filterConfig: filtersData.filterConfig 
          });
          DOMRenderer.renderFilters(filtersData.filters || filtersData);
          FilterManager.updateFilterActiveStates();
        }
        
        // Load products
        const productsData = await APIClient.fetchProducts(
          state.filters,
          state.pagination,
          state.sort
        );
        
        if (productsData) {
          const products = productsData.products || [];
          const paginationData = productsData.pagination || state.pagination;
          
          StateManager.updateProducts(products, paginationData);
          DOMRenderer.renderProducts(products);
          DOMRenderer.renderProductsInfo(paginationData, paginationData.total || 0);
          DOMRenderer.renderPagination(paginationData);
          DOMRenderer.renderAppliedFilters(state.filters);
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
        filters: {},
        products: [],
        pagination: { page: 1, limit: CONSTANTS.DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
        sort: { field: 'createdAt', order: 'desc' },
        loading: false,
        error: null,
        availableFilters: {},
        filterConfig: null
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

