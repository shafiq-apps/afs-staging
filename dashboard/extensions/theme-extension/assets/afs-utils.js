/**
 * Advanced Filter Search - Utilities
 * Main utilities for query string parsing, error handling, etc.
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  const Logger = global.AFS?.Logger || {};
  const FilterConfigIndex = global.AFS?.FilterConfigIndex || {};
  const MemoCache = global.AFS?.MemoCache || {};
  const StateManager = global.AFS?.StateManager || {};
  
  const Utils = {
    getOptionHandle(optionName, filterConfig) {
      if (!optionName) return optionName;
      if (filterConfig) FilterConfigIndex.buildIndex(filterConfig);
      const option = FilterConfigIndex.getOptionByName(optionName);
      if (option) return option.handle || option.optionId || optionName;
      return optionName;
    },
    
    getOptionNameFromHandle(handle, filterConfig) {
      if (!handle) return handle;
      if (filterConfig) FilterConfigIndex.buildIndex(filterConfig);
      const option = FilterConfigIndex.getOptionByHandle(handle);
      if (option) return option.variantOptionKey || option.optionType || handle;
      return handle;
    },
    
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
    
    sanitizeHTML(input) {
      if (typeof input !== 'string') return '';
      const div = document.createElement('div');
      div.textContent = input;
      return div.innerHTML;
    },
    
    escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    
    parseCommaSeparated(value) {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      return value.split(',').map(s => s.trim()).filter(Boolean);
    },
    
    buildQueryString(params, useHandles = false) {
      const searchParams = new URLSearchParams();
      const state = StateManager.getState ? StateManager.getState() : {};
      const filterConfig = state.filterConfig;
      
      Object.keys(params).forEach(key => {
        const value = params[key];
        if (value === null || value === undefined || value === '') return;
        
        if (key === 'options' && typeof value === 'object' && !Array.isArray(value)) {
          Object.keys(value).forEach(optKey => {
            const optValues = value[optKey];
            if (optValues === null || optValues === undefined || optValues === '') return;
            
            if (useHandles) {
              const optionHandle = Utils.getOptionHandle(optKey, filterConfig);
              if (Array.isArray(optValues) && optValues.length > 0) {
                optValues.forEach(v => {
                  const stringValue = String(v).trim();
                  if (stringValue && stringValue !== '[object Object]') {
                    searchParams.append(optionHandle, stringValue);
                  }
                });
              } else if (typeof optValues === 'string' && optValues.trim() !== '') {
                searchParams.set(optionHandle, optValues.trim());
              }
            } else {
              if (Array.isArray(optValues) && optValues.length > 0) {
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
          value.forEach(v => {
            const stringValue = String(v).trim();
            if (stringValue && stringValue !== '[object Object]') {
              searchParams.append(key, stringValue);
            }
          });
        } else if (typeof value === 'object' && value !== null) {
          Logger.warn('Skipping object value in buildQueryString', { key, value });
        } else {
          const stringValue = String(value).trim();
          if (stringValue && stringValue !== '[object Object]') {
            searchParams.set(key, stringValue);
          }
        }
      });
      return searchParams.toString();
    },
    
    parseQueryString(queryString) {
      const params = {};
      const searchParams = new URLSearchParams(queryString);
      const state = StateManager.getState ? StateManager.getState() : {};
      const filterConfig = state.filterConfig;
      
      const reservedParams = new Set([
        'shop', 'shop_domain', 'vendor', 'vendors', 'productType', 'productTypes',
        'tag', 'tags', 'collection', 'collections', 'search', 'page', 'limit', 'sort',
        'priceMin', 'priceMax', 'variantPriceMin', 'variantPriceMax'
      ]);
      
      searchParams.forEach((value, key) => {
        if (key === 'shop' || key === 'shop_domain') return;
        
        if (key.startsWith('options[') || key.startsWith('option.')) {
          const optionHandle = key.replace(/^options?\[|\]|^option\./g, '');
          const optionName = Utils.getOptionNameFromHandle(optionHandle, filterConfig);
          if (!params.options) params.options = {};
          const parsedValue = Utils.parseCommaSeparated(value);
          if (params.options[optionName]) {
            params.options[optionName] = [...new Set([...params.options[optionName], ...parsedValue])];
          } else {
            params.options[optionName] = parsedValue;
          }
        } else if (!reservedParams.has(key) && /^[a-z]{2,3}_[a-z0-9]{3,10}$/.test(key)) {
          const optionName = Utils.getOptionNameFromHandle(key, filterConfig);
          if (optionName !== key || !filterConfig) {
            if (!params.options) params.options = {};
            const parsedValue = Utils.parseCommaSeparated(value);
            if (params.options[optionName]) {
              params.options[optionName] = [...new Set([...params.options[optionName], ...parsedValue])];
            } else {
              params.options[optionName] = parsedValue;
            }
          } else {
            if (params[key]) {
              if (Array.isArray(params[key])) {
                params[key].push(value);
              } else {
                params[key] = [params[key], value];
              }
            } else {
              params[key] = value;
            }
          }
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
        } else {
          if (params[key]) {
            if (Array.isArray(params[key])) {
              params[key].push(value);
            } else {
              params[key] = [params[key], value];
            }
          } else {
            params[key] = value;
          }
        }
      });
      return params;
    },
    
    measurePerformance(name, fn) {
      const start = performance.now();
      const result = fn();
      const duration = performance.now() - start;
      Logger.performance(name, duration);
      return result;
    },
    
    memoize(fn, keyGenerator) {
      return function(...args) {
        const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
        const cached = MemoCache.get(key);
        if (cached !== undefined) return cached;
        const result = fn.apply(this, args);
        MemoCache.set(key, result);
        return result;
      };
    },
    
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    getRetryDelay(attempt, baseDelay = CONSTANTS.RETRY_DELAY_BASE) {
      return baseDelay * Math.pow(2, attempt);
    },
    
    validateAPIResponse(data, expectedStructure) {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response: must be an object');
      }
      if (expectedStructure) {
        for (const key of expectedStructure.required || []) {
          if (!(key in data)) {
            throw new Error(`Invalid response: missing required field '${key}'`);
          }
        }
      }
      return true;
    },
    
    sanitizeErrorMessage(error, isProduction = false) {
      if (!error) return 'An unexpected error occurred';
      const message = error.message || String(error);
      if (isProduction) {
        return message.split('\n')[0].replace(/at .*$/g, '').trim();
      }
      return message;
    },
    
    categorizeError(error) {
      if (!error) return 'unknown';
      if (error.name === 'AbortError' || error.message?.includes('timeout')) return 'timeout';
      if (error.message?.includes('network') || error.message?.includes('fetch')) return 'network';
      if (error.message?.includes('JSON') || error.message?.includes('parse')) return 'parse';
      if (error.message?.includes('HTTP')) return 'http';
      return 'unknown';
    }
  };
  
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.Utils = Utils;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.Utils = Utils;
  }
  
})(typeof window !== 'undefined' ? window : this);

