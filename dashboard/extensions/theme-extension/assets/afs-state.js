/**
 * Advanced Filter Search - State Manager
 * Manages application state with validation and caching
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  const Logger = global.AFS?.Logger || {};
  const Utils = global.AFS?.Utils || {};
  
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
      filterConfig: null,
      debounceFilters: CONSTANTS.DEFAULT_DEBOUNCE_FILTERS,
      debounceSearch: CONSTANTS.DEFAULT_DEBOUNCE_SEARCH
    },
    
    _stateSnapshot: null,
    _stateVersion: 0,
    _version: 0,
    
    getState() {
      if (this._stateSnapshot && this._stateVersion === this._version) {
        return this._stateSnapshot;
      }
      this._stateSnapshot = {
        ...this.state,
        filters: { ...this.state.filters },
        pagination: { ...this.state.pagination },
        sort: { ...this.state.sort }
      };
      this._version = this._stateVersion;
      return this._stateSnapshot;
    },
    
    validateStateUpdate(updates) {
      // Only validate filters if filters are being updated
      if (updates.filters && typeof updates.filters === 'object') {
        const validFilterKeys = ['vendor', 'productType', 'tags', 'collections', 'options', 'search'];
        for (const key of Object.keys(updates.filters)) {
          // Allow dynamic filter keys (from URL parsing, etc.) but log a warning
          if (!validFilterKeys.includes(key) && !key.startsWith('options[') && key !== 'page' && key !== 'limit' && key !== 'sort') {
            Logger.debug('Unknown filter key in state update (may be from URL)', { key });
            // Don't fail validation for unknown keys - they might be valid dynamic filters
          }
          const value = updates.filters[key];
          if (value === null || value === undefined || value === '') {
            continue; // Empty values are fine (will be removed)
          }
          if (key === 'options') {
            if (typeof value !== 'object' || Array.isArray(value)) {
              Logger.warn('Invalid options filter value - must be object', { key, value });
              return false;
            }
          } else if (key === 'search') {
            if (typeof value !== 'string') {
              Logger.warn('Invalid search filter value - must be string', { key, value });
              return false;
            }
          } else if (!Array.isArray(value) && typeof value !== 'string') {
            // Allow strings for single values (will be normalized)
            Logger.debug('Filter value is not array (will be normalized)', { key, value });
          }
        }
      }
      // Validate pagination only if pagination object exists and has values
      if (updates.pagination && typeof updates.pagination === 'object') {
        // Allow partial pagination updates - only validate fields that are present
        if ('page' in updates.pagination) {
          if (typeof updates.pagination.page !== 'number' || updates.pagination.page < 1) {
            Logger.warn('Invalid pagination page', { pagination: updates.pagination });
            return false;
          }
        }
        if ('limit' in updates.pagination) {
          if (typeof updates.pagination.limit !== 'number' || updates.pagination.limit < 1) {
            Logger.warn('Invalid pagination limit', { pagination: updates.pagination });
            return false;
          }
        }
        // total and totalPages are optional and can be numbers or undefined
      }
      // Allow other state fields (shop, filterConfig, loading, error, products, etc.) without strict validation
      return true;
    },
    
    updateState(updates) {
      if (!this.validateStateUpdate(updates)) {
        Logger.error('State update validation failed', { updates });
        return;
      }
      this._stateVersion++;
      this.state = {
        ...this.state,
        ...updates,
        filters: updates.filters ? { ...this.state.filters, ...updates.filters } : this.state.filters
      };
      this._stateSnapshot = null;
      Logger.debug('State updated', this.state);
    },
    
    updateFilters(filters) {
      this.updateState({
        filters: { ...this.state.filters, ...filters }
      });
    },
    
    updateProducts(products, pagination) {
      this.updateState({
        products: products || [],
        pagination: pagination || this.state.pagination,
        loading: false
      });
    },
    
    setLoading(loading) {
      this.updateState({ loading });
    },
    
    setError(error) {
      this.updateState({ error, loading: false });
    }
  };
  
  // ============================================================================
  // URL MANAGER
  // ============================================================================
  const URLManager = {
    parseURL() {
      const url = new URL(window.location);
      return Utils.parseQueryString ? Utils.parseQueryString(url.search) : {};
    },
    isEmpty(value) {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string') return value.trim() === '';
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return false;
    },
    hasFilterValues(filters) {
      return Object.keys(filters).some(key => {
        const value = filters[key];
        if (this.isEmpty(value)) return false;
        if (key === 'options' && typeof value === 'object') {
          return Object.keys(value).some(optKey => {
            return !this.isEmpty(value[optKey]);
          });
        }
        return true;
      });
    },
    updateURL(filters, pagination, sort, options = {}) {
      const url = new URL(window.location);
      const state = StateManager.getState ? StateManager.getState() : {};
      const filterConfig = state.filterConfig;
      url.search = '';
      if (filters && this.hasFilterValues(filters)) {
        Object.keys(filters).forEach(key => {
          const value = filters[key];
          if (this.isEmpty(value)) return;
          if (Array.isArray(value) && value.length > 0) {
            url.searchParams.set(key, value.join(','));
          } else if (key === 'options' && typeof value === 'object' && !Array.isArray(value)) {
            Object.keys(value).forEach(optKey => {
              const optValues = value[optKey];
              if (!this.isEmpty(optValues) && Array.isArray(optValues) && optValues.length > 0) {
                if (filterConfig) {
                  const optionHandle = Utils.getOptionHandle ? Utils.getOptionHandle(optKey, filterConfig) : optKey;
                  url.searchParams.set(optionHandle, optValues.join(','));
                } else {
                  url.searchParams.set(`options[${optKey}]`, optValues.join(','));
                }
              }
            });
          } else if (key === 'search' && typeof value === 'string' && value.trim() !== '') {
            url.searchParams.set(key, value.trim());
          }
        });
      }
      if (pagination && pagination.page > 1) {
        url.searchParams.set('page', pagination.page);
      }
      history.pushState({ filters, pagination, sort }, '', url);
      Logger.debug('URL updated', url.toString());
    }
  };
  
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.StateManager = StateManager;
    window.AFS.URLManager = URLManager;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.StateManager = StateManager;
    global.AFS.URLManager = URLManager;
  }
  
})(typeof window !== 'undefined' ? window : this);

