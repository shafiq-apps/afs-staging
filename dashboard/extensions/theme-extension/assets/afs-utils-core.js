/**
 * Advanced Filter Search - Core Utilities
 * FilterConfigIndex, MemoCache, HashUtils
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  
  // Filter Config Index
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
  
  // Memoization Cache
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
  
  // Hash Utils
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
  
  // Expose to global namespace
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.FilterConfigIndex = FilterConfigIndex;
    window.AFS.MemoCache = MemoCache;
    window.AFS.HashUtils = HashUtils;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.FilterConfigIndex = FilterConfigIndex;
    global.AFS.MemoCache = MemoCache;
    global.AFS.HashUtils = HashUtils;
  }
  
})(typeof window !== 'undefined' ? window : this);

