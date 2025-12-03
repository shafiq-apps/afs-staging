/**
 * Advanced Filter Search - Core Module
 * Constants, Logger, Core Utilities (HashUtils, MemoCache, FilterConfigIndex), and General Utils
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
  
  // ============================================================================
  // LOGGER
  // ============================================================================
  const Logger = {
    enabled: false,
    level: 'error',
    prefix: '[AFS]',
    enable() {
      this.enabled = true;
      if (!this.level || this.level === 'error') {
        this.level = 'debug';
      }
      this.info('Logger enabled', { level: this.level });
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
  
  // Check for enable flag from Liquid/theme settings
  if (typeof window !== 'undefined') {
    if (window.AFS_LOGGER_ENABLED === true) {
      Logger.enable();
      if (window.AFS_LOG_LEVEL) {
        Logger.setLevel(window.AFS_LOG_LEVEL);
      }
    } else if (document.body && document.body.getAttribute('data-afs-logger-enabled') === 'true') {
      Logger.enable();
      const logLevel = document.body.getAttribute('data-afs-log-level');
      if (logLevel) Logger.setLevel(logLevel);
    } else if (document.documentElement && document.documentElement.getAttribute('data-afs-logger-enabled') === 'true') {
      Logger.enable();
      const logLevel = document.documentElement.getAttribute('data-afs-log-level');
      if (logLevel) Logger.setLevel(logLevel);
    }
  }
  
  // ============================================================================
  // FILTER CONFIG INDEX
  // ============================================================================
  const FilterConfigIndex = {
    byVariantOptionKey: new Map(),
    byOptionType: new Map(),
    byHandle: new Map(),
    byOptionId: new Map(),
    lastConfigId: null,
    buildIndex(filterConfig) {
      if (!filterConfig || !filterConfig.options) {
        this.clear();
        return;
      }
      if (this.lastConfigId === filterConfig.id) return;
      this.clear();
      this.lastConfigId = filterConfig.id;
      filterConfig.options.forEach(opt => {
        if (opt.variantOptionKey) {
          const key = opt.variantOptionKey.toLowerCase();
          if (!this.byVariantOptionKey.has(key)) {
            this.byVariantOptionKey.set(key, opt);
          }
        }
        if (opt.optionType) {
          const key = opt.optionType.toLowerCase();
          if (!this.byOptionType.has(key)) {
            this.byOptionType.set(key, opt);
          }
        }
        if (opt.handle) this.byHandle.set(opt.handle, opt);
        if (opt.optionId) this.byOptionId.set(opt.optionId, opt);
      });
    },
    clear() {
      this.byVariantOptionKey.clear();
      this.byOptionType.clear();
      this.byHandle.clear();
      this.byOptionId.clear();
      this.lastConfigId = null;
    },
    getOptionByName(optionName) {
      if (!optionName) return null;
      const key = optionName.toLowerCase();
      return this.byVariantOptionKey.get(key) || this.byOptionType.get(key) || null;
    },
    getOptionByHandle(handle) {
      if (!handle) return null;
      return this.byHandle.get(handle) || this.byOptionId.get(handle) || null;
    }
  };
  
  // ============================================================================
  // MEMOIZATION CACHE
  // ============================================================================
  const MemoCache = {
    cache: new Map(),
    maxSize: 50,
    get(key) { return this.cache.get(key); },
    set(key, value) {
      if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    },
    clear() { this.cache.clear(); }
  };
  
  // ============================================================================
  // HASH UTILS
  // ============================================================================
  const HashUtils = {
    hashObject(obj) {
      if (!obj || typeof obj !== 'object') return String(obj);
      const keys = Object.keys(obj).sort();
      const parts = [];
      for (const key of keys) {
        const value = obj[key];
        if (value === null || value === undefined) continue;
        if (Array.isArray(value)) {
          parts.push(`${key}:${value.sort().join(',')}`);
        } else if (typeof value === 'object') {
          parts.push(`${key}:${this.hashObject(value)}`);
        } else {
          parts.push(`${key}:${value}`);
        }
      }
      return parts.join('|');
    },
    generateCacheKey(filters, pagination, sort) {
      const keyObj = {
        f: filters,
        p: pagination?.page || 1,
        l: pagination?.limit || CONSTANTS.DEFAULT_PAGE_SIZE,
        s: sort ? `${sort.field}:${sort.order}` : ''
      };
      return this.hashObject(keyObj);
    }
  };
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
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
      const state = global.AFS?.StateManager?.getState ? global.AFS.StateManager.getState() : {};
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
      const state = global.AFS?.StateManager?.getState ? global.AFS.StateManager.getState() : {};
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
  
  // ============================================================================
  // EXPOSE TO GLOBAL
  // ============================================================================
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.CONSTANTS = CONSTANTS;
    window.AFS.Logger = Logger;
    window.AFS.FilterConfigIndex = FilterConfigIndex;
    window.AFS.MemoCache = MemoCache;
    window.AFS.HashUtils = HashUtils;
    window.AFS.Utils = Utils;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.CONSTANTS = CONSTANTS;
    global.AFS.Logger = Logger;
    global.AFS.FilterConfigIndex = FilterConfigIndex;
    global.AFS.MemoCache = MemoCache;
    global.AFS.HashUtils = HashUtils;
    global.AFS.Utils = Utils;
  }
  
})(typeof window !== 'undefined' ? window : this);

