/**
 * Advanced Filter Search - Main Instance
 * Main AFS object that coordinates all modules
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  const Logger = global.AFS?.Logger || {};
  const Utils = global.AFS?.Utils || {};
  const StateManager = global.AFS?.StateManager || {};
  const URLManager = global.AFS?.URLManager || {};
  const APIClient = global.AFS?.APIClient || {};
  const DOMRenderer = global.AFS?.DOMRenderer || {};
  const FilterManager = global.AFS?.FilterManager || {};
  const EventHandlers = global.AFS?.EventHandlers || {};
  
  const AFS = {
    initialized: false,
    config: null,
    
    init(config) {
      if (this.initialized) {
        Logger.warn('AFS already initialized');
        return;
      }
      this.config = config || {};
      Logger.info('Initializing Advanced Filter Search', { config: this.config });
      try {
        if (this.config.apiBaseUrl) {
          APIClient.setBaseURL(this.config.apiBaseUrl);
        }
        if (this.config.shop) {
          StateManager.updateState({ shop: this.config.shop });
        }
        DOMRenderer.init(
          this.config.container,
          this.config.filtersContainer,
          this.config.productsContainer
        );
        EventHandlers.init();
        const urlParams = URLManager.parseURL ? URLManager.parseURL() : {};
        if (urlParams.filters) {
          StateManager.updateFilters(urlParams.filters);
        }
        if (urlParams.pagination) {
          StateManager.updateState({ pagination: urlParams.pagination });
        }
        if (urlParams.sort) {
          StateManager.updateState({ sort: urlParams.sort });
        }
        this.initialized = true;
        this.refresh();
      } catch (error) {
        Logger.error('Failed to initialize AFS', {
          error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
        });
        throw error;
      }
    },
    
    async refresh() {
      if (!this.initialized) {
        Logger.warn('AFS not initialized, cannot refresh');
        return;
      }
      const state = StateManager.getState ? StateManager.getState() : {};
      const filters = FilterManager.applyFilters ? FilterManager.applyFilters() : (state.filters || {});
      const pagination = state.pagination || { page: 1, limit: this.config.pageSize || CONSTANTS.DEFAULT_PAGE_SIZE };
      const sort = state.sort || null;
      StateManager.setLoading(true);
      StateManager.setError(null);
      try {
        const [aggregations, productsData] = await Promise.all([
          APIClient.fetchFilters(filters).catch(error => {
            Logger.error('Failed to fetch filters', {
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
            });
            return null;
          }),
          APIClient.fetchProducts(filters, pagination, sort).catch(error => {
            Logger.error('Failed to fetch products', {
              error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
            });
            throw error;
          })
        ]);
        const filterConfig = state.filterConfig || null;
        if (aggregations) {
          DOMRenderer.renderFilters(aggregations, filterConfig);
        }
        if (productsData && productsData.data) {
          StateManager.updateProducts(productsData.data);
          StateManager.updateState({ pagination: productsData.pagination || pagination });
          DOMRenderer.renderProducts(productsData.data, productsData.pagination || pagination);
        } else {
          DOMRenderer.renderProducts([], pagination);
        }
        StateManager.setLoading(false);
      } catch (error) {
        StateManager.setLoading(false);
        const errorMessage = Utils.sanitizeErrorMessage 
          ? Utils.sanitizeErrorMessage(error) 
          : (error.message || 'An error occurred');
        StateManager.setError(errorMessage);
        DOMRenderer.renderError(errorMessage);
        Logger.error('Refresh failed', {
          error: errorMessage,
          filters,
          pagination
        });
      }
    },
    
    destroy() {
      this.initialized = false;
      this.config = null;
      DOMRenderer.clearCache();
      Logger.info('AFS destroyed');
    }
  };
  
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.init = AFS.init.bind(AFS);
    window.AFS.refresh = AFS.refresh.bind(AFS);
    window.AFS.destroy = AFS.destroy.bind(AFS);
    window.AFS.initialized = () => AFS.initialized;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.init = AFS.init.bind(AFS);
    global.AFS.refresh = AFS.refresh.bind(AFS);
    global.AFS.destroy = AFS.destroy.bind(AFS);
    global.AFS.initialized = () => AFS.initialized;
  }
  
})(typeof window !== 'undefined' ? window : this);

