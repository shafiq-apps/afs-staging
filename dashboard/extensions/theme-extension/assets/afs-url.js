/**
 * Advanced Filter Search - URL Manager
 * Handles URL parsing and updates using History API
 */
(function(global) {
  'use strict';
  
  const Utils = global.AFS?.Utils || {};
  const StateManager = global.AFS?.StateManager || {};
  const Logger = global.AFS?.Logger || {};
  
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
    window.AFS.URLManager = URLManager;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.URLManager = URLManager;
  }
  
})(typeof window !== 'undefined' ? window : this);

