/**
 * Advanced Filter Search - State Manager
 * Manages application state with validation and caching
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  const Logger = global.AFS?.Logger || {};
  
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
      if (updates.filters) {
        const validFilterKeys = ['vendor', 'productType', 'tags', 'collections', 'options', 'search'];
        for (const key of Object.keys(updates.filters)) {
          if (!validFilterKeys.includes(key)) {
            Logger.warn('Invalid filter key in state update', { key, updates });
            return false;
          }
        }
        for (const [key, value] of Object.entries(updates.filters)) {
          if (key === 'options') {
            if (value !== null && typeof value !== 'object') {
              Logger.warn('Invalid options filter value', { key, value });
              return false;
            }
          } else if (key === 'search') {
            if (value !== null && typeof value !== 'string') {
              Logger.warn('Invalid search filter value', { key, value });
              return false;
            }
          } else {
            if (!Array.isArray(value)) {
              Logger.warn('Invalid filter array value', { key, value });
              return false;
            }
          }
        }
      }
      if (updates.pagination) {
        if (typeof updates.pagination.page !== 'number' || updates.pagination.page < 1) {
          Logger.warn('Invalid pagination page', { pagination: updates.pagination });
          return false;
        }
        if (typeof updates.pagination.limit !== 'number' || updates.pagination.limit < 1) {
          Logger.warn('Invalid pagination limit', { pagination: updates.pagination });
          return false;
        }
      }
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
  
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.StateManager = StateManager;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.StateManager = StateManager;
  }
  
})(typeof window !== 'undefined' ? window : this);

