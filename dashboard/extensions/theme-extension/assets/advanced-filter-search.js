/**
 * Advanced Filter Search
 * 
 * Describe hardcoded values and their means and functionality
*/

(function (global) {
  'use strict';

  // ============================================================================
  // MINIMAL CONSTANTS
  // ============================================================================

  const C = {
    DEBOUNCE: 200,
    TIMEOUT: 10000,
    CACHE_TTL: 300000,
    PAGE_SIZE: 24
  };

  // Store SVG HTML content for inline use (allows CSS color control)
  const Icons = {
    rightArrow: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="currentColor" height="34px" width="34px" version="1.1" id="Layer_1" viewBox="0 0 512.005 512.005" xml:space="preserve"><g><g><path d="M388.418,240.923L153.751,6.256c-8.341-8.341-21.824-8.341-30.165,0s-8.341,21.824,0,30.165L343.17,256.005 L123.586,475.589c-8.341,8.341-8.341,21.824,0,30.165c4.16,4.16,9.621,6.251,15.083,6.251c5.461,0,10.923-2.091,15.083-6.251 l234.667-234.667C396.759,262.747,396.759,249.264,388.418,240.923z"/></g></g></svg>',
    downArrow: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="currentColor" height="34px" width="34px" version="1.1" id="Layer_1" viewBox="0 0 512.011 512.011" xml:space="preserve"><g><g><path d="M505.755,123.592c-8.341-8.341-21.824-8.341-30.165,0L256.005,343.176L36.421,123.592c-8.341-8.341-21.824-8.341-30.165,0 s-8.341,21.824,0,30.165l234.667,234.667c4.16,4.16,9.621,6.251,15.083,6.251c5.462,0,10.923-2.091,15.083-6.251l234.667-234.667 C514.096,145.416,514.096,131.933,505.755,123.592z"/></g></g></svg>',
    eye: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="currentColor" height="34px" width="34px" version="1.1" id="Layer_1" viewBox="0 0 24 24" enable-background="new 0 0 24 24" xml:space="preserve"><g id="view"><g><path d="M12,21c-5,0-8.8-2.8-11.8-8.5L0,12l0.2-0.5C3.2,5.8,7,3,12,3s8.8,2.8,11.8,8.5L24,12l-0.2,0.5C20.8,18.2,17,21,12,21z M2.3,12c2.5,4.7,5.7,7,9.7,7s7.2-2.3,9.7-7C19.2,7.3,16,5,12,5S4.8,7.3,2.3,12z"/></g><g><path d="M12,17c-2.8,0-5-2.2-5-5s2.2-5,5-5s5,2.2,5,5S14.8,17,12,17z M12,9c-1.7,0-3,1.3-3,3s1.3,3,3,3s3-1.3,3-3S13.7,9,12,9z"/></g></g></svg>',
    minus: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="currentColor" version="1.1" id="Capa_1" width="34px" height="34px" viewBox="0 0 33.668 33.668" xml:space="preserve"><g><path d="M33.668,16.834c0,1.934-1.566,3.5-3.5,3.5H3.5c-1.933,0-3.5-1.566-3.5-3.5c0-1.933,1.567-3.5,3.5-3.5h26.668 C32.102,13.334,33.668,14.9,33.668,16.834z"/></g></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="currentColor" version="1.1" id="Capa_1" width="34px" height="34px" viewBox="0 0 459.325 459.325" xml:space="preserve"><g><path d="M459.319,229.668c0,22.201-17.992,40.193-40.205,40.193H269.85v149.271c0,22.207-17.998,40.199-40.196,40.193 c-11.101,0-21.149-4.492-28.416-11.763c-7.276-7.281-11.774-17.324-11.769-28.419l-0.006-149.288H40.181 c-11.094,0-21.134-4.492-28.416-11.774c-7.264-7.264-11.759-17.312-11.759-28.413C0,207.471,17.992,189.475,40.202,189.475h149.267 V40.202C189.469,17.998,207.471,0,229.671,0c22.192,0.006,40.178,17.986,40.19,40.187v149.288h149.282 C441.339,189.487,459.308,207.471,459.319,229.668z"/></g></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="currentColor" height="16px" width="16px" version="1.1" id="Layer_1" viewBox="0 0 512 512" xml:space="preserve"><g><path d="M256,0C114.6,0,0,114.6,0,256s114.6,256,256,256s256-114.6,256-256S397.4,0,256,0z M364.3,332.7c8.3,8.3,8.3,21.8,0,30.1 c-4.2,4.2-9.7,6.2-15.1,6.2c-5.4,0-10.9-2.1-15.1-6.2L256,286.1l-78.1,78.7c-4.2,4.2-9.7,6.2-15.1,6.2c-5.4,0-10.9-2.1-15.1-6.2 c-8.3-8.3-8.3-21.8,0-30.1L225.9,256l-78.1-78.7c-8.3-8.3-8.3-21.8,0-30.1c8.3-8.3,21.8-8.3,30.1,0L256,225.9l78.1-78.7 c8.3-8.3,21.8-8.3,30.1,0c8.3,8.3,8.3,21.8,0,30.1L286.1,256L364.3,332.7z"/></g></svg>'
  };

  // Excluded query parameter keys (not processed as filters)
  // Note: keep is excluded from filter processing but will be parsed separately
  const EXCLUDED_QUERY_PARAMS = new Set(['shop', 'shop_domain', 'keep', 'cpid']);

  // ============================================================================
  // TINY REUSABLE UTILITIES (Smallest possible functions)
  // ============================================================================

  const $ = {
    // Fastest debounce
    debounce: (fn, ms) => {
      let t;
      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    },

    // Fast array split
    split: (v) => v ? (Array.isArray(v) ? v : v.split(',').map(s => s.trim()).filter(Boolean)) : [],

    // Fast ID getter
    id: (p = {}) => (p.productId || p.id || p.gid).split('/').pop(),

    // Fast string check
    str: (v) => String(v || '').trim(),

    // Fast empty check
    empty: (v) => !v || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && Object.keys(v).length === 0),

    // Fast element creator
    el: (tag, cls, attrs = {}) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      return e;
    },

    // Fast text setter
    txt: (el, text) => { el.textContent = text; return el; },

    // Fast clear (replaces innerHTML)
    clear: (el) => {
      while (el.firstChild) el.removeChild(el.firstChild);
    },

    // Fast fragment append
    frag: (items, fn) => {
      const f = document.createDocumentFragment();
      items.forEach(item => f.appendChild(fn(item)));
      return f;
    },

    // Optimize Shopify image URL with transformations
    optimizeImageUrl: (url, options = {}) => {
      if (!url || typeof url !== "string") return "";

      const {
        width = 500,
        height = width,
        quality = 80,
        format = "webp",
        crop = null // "center", "top", etc.
      } = options;

      // Only modify Shopify CDN URLs
      const shopifyCdnPattern = /(cdn\.shopify\.com|shopifycdn\.com)/i;
      if (!shopifyCdnPattern.test(url)) return url;

      try {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);

        // Remove any existing Shopify image params
        params.delete("width");
        params.delete("height");
        params.delete("crop");
        params.delete("format");
        params.delete("quality");

        // Apply new optimization params
        params.set("width", width);
        params.set("height", height);

        if (crop) params.set("crop", crop);
        if (quality !== 100) params.set("quality", quality);

        // Avoid format for GIF (Shopify does not convert animated GIFs)
        const isGif = urlObj.pathname.toLowerCase().endsWith(".gif");
        if (!isGif && format) params.set("format", format);

        return `${urlObj.origin}${urlObj.pathname}?${params.toString()}`;
      } catch (err) {
        return url;
      }
    }
    ,

    // Build responsive srcset for Shopify images
    buildImageSrcset: (baseUrl, sizes = [200, 300, 500]) => {
      if (!baseUrl) return '';

      return sizes.map(size => {
        const optimized = $.optimizeImageUrl(baseUrl, { width: size, format: 'webp', quality: size <= 200 ? 75 : size <= 300 ? 80 : 85 });
        return `${optimized} ${size}w`;
      }).join(', ');
    },

    // Format money using Shopify money format
    formatMoney: (cents, moneyFormat, currency = '') => {
      if (isNaN(cents)) return '';

      // Convert cents to dollars
      const amount = parseFloat(cents) / 100;

      // If no money format provided, use default format
      if (!moneyFormat || typeof moneyFormat !== 'string') {
        return `${currency || ''}${amount.toFixed(2)}`;
      }

      // Replace {{amount}} placeholder with formatted amount
      // Shopify money format examples:
      // - "${{amount}}" → "$10.00"
      // - "{{amount}} USD" → "10.00 USD"
      // - "{{amount_no_decimals}}" → "10"
      // - "{{amount_with_comma_separator}}" → "10,00"
      // - "{{amount_no_decimals_with_comma_separator}}" → "10"
      // - "{{amount_with_apostrophe_separator}}" → "10'00"

      let formattedAmount = amount.toFixed(2);

      // Handle different amount formats
      if (moneyFormat.includes('{{amount_no_decimals}}')) {
        formattedAmount = Math.round(amount).toString();
        return moneyFormat.replace('{{amount_no_decimals}}', formattedAmount);
      }

      if (moneyFormat.includes('{{amount_with_comma_separator}}')) {
        formattedAmount = amount.toFixed(2).replace('.', ',');
        return moneyFormat.replace('{{amount_with_comma_separator}}', formattedAmount);
      }

      if (moneyFormat.includes('{{amount_no_decimals_with_comma_separator}}')) {
        formattedAmount = Math.round(amount).toString();
        return moneyFormat.replace('{{amount_no_decimals_with_comma_separator}}', formattedAmount);
      }

      if (moneyFormat.includes('{{amount_with_apostrophe_separator}}')) {
        formattedAmount = amount.toFixed(2).replace('.', "'");
        return moneyFormat.replace('{{amount_with_apostrophe_separator}}', formattedAmount);
      }

      // Default: replace {{amount}} with formatted amount
      return moneyFormat.replace('{{amount}}', formattedAmount);
    }
  };

  // ============================================================================
  // METADATA BUILDERS (For display only, not for state management)
  // ============================================================================

  const Metadata = {
    // Build metadata map from filters array (for display labels, types, etc.)
    buildFilterMetadata: (filters) => {
      const m = new Map();
      if (!Array.isArray(filters)) return m;
      filters.forEach(f => {
        if (f.handle) {
          // Store metadata for rendering (label, type, etc.)
          m.set(f.handle, {
            label: f.label || f.queryKey || f.optionKey || f.handle,
            type: f.type,
            queryKey: f.queryKey,
            optionKey: f.optionKey,
            optionType: f.optionType
          });
        }
      });
      return m;
    }
  };

  // ============================================================================
  // STATE (Minimal, no copying)
  // ============================================================================

  const State = {
    shop: null,
    // Filters: standard filters (fixed keys) + dynamic option filters (handles as keys)
    // Example: { vendor: [], ef4gd: ["red"], pr_a3k9x: ["M"], search: '', priceRange: null }
    filters: { vendor: [], productType: [], tags: [], collections: [], search: '', priceRange: null },
    products: [],
    collections: [],
    selectedCollection: { id: null, sortBy: null },
    pagination: { page: 1, limit: C.PAGE_SIZE, total: 0, totalPages: 0 },
    sort: { field: 'best-selling', order: 'asc' },
    loading: false,
    availableFilters: [],
    // Metadata maps (for display only, not for state management)
    filterMetadata: new Map(), // handle -> { label, type, queryKey, optionKey }
    // Keep filter keys for maintaining filter aggregations
    keep: null, // null, array of strings, or '__all__'
    // Fallback products from Liquid (to prevent blank screen when API fails)
    fallbackProducts: [],
    // Fallback pagination from Liquid (for proper pagination controls when API fails)
    fallbackPagination: { currentPage: 1, totalPages: 1, totalProducts: 0 },
    // Flag to track if we're using fallback mode (API failed)
    usingFallback: false,
    // Money formatting from Shopify
    moneyFormat: null,
    moneyWithCurrencyFormat: null,
    currency: null
  };

  // ============================================================================
  // LOGGER (Minimal, production-safe)
  // ============================================================================

  const Log = {
    enabled: true, // Always enabled for debugging
    error: (msg, data) => Log.enabled ? console.error('[AFS]', msg, data || '') : () => { },
    warn: (msg, data) => Log.enabled ? console.warn('[AFS]', msg, data || '') : () => { },
    info: (msg, data) => Log.enabled ? console.info('[AFS]', msg, data || '') : () => { },
    debug: (msg, data) => Log.enabled ? console.debug('[AFS]', msg, data || '') : () => { },
  };

  // ============================================================================
  // URL PARSER (Optimized with lookup maps)
  // ============================================================================

  const UrlManager = {
    parse() {
      const url = new URL(window.location);
      const params = {};

      url.searchParams.forEach((value, key) => {
        if (EXCLUDED_QUERY_PARAMS.has(key)) return;

        // Standard filters
        if (key === 'vendor' || key === 'vendors') params.vendor = $.split(value);
        else if (key === 'productType' || key === 'productTypes') params.productType = $.split(value);
        else if (key === 'tag' || key === 'tags') params.tags = $.split(value);
        else if (key === 'collection' || key === 'collections') params.collections = $.split(value);
        else if (key === 'search') params.search = value;
        else if (key === 'priceRange' || key === 'price') {
          const parts = value.split('-');
          if (parts.length === 2) {
            const min = parseFloat(parts[0]) || 0;
            const max = parseFloat(parts[1]) || 0;
            if (min >= 0 && max > min) {
              params.priceRange = { min, max };
            }
          }
        }
        else if (key === 'page') params.page = parseInt(value, 10) || 1;
        else if (key === 'limit') params.limit = parseInt(value, 10) || C.PAGE_SIZE;
        else if (key === 'sort') {
          // Handle sort parameter - can be "best-selling", "title-ascending", "price:asc", etc.
          const sortValue = value.toLowerCase().trim();
          if (sortValue === 'best-selling' || sortValue === 'bestselling') {
            params.sort = { field: 'best-selling', order: 'asc' };
          } else if (sortValue.includes('-')) {
            // New format: "field-direction" (e.g., "title-ascending")
            const [field, direction] = sortValue.split('-');
            const order = direction === 'ascending' ? 'asc' : direction === 'descending' ? 'desc' : 'desc';
            params.sort = { field, order };
          } else {
            // Legacy format: "field:order" (backward compatibility)
            const [field, order] = value.split(':');
            params.sort = { field, order: order || 'desc' };
          }
        }
        else if (key === 'keep') {
          // Parse keep - can be comma-separated string or '__all__'
          const keepValue = $.str(value);
          if (keepValue === '__all__') {
            params.keep = '__all__';
          } else {
            params.keep = $.split(value);
          }
          Log.debug('Keep filters parsed', { keep: params.keep });
        }
        else {
          // Everything else is a handle (dynamic filter) - use directly, no conversion
          params[key] = $.split(value);
          Log.debug('Handle filter parsed directly', { handle: key, value });
        }
      });

      return params;
    },

    update(filters, pagination, sort) {
      const url = new URL(window.location);
      url.search = '';

      Log.debug('Updating URL', { filters, pagination });

      if (filters && !$.empty(filters)) {
        Object.keys(filters).forEach(key => {
          const value = filters[key];
          if ($.empty(value)) return;

          // Standard filters and handles - all use same format
          if (Array.isArray(value) && value.length > 0) {
            url.searchParams.set(key, value.join(','));
            Log.debug('URL param set', { key, value: value.join(',') });
          }
          else if (key === 'priceRange' && value && typeof value === 'object' && value.min !== undefined && value.max !== undefined) {
            url.searchParams.set('priceRange', `${value.min}-${value.max}`);
            Log.debug('Price range URL param set', { min: value.min, max: value.max });
          }
          else if (key === 'search' && typeof value === 'string' && value.trim()) {
            url.searchParams.set(key, value.trim());
            Log.debug('Search URL param set', { key, value: value.trim() });
          }
        });
      }

      if (pagination && pagination.page > 1) {
        url.searchParams.set('page', pagination.page);
        Log.debug('Page URL param set', { page: pagination.page });
      }

      // Update sort parameter
      if (sort && sort.field) {
        if (sort.field === 'best-selling' || sort.field === 'bestselling') {
          url.searchParams.set('sort', 'best-selling');
        } else {
          // Convert to new format: "field-direction" (e.g., "title-ascending")
          const direction = sort.order === 'asc' ? 'ascending' : 'descending';
          url.searchParams.set('sort', `${sort.field}-${direction}`);
        }
        Log.debug('Sort URL param set', { field: sort.field, order: sort.order });
      }

      // Update keep parameter
      if (State.keep !== null && State.keep !== undefined) {
        if (State.keep === '__all__') {
          url.searchParams.set('keep', '__all__');
        } else if (Array.isArray(State.keep) && State.keep.length > 0) {
          url.searchParams.set('keep', State.keep.join(','));
        }
        Log.debug('Keep filters URL param set', { keep: State.keep });
      }

      const newUrl = url.toString();
      Log.info('URL updated', { newUrl, oldUrl: window.location.href });
      history.pushState({ filters, pagination, sort }, '', url);
    }
  };

  // ============================================================================
  // API CLIENT (Optimized with deduplication)
  // ============================================================================

  const API = {
    baseURL: 'http://localhost:3554', // Default, should be set via config
    cache: new Map(),
    timestamps: new Map(),
    pending: new Map(),

    key(filters, pagination, sort) {
      return `${pagination.page}-${pagination.limit}-${sort.field}-${sort.order}-${JSON.stringify(filters)}`;
    },

    get(key) {
      const ts = this.timestamps.get(key);
      if (!ts || Date.now() - ts > C.CACHE_TTL) {
        this.cache.delete(key);
        this.timestamps.delete(key);
        return null;
      }
      return this.cache.get(key);
    },

    set(key, value) {
      this.cache.set(key, value);
      this.timestamps.set(key, Date.now());
    },

    async fetch(url, timeout = C.TIMEOUT) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        Log.debug('Fetching', { url });
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${res.statusText}${errorText ? ' - ' + errorText : ''}`);
        }
        const data = await res.json();
        Log.debug('Fetch success', { url, hasData: !!data });
        return data;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') throw new Error('Request timeout');
        Log.error('Fetch failed', { url, error: e.message });
        throw e;
      }
    },

    async products(filters, pagination, sort) {
      if (!this.baseURL) throw new Error('API baseURL not set. Call AFS.init({ apiBaseUrl: "..." })');
      if (!State.shop) throw new Error('Shop not set');

      const key = this.key(filters, pagination, sort);
      const cached = this.get(key);
      if (cached) {
        Log.debug('Cache hit', { key });
        return cached;
      }

      // Deduplication: return existing promise if same request
      if (this.pending.has(key)) {
        Log.debug('Request deduplication', { key });
        return this.pending.get(key);
      }

      const params = new URLSearchParams();
      params.set('shop', State.shop);

      // Only send cpid if collection filter handle is not in filters
      // If collection filter handle exists, it means cpid was converted to a collection filter
      const hasCollectionFilter = Object.keys(filters).some(key => {
        const metadata = State.filterMetadata.get(key);
        return (metadata?.type === 'collection' || 
                metadata?.optionType === 'Collection' || 
                key === 'collections') &&
               Array.isArray(filters[key]) && 
               filters[key].length > 0;
      });
      
      // Only send cpid if no collection filter is active
      if (State.selectedCollection.id && !hasCollectionFilter) {
        params.set('cpid', State.selectedCollection.id);
      }
      // Send ALL filters as direct query parameters using handles as keys
      // URL format: ?handle1=value1&handle2=value2
      // API format: ?handle1=value1&handle2=value2 (same as URL)
      Object.keys(filters).forEach(k => {
        const v = filters[k];
        if ($.empty(v)) return;

        // Direct params (search, priceRange)
        if (k === 'priceRange' && v && typeof v === 'object' && v.min !== undefined && v.max !== undefined) {
          params.set('priceRange', `${v.min}-${v.max}`);
        }
        else if (k === 'search' && typeof v === 'string' && v.trim()) {
          params.set(k, v.trim());
        }
        else {
          // ALL other filters (vendors, tags, collections, options) use handles as direct query params
          // k is already the handle (from State.filters which uses handle as key)
          if (Array.isArray(v) && v.length > 0) {
            params.set(k, v.join(','));
            Log.debug('Filter sent as direct handle param', { handle: k, value: v.join(',') });
          } else if (typeof v === 'string') {
            params.set(k, v);
            Log.debug('Filter sent as direct handle param', { handle: k, value: v });
          }
        }
      });
      params.set('page', pagination.page);
      params.set('limit', pagination.limit);
      if (sort.field) {
        // Handle best-selling sort (no order needed, server handles it)
        if (sort.field === 'best-selling' || sort.field === 'bestselling') {
          params.set('sort', 'best-selling');
        } else {
          // Convert to new format: "field-direction" (e.g., "title-ascending")
          const direction = sort.order === 'asc' ? 'ascending' : 'descending';
          params.set('sort', `${sort.field}-${direction}`);
        }
      }

      // Add keep parameter if set
      if (State.keep !== null && State.keep !== undefined) {
        if (State.keep === '__all__') {
          params.set('keep', '__all__');
        } else if (Array.isArray(State.keep) && State.keep.length > 0) {
          params.set('keep', State.keep.join(','));
        }
        Log.debug('Keep filters sent to products API', { keep: State.keep });
      }

      const url = `${this.baseURL}/storefront/products?${params}`;
      Log.info('Fetching products', { url, shop: State.shop, page: pagination.page });

      const promise = this.fetch(url).then(res => {
        if (!res.success || !res.data) {
          Log.error('Invalid products response', { response: res });
          throw new Error('Invalid products response: ' + (res.message || 'Unknown error'));
        }
        const data = res.data;
        Log.info('Products response', {
          productsCount: data.products?.length || 0,
          total: data.pagination?.total || 0,
          hasFilters: !!data.filters
        });
        this.set(key, data);
        this.pending.delete(key);
        return data;
      }).catch(e => {
        this.pending.delete(key);
        Log.error('Products fetch failed', { error: e.message, url });
        throw e;
      });

      this.pending.set(key, promise);
      return promise;
    },

    async filters(filters) {
      if (!this.baseURL) throw new Error('API baseURL not set. Call AFS.init({ apiBaseUrl: "..." })');
      if (!State.shop) throw new Error('Shop not set');

      const params = new URLSearchParams();
      params.set('shop', State.shop);
      
      // Only send cpid if collection filter handle is not in filters
      const hasCollectionFilter = Object.keys(filters).some(key => {
        const metadata = State.filterMetadata.get(key);
        return (metadata?.type === 'collection' || 
                metadata?.optionType === 'Collection' || 
                key === 'collections') &&
               Array.isArray(filters[key]) && 
               filters[key].length > 0;
      });
      
      // Only send cpid if no collection filter is active
      if (State.selectedCollection.id && !hasCollectionFilter) {
        params.set('cpid', State.selectedCollection.id);
      }

      // Build filters for aggregation - exclude the filter in keep
      // When calculating aggregations for a specific filter, that filter should be excluded
      // from the query so we get all possible values based on other active filters
      const filtersForAggregation = { ...filters };
      let keepHandle = null;

      if (State.keep !== null && State.keep !== undefined) {
        if (State.keep === '__all__') {
          // If '__all__', exclude all filters from aggregation query
          Object.keys(filtersForAggregation).forEach(key => {
            delete filtersForAggregation[key];
          });
          params.set('keep', '__all__');
          Log.debug('Keep filters: __all__ - excluded all filters from aggregation query');
        } else {
          // keep can be an array of handles or a single string handle
          // Get the handle to exclude (use first one if array)
          if (Array.isArray(State.keep) && State.keep.length > 0) {
            keepHandle = State.keep[0];
            // Add keep parameter with all handles joined
            params.set('keep', State.keep.join(','));
            Log.debug('Keep parameter set (array)', { keep: State.keep.join(','), keepHandle });
          } else if (typeof State.keep === 'string' && State.keep.trim()) {
            keepHandle = State.keep.trim();
            // Add keep parameter with the single handle
            params.set('keep', keepHandle);
            Log.debug('Keep parameter set (string)', { keep: keepHandle, keepHandle });
          } else {
            Log.warn('Keep has invalid value, not adding to params', { StateKeep: State.keep });
          }

          // Exclude the keep handle from the aggregation query
          if (keepHandle && filtersForAggregation.hasOwnProperty(keepHandle)) {
            delete filtersForAggregation[keepHandle];
            Log.debug('Excluded keep filter from aggregation query', { 
              excludedHandle: keepHandle,
              remainingFilters: Object.keys(filtersForAggregation)
            });
          }
        }
        Log.debug('Keep filters sent to filters API', { keep: State.keep, params: params.toString() });
      } else {
        Log.debug('Keep filters not set, skipping keep parameter', { StateKeep: State.keep });
      }

      // Send only the filters that should be included in aggregation query
      Object.keys(filtersForAggregation).forEach(k => {
        const v = filtersForAggregation[k];
        if (!$.empty(v) && Array.isArray(v)) params.set(k, v.join(','));
      });

      // Debug: Log all params before constructing URL
      const allParams = {};
      params.forEach((value, key) => {
        allParams[key] = value;
      });
      Log.debug('All params for filters endpoint', { 
        params: allParams, 
        hasKeep: params.has('keep'),
        keepValue: params.get('keep'),
        StateKeep: State.keep
      });

      const url = `${this.baseURL}/storefront/filters?${params}`;
      Log.info('Fetching filters', { url, shop: State.shop, hasKeepParam: params.has('keep') });

      const res = await this.fetch(url);
      if (!res.success || !res.data) {
        Log.error('Invalid filters response', { response: res });
        throw new Error('Invalid filters response: ' + (res.message || 'Unknown error'));
      }

      // Validate response structure
      const data = res.data;
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid filters response: data is not an object');
      }
      if (data.filters !== undefined && !Array.isArray(data.filters)) {
        Log.warn('Filters response contains non-array filters', { filters: data.filters });
        data.filters = [];
      }

      Log.info('Filters response:', { filters: data.filters });

      return data;
    },

    setBaseURL(url) { this.baseURL = url; }
  };

  // ============================================================================
  // DOM RENDERER (Optimized, batched operations)
  // ============================================================================

  const DOM = {
    container: null,
    filtersContainer: null,
    productsContainer: null,
    productsInfo: null,
    productsGrid: null,
    loading: null,
    sortContainer: null,
    sortSelect: null,

    init(containerSel, filtersSel, productsSel) {
      this.container = document.querySelector(containerSel) || document.querySelector('[data-afs-container]');
      if (!this.container) throw new Error('Container not found');

      this.container.setAttribute('data-afs-container', 'true');

      const main = this.container.querySelector('.afs-main-content') || $.el('div', 'afs-main-content');
      if (!main.parentNode) this.container.appendChild(main);

      this.filtersContainer = document.querySelector(filtersSel) || $.el('div', 'afs-filters-container');
      if (!this.filtersContainer.parentNode) main.appendChild(this.filtersContainer);

      // Ensure filters are closed by default on mobile
      if (window.innerWidth <= 767) {
        this.filtersContainer.classList.remove('afs-filters-container--open');
      }

      // Insert close button at the beginning of filters container
      if (this.mobileFilterClose && !this.mobileFilterClose.parentNode) {
        this.filtersContainer.insertBefore(this.mobileFilterClose, this.filtersContainer.firstChild);
      }

      this.productsContainer = document.querySelector(productsSel) || $.el('div', 'afs-products-container');
      if (!this.productsContainer.parentNode) main.appendChild(this.productsContainer);

      this.productsInfo = $.el('div', 'afs-products-info');
      this.productsContainer.insertBefore(this.productsInfo, this.productsContainer.firstChild);

      // Mobile filter toggle button
      this.mobileFilterButton = $.el('button', 'afs-mobile-filter-button', {
        type: 'button',
        'data-afs-action': 'toggle-filters',
        'aria-label': 'Toggle filters'
      });
      this.mobileFilterButton.innerHTML = '<span class="afs-mobile-filter-button__icon">☰</span> <span class="afs-mobile-filter-button__text">Filters</span>';
      this.productsInfo.insertBefore(this.mobileFilterButton, this.productsInfo.firstChild);

      // Mobile filter close button (inside filters container)
      this.mobileFilterClose = $.el('button', 'afs-mobile-filter-close', {
        type: 'button',
        'data-afs-action': 'close-filters',
        'aria-label': 'Close filters'
      });
      this.mobileFilterClose.innerHTML = '✕';
      this.mobileFilterClose.style.display = 'none'; // Hidden on desktop

      // Sort dropdown - create and store reference
      this.sortContainer = $.el('div', 'afs-sort-container');
      const sortLabel = $.el('label', 'afs-sort-label', { 'for': 'afs-sort-label' });
      sortLabel.textContent = 'Sort by: ';
      this.sortSelect = $.el('select', 'afs-sort-select', { 'data-afs-sort': 'true' });
      this.sortSelect.innerHTML = `
        <option value="best-selling">Best Selling</option>
        <option value="title-ascending">Title (A-Z)</option>
        <option value="title-descending">Title (Z-A)</option>
        <option value="price-ascending">Price (Low to High)</option>
        <option value="price-descending">Price (High to Low)</option>
        <option value="created-ascending">Oldest First</option>
        <option value="created-descending">Newest First</option>
      `;
      this.sortContainer.appendChild(sortLabel);
      this.sortContainer.appendChild(this.sortSelect);
      this.productsInfo.appendChild(this.sortContainer);

      this.productsGrid = $.el('div', 'afs-products-grid');
      this.productsContainer.appendChild(this.productsGrid);
    },

    // Hide filters container (when using fallback mode)
    hideFilters() {
      if (this.filtersContainer) {
        this.filtersContainer.style.display = 'none';
        Log.debug('Filters container hidden');
      }
    },

    // Show filters container
    showFilters() {
      if (this.filtersContainer) {
        this.filtersContainer.style.display = '';
        // Only add open class on desktop/tablet, not on mobile
        if (window.innerWidth > 767) {
          this.filtersContainer.classList.add('afs-filters-container--open');
        } else {
          // On mobile, ensure it's closed by default
          this.filtersContainer.classList.remove('afs-filters-container--open');
        }
        Log.debug('Filters container shown');
      }
    },

    // Toggle mobile filters
    toggleMobileFilters() {
      if (!this.filtersContainer) return;

      const isOpen = this.filtersContainer.classList.contains('afs-filters-container--open');

      if (isOpen) {
        this.filtersContainer.classList.remove('afs-filters-container--open');
        document.body.classList.remove('afs-filters-open');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('width');
        document.body.style.removeProperty('height');
      } else {
        this.filtersContainer.classList.add('afs-filters-container--open');
        document.body.classList.add('afs-filters-open');
        // Store current scroll position
        const scrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
      }

      Log.debug('Mobile filters toggled', { isOpen: !isOpen });
    },

    // Fastest filter rendering (batched)
    renderFilters(filters) {
      if (!this.filtersContainer || !Array.isArray(filters)) return;

      // Hide filters skeleton when rendering real filters
      this.hideFiltersSkeleton();

      // Save states
      const states = new Map();
      this.filtersContainer.querySelectorAll('.afs-filter-group').forEach(g => {
        const key = g.getAttribute('data-afs-filter-key');
        if (key) states.set(key, {
          collapsed: g.getAttribute('data-afs-collapsed') === 'true',
          search: g.querySelector('.afs-filter-group__search-input')?.value || ''
        });
      });

      // Clear and rebuild in one batch
      $.clear(this.filtersContainer);

      const validFilters = filters.filter(f => {
        if (!f) return false;
        if (f.type === 'priceRange' || f.type === 'variantPriceRange') {
          return f.range && typeof f.range.min === 'number' && typeof f.range.max === 'number' && f.range.max > f.range.min;
        }
        return f.values?.length > 0;
      });
      Log.debug('Rendering filters', {
        total: filters.length,
        valid: validFilters.length,
        filtersWithSearchable: validFilters.filter(f => f.searchable).length,
        filtersWithCollapsed: validFilters.filter(f => f.collapsed).length
      });

      if (validFilters.length === 0) {
        Log.warn('No valid filters to render');
        return;
      }

      const fragment = document.createDocumentFragment();

      validFilters.forEach(filter => {
        // Handle price range filters separately
        if (filter.type === 'priceRange' || filter.type === 'variantPriceRange') {
          const group = this.createPriceRangeGroup(filter, states);
          if (group) fragment.appendChild(group);
          return;
        }

        // For option filters, use filter.handle (option handle like 'ef4gd')
        // For standard filters, use queryKey or key
        // Priority: handle (option handle) > queryKey > key
        let handle;
        if (filter.optionType || filter.optionKey) {
          // This is an option filter - MUST use filter.handle
          handle = filter.handle;
          if (!handle) {
            Log.error('Option filter missing handle', { filter });
            return;
          }
        } else {
          // Standard filter - use queryKey or key
          handle = filter.queryKey || filter.key;
          if (!handle) {
            Log.warn('Standard filter missing queryKey/key', { filter });
            return;
          }
        }

        Log.debug('Filter group handle determined', {
          handle,
          filterHandle: filter.handle,
          queryKey: filter.queryKey,
          key: filter.key,
          label: filter.label,
          type: filter.type,
          optionType: filter.optionType,
          optionKey: filter.optionKey,
          isOptionFilter: !!(filter.optionType || filter.optionKey)
        });

        const group = $.el('div', 'afs-filter-group', { 'data-afs-filter-type': filter.type });
        group.setAttribute('data-afs-filter-handle', handle);

        const stateKey = handle;
        group.setAttribute('data-afs-filter-key', stateKey);

        const saved = states.get(stateKey);
        // Check collapsed state: saved state takes precedence, then filter.collapsed, default to false
        const collapsed = saved?.collapsed !== undefined ? saved.collapsed : (filter.collapsed === true || filter.collapsed === 'true' || filter.collapsed === 1);
        group.setAttribute('data-afs-collapsed', collapsed ? 'true' : 'false');

        Log.debug('Filter group created', {
          handle,
          label: filter.label,
          collapsed,
          searchable: filter.searchable,
          showCount: filter.showCount,
          valuesCount: filter.values?.length || 0
        });

        // Header
        const header = $.el('div', 'afs-filter-group__header');
        const toggle = $.el('button', 'afs-filter-group__toggle', { type: 'button', 'aria-expanded': !collapsed ? 'true' : 'false' });
        const icon = $.el('span', 'afs-filter-group__icon');
        // Use inline SVG HTML for better CSS control
        icon.innerHTML = collapsed ? (Icons.rightArrow || '') : (Icons.downArrow || '');
        toggle.appendChild(icon);
        toggle.appendChild($.txt($.el('label', 'afs-filter-group__label', { 'for': 'afs-filter-group__label' }), filter.label || handle));
        header.appendChild(toggle);
        
        // Add clear button next to the label (only show if filter has active values)
        const hasActiveValues = State.filters[handle] && (
          Array.isArray(State.filters[handle]) ? State.filters[handle].length > 0 :
          typeof State.filters[handle] === 'object' ? Object.keys(State.filters[handle]).length > 0 :
          Boolean(State.filters[handle])
        );
        if (hasActiveValues) {
          const clearBtn = $.el('button', 'afs-filter-group__clear', {
            type: 'button',
            'aria-label': `Clear ${filter.label || handle} filters`,
            'data-afs-filter-handle': handle
          });
          clearBtn.innerHTML = Icons.close || '×';
          clearBtn.title = `Clear ${filter.label || handle} filters`;
          header.appendChild(clearBtn);
        }
        
        group.appendChild(header);

        // Content
        const content = $.el('div', 'afs-filter-group__content');
        // Check searchable: check for true, 'true', 1, or any truthy value that indicates searchable
        const isSearchable = filter.searchable === true ||
          filter.searchable === 'true' ||
          filter.searchable === 1 ||
          filter.searchable === '1' ||
          (typeof filter.searchable === 'string' && filter.searchable.toLowerCase() === 'true');

        if (isSearchable) {
          const searchContainer = $.el('div', 'afs-filter-group__search');
          const search = $.el('input', 'afs-filter-group__search-input', {
            type: 'text',
            placeholder: filter.searchPlaceholder || 'Search...',
            'aria-label': `Search ${filter.label || handle}`
          });
          if (saved?.search) search.value = saved.search;
          searchContainer.appendChild(search);
          content.appendChild(searchContainer);
          Log.debug('Search input added', { handle, label: filter.label, searchable: filter.searchable });
        }

        const items = $.el('div', 'afs-filter-group__items');
        items._items = filter.values; // Store directly, no JSON

        // Create items fragment
        const itemsFragment = document.createDocumentFragment();
        filter.values.forEach(item => {
          const itemEl = this.createFilterItem(handle, item, filter);
          if (itemEl) itemsFragment.appendChild(itemEl);
        });
        items.appendChild(itemsFragment);
        content.appendChild(items);
        group.appendChild(content);

        fragment.appendChild(group);
      });

      if (fragment.children.length > 0) {
        this.filtersContainer.appendChild(fragment);
        // Show filters container when filters are rendered
        this.showFilters();
        Log.debug('Filters rendered', { count: fragment.children.length });
      } else {
        Log.warn('No filter groups created');
        // Hide filters container if no filters to show
        this.hideFilters();
      }
    },

    // Minimal filter item creation
    // Displays label for UI, uses value for filtering
    // handle: the filter handle (e.g., 'ef4gd' for Color, 'vendor' for vendor)
    createFilterItem(handle, item, config) {
      // Get value (for filtering) - always use original value
      const value = $.str(typeof item === 'string' ? item : (item.value || item.key || item.name || ''));
      if (!value || value === '[object Object]') return null;

      // Get label (for display) - use label if available, fallback to value
      let displayLabel = typeof item === 'string'
        ? item
        : (item.label || item.value || value);

      // If this is a Collection filter, map collection ID to collection label from State.collections
      // Check both optionType and type to handle different filter configurations
      const isCollectionFilter = (config?.optionType === 'Collection' || config?.type === 'collection' || handle === 'collections');
      if (isCollectionFilter && State.collections && Array.isArray(State.collections)) {
        // Collection IDs are already numeric strings, just convert to string for comparison
        const collection = State.collections.find(c => {
          const cId = String(c.id || c.gid || c.collectionId || '');
          return cId && String(cId) === String(value);
        });
        if (collection) {
          // Use title from State.collections for display, keep value (collection ID) unchanged for filtering
          displayLabel = collection.title || collection.label || collection.name || displayLabel;
        } else {
          // If collection not found in State.collections, skip this item (return null)
          return null;
        }
      }

      // Check if this filter is currently active (use handle directly)
      const currentValues = State.filters[handle] || [];
      const isChecked = currentValues.includes(value);

      const label = $.el('label', 'afs-filter-item', {
        'data-afs-filter-handle': handle, // Store handle for filtering
        'data-afs-filter-value': value,     // Store original value for filtering
        'for': 'afs-filter-item'
      });
      if (isChecked) label.classList.add('afs-filter-item--active');

      const cb = $.el('input', 'afs-filter-item__checkbox', { type: 'checkbox' });
      cb.checked = isChecked;
      cb.setAttribute('data-afs-filter-handle', handle);
      cb.setAttribute('data-afs-filter-value', value);

      label.appendChild(cb);
      label.appendChild($.txt($.el('span', 'afs-filter-item__label'), displayLabel));
      if (config?.showCount && item.count) {
        label.appendChild($.txt($.el('span', 'afs-filter-item__count'), `(${item.count})`));
      }

      return label;
    },

    // Create price range filter group with dual-handle slider
    createPriceRangeGroup(filter, savedStates = null) {
      if (!filter.range || typeof filter.range.min !== 'number' || typeof filter.range.max !== 'number') {
        Log.warn('Invalid price range filter', { filter });
        return null;
      }

      const minRange = filter.range.min;
      const maxRange = filter.range.max;
      const currentRange = State.filters.priceRange || { min: minRange, max: maxRange };
      const currentMin = Math.max(minRange, Math.min(maxRange, currentRange.min || minRange));
      const currentMax = Math.max(minRange, Math.min(maxRange, currentRange.max || maxRange));

      const group = $.el('div', 'afs-filter-group', {
        'data-afs-filter-type': 'priceRange',
        'data-afs-filter-key': filter.key || 'priceRange'
      });

      const saved = savedStates?.get(filter.key || 'priceRange');
      const collapsed = saved?.collapsed ?? filter.collapsed === true;
      group.setAttribute('data-afs-collapsed', collapsed ? 'true' : 'false');

      // Header
      const header = $.el('div', 'afs-filter-group__header');
      const toggle = $.el('button', 'afs-filter-group__toggle', { type: 'button', 'aria-expanded': !collapsed ? 'true' : 'false' });
      const icon = $.el('span', 'afs-filter-group__icon');
      // Use inline SVG HTML for better CSS control
      icon.innerHTML = collapsed ? (Icons.rightArrow || '') : (Icons.downArrow || '');
      toggle.appendChild(icon);
      toggle.appendChild($.txt($.el('label', 'afs-filter-group__label', { 'for': 'afs-filter-group__label' }), filter.label || 'Price'));
      header.appendChild(toggle);
      
      // Add clear button for price range (only show if price range is active and not at default)
      const isPriceRangeActive = State.filters.priceRange && 
        (State.filters.priceRange.min !== minRange || State.filters.priceRange.max !== maxRange);
      if (isPriceRangeActive) {
        const clearBtn = $.el('button', 'afs-filter-group__clear', {
          type: 'button',
          'aria-label': `Clear ${filter.label || 'Price'} filter`,
          'data-afs-filter-handle': 'priceRange'
        });
        clearBtn.innerHTML = Icons.close || '×';
        clearBtn.title = `Clear ${filter.label || 'Price'} filter`;
        header.appendChild(clearBtn);
      }
      
      group.appendChild(header);

      // Content
      const content = $.el('div', 'afs-filter-group__content');

      // Price range slider container
      const sliderContainer = $.el('div', 'afs-price-range-container');

      // Range slider track
      const track = $.el('div', 'afs-price-range-track');
      const activeTrack = $.el('div', 'afs-price-range-active');
      track.appendChild(activeTrack);

      // Min and Max input handles (overlaid on track)
      const minHandle = $.el('input', 'afs-price-range-handle afs-price-range-handle--min', {
        type: 'range',
        min: minRange,
        max: maxRange,
        value: currentMin,
        step: 1
      });
      minHandle.setAttribute('data-afs-range-type', 'min');

      const maxHandle = $.el('input', 'afs-price-range-handle afs-price-range-handle--max', {
        type: 'range',
        min: minRange,
        max: maxRange,
        value: currentMax,
        step: 1
      });
      maxHandle.setAttribute('data-afs-range-type', 'max');

      track.appendChild(minHandle);
      track.appendChild(maxHandle);
      sliderContainer.appendChild(track);

      // Value display
      const valueDisplay = $.el('div', 'afs-price-range-values');
      const minDisplay = $.el('span', 'afs-price-range-value afs-price-range-value--min');
      const maxDisplay = $.el('span', 'afs-price-range-value afs-price-range-value--max');
      const formatPrice = (val) => `$${parseFloat(val).toFixed(0)}`;
      minDisplay.textContent = formatPrice(currentMin);
      maxDisplay.textContent = formatPrice(currentMax);
      valueDisplay.appendChild(minDisplay);
      valueDisplay.appendChild($.txt($.el('span', 'afs-price-range-separator'), ' - '));
      valueDisplay.appendChild(maxDisplay);
      sliderContainer.appendChild(valueDisplay);

      // Update active track position
      const updateActiveTrack = () => {
        const min = parseFloat(minHandle.value);
        const max = parseFloat(maxHandle.value);
        const range = maxRange - minRange;
        const leftPercent = ((min - minRange) / range) * 100;
        const rightPercent = ((maxRange - max) / range) * 100;
        activeTrack.style.left = `${leftPercent}%`;
        activeTrack.style.right = `${rightPercent}%`;
        minDisplay.textContent = formatPrice(min);
        maxDisplay.textContent = formatPrice(max);
      };

      // Ensure min <= max
      const constrainValues = () => {
        const min = parseFloat(minHandle.value);
        const max = parseFloat(maxHandle.value);
        if (min > max) {
          minHandle.value = max;
          maxHandle.value = min;
        }
        updateActiveTrack();
      };

      // Event handlers
      minHandle.addEventListener('input', () => {
        constrainValues();
        Filters.updatePriceRange(parseFloat(minHandle.value), parseFloat(maxHandle.value));
      });

      maxHandle.addEventListener('input', () => {
        constrainValues();
        Filters.updatePriceRange(parseFloat(minHandle.value), parseFloat(maxHandle.value));
      });

      // Initialize active track
      updateActiveTrack();

      content.appendChild(sliderContainer);
      group.appendChild(content);

      return group;
    },

    // Fastest product rendering (incremental updates)
    renderProducts(products) {
      if (!this.productsGrid) return;

      // Remove skeleton cards if present
      const skeletonCards = this.productsGrid.querySelectorAll('.afs-skeleton-card');
      if (skeletonCards.length > 0) {
        skeletonCards.forEach(card => card.remove());
      }

      const existing = new Map();
      this.productsGrid.querySelectorAll('[data-afs-product-id]').forEach(el => {
        existing.set(el.getAttribute('data-afs-product-id'), el);
      });

      const productIds = new Set(products.map($.id));
      const fragment = document.createDocumentFragment();

      products.forEach(product => {
        const id = $.id(product);
        const el = existing.get(id);
        if (el) {
          // Update existing
          const title = el.querySelector('.afs-product-card__title');
          if (title && title.textContent !== product.title) title.textContent = product.title || 'Untitled';

          const price = el.querySelector('.afs-product-card__price');
          if (price) {
            // price amounts are in dollars, so multiply by 100 to convert to cents
            let minPrice = parseFloat(product.minPrice || 0) * 100;
            let maxPrice = parseFloat(product.maxPrice || 0) * 100;
            const formattedMin = $.formatMoney(minPrice, State.moneyFormat || '{{amount}}', State.currency || '');

            // If prices are equal, show single price, otherwise show "from" prefix
            const priceText = minPrice === maxPrice ? formattedMin : `from ${formattedMin}`;

            if (price.textContent !== priceText) price.textContent = priceText;
          }
        } else {
          // Create product
          fragment.appendChild(this.createProduct(product));
        }
      });

      // Remove products not in current list
      existing.forEach((el, id) => {
        if (!productIds.has(id)) el.remove();
      });

      if (fragment.children.length > 0) {
        this.productsGrid.appendChild(fragment);
      }
    },

    // Minimal product creation
    createProduct(p) {
      const card = $.el('div', 'afs-product-card', { 'data-afs-product-id': $.id(p) });

      if (p.imageUrl || p.featuredImage) {
        const imgContainer = $.el('div', 'afs-product-card__image');
        const img = $.el('img', '', {
          alt: p.title || '',
          loading: 'lazy',
          decoding: 'async',
          fetchpriority: 'low'
        });

        // Get base image URL
        const baseImageUrl = p.featuredImage?.url || p.featuredImage?.urlFallback || p.imageUrl || '';

        if (baseImageUrl) {
          // Use responsive images with srcset for optimal loading
          if (p.featuredImage && (p.featuredImage.urlSmall || p.featuredImage.urlMedium || p.featuredImage.urlLarge)) {
            // Use pre-optimized URLs from Liquid if available
            const srcset = [];
            if (p.featuredImage.urlSmall) srcset.push(`${p.featuredImage.urlSmall} 200w`);
            if (p.featuredImage.urlMedium) srcset.push(`${p.featuredImage.urlMedium} 300w`);
            if (p.featuredImage.urlLarge) srcset.push(`${p.featuredImage.urlLarge} 500w`);

            if (srcset.length > 0) {
              img.setAttribute('srcset', srcset.join(', '));
              img.setAttribute('sizes', '(max-width: 768px) 200px, (max-width: 1024px) 300px, 500px');
            }

            // Set src with WebP first, fallback to original
            img.src = p.featuredImage.url || p.featuredImage.urlFallback || baseImageUrl;
          } else {
            // Optimize image URL on-the-fly for API responses
            const optimizedUrl = $.optimizeImageUrl(baseImageUrl, { width: 300, format: 'webp', quality: 80 });
            const srcset = $.buildImageSrcset(baseImageUrl, [200, 300, 500]);

            if (srcset) {
              img.setAttribute('srcset', srcset);
              img.setAttribute('sizes', '(max-width: 768px) 200px, (max-width: 1024px) 300px, 500px');
            }

            img.src = optimizedUrl || baseImageUrl;
          }

          // Add error handling for failed image loads
          img.onerror = function () {
            // Fallback to original format if WebP fails
            const fallbackUrl = p.featuredImage?.urlFallback || baseImageUrl;
            if (fallbackUrl && this.src !== fallbackUrl) {
              // Try original format
              this.src = fallbackUrl;
            } else if (this.src.includes('_webp.')) {
              // If WebP failed, try original format
              const originalUrl = baseImageUrl.replace(/_(?:small|medium|large|grande|compact|master|\d+x\d+)_webp\./i, '_300x300.');
              if (originalUrl !== this.src) {
                this.src = originalUrl;
              } else {
                // Hide broken image
                this.style.display = 'none';
              }
            } else {
              // Hide broken image
              this.style.display = 'none';
            }
          };
        }

        imgContainer.appendChild(img);

        // Add Quick Add button - bottom right corner with + icon
        const quickAddBtn = $.el('button', 'afs-product-card__quick-add', {
          'data-product-handle': p.handle || '',
          'data-product-id': $.id(p),
          'aria-label': 'Quick add to cart',
          'type': 'button'
        });

        // Add + icon
        const plusIcon = $.el('span', 'afs-product-card__quick-add-icon');
        plusIcon.innerHTML = Icons.plus;
        quickAddBtn.appendChild(plusIcon);

        // Add text that shows on hover
        const quickAddText = $.el('span', 'afs-product-card__quick-add-text');
        quickAddText.textContent = 'Quick Add';
        quickAddBtn.appendChild(quickAddText);

        // Disable button if product is not available
        if (parseInt(p.totalInventory) <= 0 || (p.variants && !p.variants.some(v => v.availableForSale))) {
          quickAddBtn.disabled = true;
          quickAddBtn.classList.add('afs-product-card__quick-add--disabled');
          quickAddBtn.setAttribute('aria-label', 'Product unavailable');
        }

        // Add Quick View button - opens Shopify web component modal
        const quickViewBtn = $.el('button', 'afs-product-card__quick-view', {
          'data-product-handle': p.handle || '',
          'data-product-id': $.id(p),
          'aria-label': 'Quick view',
          'type': 'button'
        });
        const quickViewIcon = $.el('span', 'afs-product-card__quick-view-icon');
        quickViewIcon.innerHTML = Icons.eye;
        quickViewBtn.appendChild(quickViewIcon);
        imgContainer.appendChild(quickViewBtn);
        card.appendChild(imgContainer);
      }

      const info = $.el('div', 'afs-product-card__info');
      if (info) {
        info.appendChild($.txt($.el('h3', 'afs-product-card__title'), p.title || 'Untitled'));
        if (p.vendor) info.appendChild($.txt($.el('div', 'afs-product-card__vendor'), p.vendor));

        // price amounts are in dollars, so multiply by 100 to convert to cents
        let minPrice = parseFloat(p.minPrice) * 100;
        let maxPrice = parseFloat(p.maxPrice) * 100;
        const formattedMin = $.formatMoney(minPrice, State.moneyFormat || '{{amount}}', State.currency || '');

        // If prices are equal, show single price, otherwise show "from" prefix
        const priceText = minPrice === maxPrice ? formattedMin : `from ${formattedMin}`;

        info.appendChild($.txt($.el('div', 'afs-product-card__price'), priceText));
        card.appendChild(info);
      }
      return card;
    },

    // Update filter active state (optimized)
    updateFilterState(handle, value, active) {
      if (!this.filtersContainer) {
        Log.warn('Cannot update filter state: filtersContainer not found');
        return;
      }

      // Escape special characters in value for CSS selector
      const escapeValue = (val) => String(val).replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
      const escapedValue = escapeValue(value);
      const escapedHandle = escapeValue(handle);

      const selector = `.afs-filter-item[data-afs-filter-handle="${escapedHandle}"][data-afs-filter-value="${escapedValue}"]`;
      const item = this.filtersContainer.querySelector(selector);
      if (item) {
        const cb = item.querySelector('.afs-filter-item__checkbox');
        if (cb) {
          cb.checked = active;
          Log.debug('Checkbox state updated', { handle, value, active });
        } else {
          Log.warn('Checkbox not found in filter item', { handle, value });
        }
        item.classList.toggle('afs-filter-item--active', active);
      } else {
        Log.warn('Filter item not found for state update', { handle, value, active, selector });
      }
    },

    // Products info
    renderInfo(pagination, total) {
      if (!this.productsInfo) return;

      // Preserve sort container when clearing
      const sortContainer = this.sortContainer;
      const existingResults = this.productsInfo.querySelector('.afs-products-info__results');

      // Remove only the results and page elements, keep sort container
      if (existingResults) existingResults.remove();

      // Create results text
      let resultsEl;
      if (total === 0) {
        resultsEl = $.txt($.el('div', 'afs-products-info__results'), 'No products found');
      } else if (total === 1) {
        resultsEl = $.txt($.el('div', 'afs-products-info__results'), '1 product found');
      } else {
        const start = (pagination.page - 1) * pagination.limit + 1;
        const end = Math.min(pagination.page * pagination.limit, total);
        resultsEl = $.txt($.el('div', 'afs-products-info__results'), `Showing ${start}-${end} of ${total} products`);
      }

      // Insert results before sort container (left side)
      if (sortContainer && sortContainer.parentNode) {
        this.productsInfo.insertBefore(resultsEl, sortContainer);
      } else {
        this.productsInfo.appendChild(resultsEl);
        // Re-add sort container if it was removed
        if (sortContainer && !sortContainer.parentNode) {
          this.productsInfo.appendChild(sortContainer);
        }
      }
    },

    // Render pagination controls
    renderPagination(pagination) {
      if (!this.productsGrid || !pagination) return;

      // Remove existing pagination
      const existing = this.productsGrid.parentNode?.querySelector('.afs-pagination');
      if (existing) existing.remove();

      if (pagination.totalPages <= 1) return;

      const paginationEl = $.el('div', 'afs-pagination');

      // Previous button
      const prevBtn = $.el('button', 'afs-pagination__button', {
        'data-afs-page': pagination.page - 1,
        'aria-label': 'Previous page'
      });
      prevBtn.textContent = 'Previous';
      prevBtn.disabled = pagination.page <= 1;
      paginationEl.appendChild(prevBtn);

      // Page info
      const info = $.el('span', 'afs-pagination__info');
      info.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
      paginationEl.appendChild(info);

      // Next button
      const nextBtn = $.el('button', 'afs-pagination__button', {
        'data-afs-page': pagination.page + 1,
        'aria-label': 'Next page'
      });
      nextBtn.textContent = 'Next';
      nextBtn.disabled = pagination.page >= pagination.totalPages;
      paginationEl.appendChild(nextBtn);

      if (this.productsContainer) {
        this.productsContainer.appendChild(paginationEl);
      }
    },

    // Applied filters with clear all
    renderApplied(filters) {
      if (!this.container) return;

      // Remove existing applied filters
      const existing = this.container.querySelector('.afs-applied-filters');
      if (existing) existing.remove();

      // Count active filters
      // key here is the handle (for option filters) or queryKey (for standard filters)
      const activeFilters = [];
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (key === 'search' && value && typeof value === 'string' && value.trim()) {
          activeFilters.push({ handle: key, label: `Search: ${value}`, value });
        } else if (key === 'priceRange' && value && typeof value === 'object') {
          activeFilters.push({ handle: key, label: `Price: $${value.min} - $${value.max}`, value });
        } else if (Array.isArray(value) && value.length > 0) {
          value.forEach(v => {
            const metadata = State.filterMetadata.get(key);
            let label = metadata?.label || key;
            
            // For collection filters, use collection title from State.collections
            const isCollectionFilter = (metadata?.type === 'collection' || 
                                       metadata?.optionType === 'Collection' || 
                                       key === 'collections');
            if (isCollectionFilter && State.collections && Array.isArray(State.collections)) {
              const collection = State.collections.find(c => {
                const cId = String(c.id || c.gid || c.collectionId || '');
                return cId && String(cId) === String(v);
              });
              if (collection) {
                label = collection.title || collection.label || collection.name || label;
              }
            }
            
            activeFilters.push({ handle: key, label: `${label}: ${v}`, value: v });
          });
        }
      });
      
      // Also show cpid if it exists and collection filter is not in filters
      if (State.selectedCollection?.id) {
        const hasCollectionFilter = Object.keys(filters).some(key => {
          const metadata = State.filterMetadata.get(key);
          return (metadata?.type === 'collection' || 
                  metadata?.optionType === 'Collection' || 
                  key === 'collections') &&
                 Array.isArray(filters[key]) && 
                 filters[key].includes(String(State.selectedCollection.id));
        });
        
        if (!hasCollectionFilter) {
          // Find collection name from State.collections
          const collection = State.collections?.find(c => {
            const cId = String(c.id || c.gid || c.collectionId || '');
            return cId && String(cId) === String(State.selectedCollection.id);
          });
          const collectionName = collection?.title || collection?.label || collection?.name || 'Collection';
          activeFilters.push({ 
            handle: 'cpid', 
            label: `${collectionName}: ${State.selectedCollection.id}`, 
            value: State.selectedCollection.id 
          });
        }
      }

      if (activeFilters.length === 0) return;

      const appliedContainer = $.el('div', 'afs-applied-filters');
      const header = $.el('div', 'afs-applied-filters__header');
      header.appendChild($.txt($.el('div', 'afs-applied-filters__label'), 'Applied Filters:'));
      appliedContainer.appendChild(header);

      const list = $.el('div', 'afs-applied-filters__list');
      activeFilters.forEach(filter => {
        const chip = $.el('div', 'afs-applied-filter-chip');
        chip.appendChild($.txt($.el('span', 'afs-applied-filter-chip__label'), filter.label));
        const remove = $.el('button', 'afs-applied-filter-chip__remove', {
          'data-afs-filter-key': filter.handle,
          'data-afs-filter-value': filter.value,
          'aria-label': 'Remove filter',
          type: 'button'
        });
        remove.textContent = '×';
        chip.appendChild(remove);
        list.appendChild(chip);
      });

      const clearAll = $.el('button', 'afs-applied-filters__clear-all', {
        'data-afs-action': 'clear-all',
        type: 'button'
      });
      clearAll.textContent = 'Clear All';
      list.appendChild(clearAll);

      appliedContainer.appendChild(list);
      this.container.insertBefore(appliedContainer, this.container.firstChild);
    },

    scrollToProducts() {
      // Scroll to products section when filters are applied
      if (this.productsContainer) {
        this.productsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        Log.debug('Scrolled to products section');
      } else if (this.productsGrid) {
        this.productsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        Log.debug('Scrolled to products grid');
      } else if (this.productsInfo) {
        this.productsInfo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        Log.debug('Scrolled to products info');
      }
    },

    showLoading() {
      // Show products skeleton
      if (this.productsGrid) {
        // Clear existing products
        $.clear(this.productsGrid);

        // Get page size from State or use minimum of 24
        const pageSize = State.pagination?.limit || C.PAGE_SIZE || 24;
        const skeletonCount = Math.max(pageSize, 24); // At least 24 skeleton cards

        // Create skeleton product cards directly in the grid
        const skeletonCards = [];
        for (let i = 0; i < skeletonCount; i++) {
          const skeletonCard = $.el('div', 'afs-skeleton-card');
          // Add non-breaking space to prevent theme from hiding empty elements
          skeletonCard.innerHTML = `
            <div class="afs-skeleton-card__image">&#8203;</div>
            <div class="afs-skeleton-card__info">
              <div class="afs-skeleton-card__title">&#8203;</div>
              <div class="afs-skeleton-card__title" style="width: 60%;">&#8203;</div>
              <div class="afs-skeleton-card__price">&#8203;</div>
            </div>
          `;
          skeletonCards.push(skeletonCard);
        }

        // Append skeleton cards directly to productsGrid (which is already a grid container)
        skeletonCards.forEach(card => this.productsGrid.appendChild(card));

        // Store reference to skeleton cards for easy removal
        this.loading = skeletonCards;
      }

      // Show filters skeleton if filters container exists and is visible
      if (this.filtersContainer && this.filtersContainer.style.display !== 'none') {
        this.showFiltersSkeleton();
      }
    },

    showFiltersSkeleton() {
      // Remove existing skeleton if present
      const existingSkeleton = this.filtersContainer.querySelector('.afs-filters-skeleton');
      if (existingSkeleton) {
        existingSkeleton.remove();
      }

      // Create filters skeleton
      const filtersSkeleton = $.el('div', 'afs-filters-skeleton');
      // Create 3-4 skeleton filter groups
      for (let i = 0; i < 4; i++) {
        const skeletonGroup = $.el('div', 'afs-skeleton-filter-group');
        // Add zero-width space (&#8203;) to prevent theme from hiding empty elements
        skeletonGroup.innerHTML = `
          <div class="afs-skeleton-filter-group__header">
            <div class="afs-skeleton-filter-group__title">&#8203;</div>
          </div>
          <div class="afs-skeleton-filter-group__content">
            <div class="afs-skeleton-filter-item">&#8203;</div>
            <div class="afs-skeleton-filter-item">&#8203;</div>
            <div class="afs-skeleton-filter-item" style="width: 70%;">&#8203;</div>
            <div class="afs-skeleton-filter-item" style="width: 85%;">&#8203;</div>
          </div>
        `;
        filtersSkeleton.appendChild(skeletonGroup);
      }
      this.filtersContainer.appendChild(filtersSkeleton);
    },

    hideFiltersSkeleton() {
      const skeleton = this.filtersContainer?.querySelector('.afs-filters-skeleton');
      if (skeleton) {
        skeleton.remove();
      }
    },

    hideLoading() {
      // Remove skeleton cards if they exist
      if (Array.isArray(this.loading)) {
        // If loading is an array of skeleton cards, remove each one
        this.loading.forEach(card => {
          if (card.parentNode) {
            card.remove();
          }
        });
        this.loading = null;
      } else if (this.loading?.parentNode) {
        // If loading is a single element, remove it
        this.loading.remove();
        this.loading = null;
      }
      // Also hide filters skeleton
      this.hideFiltersSkeleton();
    },

    showError(message) {
      if (!this.productsContainer) {
        Log.error('Cannot show error: productsContainer not found');
        return;
      }

      // Remove loading if present
      this.hideLoading();

      // Check if we have fallback products to show instead of error
      if (State.fallbackProducts && State.fallbackProducts.length > 0) {
        Log.warn('API error occurred, using fallback products from Liquid', {
          error: message,
          fallbackCount: State.fallbackProducts.length
        });

        // Use fallback products
        State.products = State.fallbackProducts;
        State.pagination = {
          page: 1,
          limit: C.PAGE_SIZE,
          total: State.fallbackProducts.length,
          totalPages: Math.ceil(State.fallbackProducts.length / C.PAGE_SIZE)
        };

        // Render fallback products
        this.renderProducts(State.products);
        this.renderInfo(State.pagination, State.pagination.total);
        this.renderPagination(State.pagination);

        return;
      }

      // No fallback available, show error
      const existingError = this.productsContainer.querySelector('.afs-error-message');
      if (existingError) existingError.remove();

      const error = $.el('div', 'afs-error-message');
      error.textContent = message || 'An error occurred. Please try again.';

      // Insert error in products grid or container
      if (this.productsGrid) {
        $.clear(this.productsGrid);
        this.productsGrid.appendChild(error);
      } else {
        this.productsContainer.appendChild(error);
      }

      Log.error('Error displayed', { message });
    }
  };

  // ============================================================================
  // FALLBACK MODE HELPER (Page reload for Liquid products)
  // ============================================================================

  const FallbackMode = {
    // Get pagination info for fallback mode (from URL params and Liquid data)
    getPagination() {
      const urlParams = UrlManager.parse();
      const currentPage = urlParams.page || State.fallbackPagination.currentPage || 1;
      const totalPages = State.fallbackPagination.totalPages || 1;
      const totalProducts = State.fallbackPagination.totalProducts || State.fallbackProducts.length || 0;

      return {
        page: currentPage,
        limit: C.PAGE_SIZE,
        total: totalProducts,
        totalPages: totalPages
      };
    },

    // Reload page with updated URL parameters for sort/pagination
    reloadPage(filters, pagination, sort) {
      const url = new URL(window.location);
      url.search = '';

      // Add sort parameter
      if (sort && sort.field) {
        if (sort.field === 'best-selling' || sort.field === 'bestselling') {
          url.searchParams.set('sort', 'best-selling');
        } else {
          // Convert to new format: "field-direction" (e.g., "title-ascending")
          const direction = sort.order === 'asc' ? 'ascending' : 'descending';
          url.searchParams.set('sort', `${sort.field}-${direction}`);
        }
      }

      // Add page parameter (always set it, even if page 1, for consistency)
      if (pagination && pagination.page) {
        url.searchParams.set('page', pagination.page);
      }

      // Preserve any existing filter parameters (they'll be handled by Liquid)
      Object.keys(filters || {}).forEach(key => {
        const value = filters[key];
        if ($.empty(value)) return;

        if (Array.isArray(value) && value.length > 0) {
          url.searchParams.set(key, value.join(','));
        } else if (key === 'priceRange' && value && typeof value === 'object' && value.min !== undefined && value.max !== undefined) {
          url.searchParams.set('priceRange', `${value.min}-${value.max}`);
        } else if (key === 'search' && typeof value === 'string' && value.trim()) {
          url.searchParams.set(key, value.trim());
        }
      });

      Log.info('Reloading page for fallback mode', { url: url.toString(), sort, pagination });
      window.location.href = url.toString();
    }
  };

  // ============================================================================
  // FILTER MANAGER (Optimized)
  // ============================================================================

  const Filters = {
    // Toggle standard filter (vendor, productType, tags, collections) or handle-based filter
    toggle(handle, value) {
      const normalized = $.str(value);
      if (!normalized || !handle) {
        Log.warn('Invalid filter toggle', { handle, value });
        return;
      }

      const current = State.filters[handle] || [];
      const isActive = current.includes(normalized);
      const filterValues = isActive
        ? current.filter(v => v !== normalized)
        : [...current, normalized];

      // Check if this is a collection filter and if cpid should be cleared
      const metadata = State.filterMetadata.get(handle);
      const isCollectionFilter = (metadata?.type === 'collection' || 
                                  metadata?.optionType === 'Collection' || 
                                  handle === 'collections');
      
      if (isCollectionFilter && State.selectedCollection?.id) {
        // If unchecking (removing) and the value matches cpid, clear cpid
        if (isActive && String(normalized) === String(State.selectedCollection.id)) {
          State.selectedCollection.id = null;
          Log.debug('Collection filter unchecked (was cpid), cleared cpid', { 
            handle, 
            value: normalized, 
            cpid: State.selectedCollection.id 
          });
        }
        // Also check if cpid is no longer in the filter values after toggle
        else if (!filterValues.some(v => String(v) === String(State.selectedCollection.id))) {
          State.selectedCollection.id = null;
          Log.debug('Collection filter toggled, cpid no longer in values, cleared cpid', { 
            handle, 
            value: normalized, 
            filterValues,
            wasCpid: String(normalized) === String(State.selectedCollection.id)
          });
        }
      }

      if (filterValues.length === 0) {
        delete State.filters[handle];
      } else {
        State.filters[handle] = filterValues;
      }

      State.pagination.page = 1;

      Log.debug('Filter toggled', { handle, value: normalized, wasActive: isActive, isActive: !isActive, filterValues });

      UrlManager.update(State.filters, State.pagination, State.sort);
      DOM.updateFilterState(handle, normalized, !isActive);
      // Scroll to top when filter is clicked
      DOM.scrollToProducts();
      // Show loading skeleton immediately (before debounce)
      DOM.showLoading();

      // Close mobile filters after applying filter (on mobile devices)
      if (window.innerWidth <= 768 && DOM.filtersContainer?.classList.contains('afs-filters-container--open')) {
        DOM.filtersContainer.classList.remove('afs-filters-container--open');
        document.body.classList.remove('afs-filters-open');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('width');
        document.body.style.removeProperty('height');
        // Restore scroll position
        const scrollY = document.body.style.top;
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      }

      this.apply();
    },

    updatePriceRange(min, max) {
      if (typeof min !== 'number' || typeof max !== 'number' || min < 0 || max < min) {
        Log.warn('Invalid price range', { min, max });
        return;
      }

      // Check if range matches the full range (no filter applied)
      const priceFilter = State.availableFilters.find(f => f.type === 'priceRange' || f.type === 'variantPriceRange');
      if (priceFilter && priceFilter.range) {
        if (min === priceFilter.range.min && max === priceFilter.range.max) {
          State.filters.priceRange = null;
        } else {
          State.filters.priceRange = { min, max };
        }
      } else {
        State.filters.priceRange = { min, max };
      }

      State.pagination.page = 1;

      Log.debug('Price range updated', { min, max, priceRange: State.filters.priceRange });

      UrlManager.update(State.filters, State.pagination, State.sort);
      // Scroll to top when price range is updated
      DOM.scrollToProducts();
      // Show loading skeleton immediately (before debounce)
      DOM.showLoading();
      this.apply();
    },

    // Apply products only (for sort/pagination changes - no filter update needed)
    applyProductsOnly: $.debounce(async () => {
      Log.info('applyProductsOnly called', { filters: State.filters, pagination: State.pagination, sort: State.sort, usingFallback: State.usingFallback });

      // If in fallback mode, reload page with new URL parameters
      if (State.usingFallback) {
        Log.info('In fallback mode, reloading page with new parameters');
        FallbackMode.reloadPage(State.filters, State.pagination, State.sort);
        return;
      }

      // Scroll to top when products are being fetched
      DOM.scrollToProducts();
      // Loading is already shown before debounce, but ensure it's shown here too
      DOM.showLoading();
      try {
        Log.info('Fetching products...', { url: `${API.baseURL}/storefront/products` });
        const data = await API.products(State.filters, State.pagination, State.sort);
        Log.info('Products fetched successfully', { count: data.products?.length || 0 });
        State.products = data.products || [];
        State.pagination = data.pagination || State.pagination;
        State.usingFallback = false; // Reset fallback flag on success

        // Show filters section when API is working
        DOM.showFilters();

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total || 0);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);
        DOM.hideLoading();
      } catch (e) {
        DOM.hideLoading();
        Log.error('Failed to load products', e);

        // Try to use fallback products if available
        if (State.fallbackProducts && State.fallbackProducts.length > 0) {
          Log.warn('Products API failed, using fallback products from Liquid', {
            error: e.message,
            fallbackCount: State.fallbackProducts.length
          });

          State.usingFallback = true; // Set fallback flag
          State.products = State.fallbackProducts;
          // Use pagination from URL params and Liquid data
          State.pagination = FallbackMode.getPagination();

          // Hide filters section when using fallback
          State.availableFilters = [];
          DOM.hideFilters();

          // Update sort select value based on current sort state
          if (DOM.sortSelect) {
            if (State.sort.field === 'best-selling' || State.sort.field === 'bestselling') {
              DOM.sortSelect.value = 'best-selling';
            } else {
              const direction = State.sort.order === 'asc' ? 'ascending' : 'descending';
              DOM.sortSelect.value = `${State.sort.field}-${direction}`;
            }
          }

          DOM.renderProducts(State.products);
          DOM.renderInfo(State.pagination, State.pagination.total);
          DOM.renderPagination(State.pagination);
          DOM.renderApplied(State.filters);

        } else {
          DOM.showError(`Failed to load products: ${e.message || 'Unknown error'}`);
        }
      }
    }, C.DEBOUNCE),

    // Apply filters and products (for filter changes - needs to update both)
    apply: $.debounce(async () => {
      // Scroll to top when products are being fetched
      DOM.scrollToProducts();
      DOM.showLoading();
      try {
        const data = await API.products(State.filters, State.pagination, State.sort);
        State.products = data.products || [];
        State.pagination = data.pagination || State.pagination;

        // Fetch filters after products (will hit cache created by products request)
        // Only fetch filters when filters actually changed
        try {
          const filtersData = await API.filters(State.filters);
          if (Array.isArray(filtersData.filters)) {
            State.availableFilters = filtersData.filters;
            State.filterMetadata = Metadata.buildFilterMetadata(State.availableFilters);
            
            // Convert cpid to collection filter handle if collection filter exists and cpid is not already in filters
            if (State.selectedCollection?.id) {
              // Find collection filter handle from available filters
              const collectionFilter = State.availableFilters.find(f => 
                f.type === 'collection' || 
                f.optionType === 'Collection' || 
                f.queryKey === 'collections' ||
                f.handle === 'collections'
              );
              
              if (collectionFilter) {
                const collectionHandle = collectionFilter.handle || collectionFilter.queryKey || 'collections';
                // Check if collection filter already has this ID
                const existingCollectionValues = State.filters[collectionHandle] || [];
                if (!existingCollectionValues.includes(String(State.selectedCollection.id))) {
                  // Add cpid as collection filter
                  State.filters[collectionHandle] = [...existingCollectionValues, String(State.selectedCollection.id)];
                  Log.debug('Converted cpid to collection filter', { 
                    cpid: State.selectedCollection.id, 
                    handle: collectionHandle 
                  });
                }
              }
            }
            
            DOM.renderFilters(State.availableFilters);
          }
        } catch (e) {
          Log.warn('Failed to fetch updated filters', { error: e.message });
          // Continue with existing filters if update fails
        }

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total || 0);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);
        DOM.hideLoading();
      } catch (e) {
        DOM.hideLoading();
        Log.error('Failed to apply filters', e);

        // Try to use fallback products if available
        if (State.fallbackProducts && State.fallbackProducts.length > 0) {
          Log.warn('Filters API failed, using fallback products from Liquid', {
            error: e.message,
            fallbackCount: State.fallbackProducts.length
          });

          State.usingFallback = true; // Set fallback flag
          State.products = State.fallbackProducts;
          // Use pagination from URL params and Liquid data
          State.pagination = FallbackMode.getPagination();

          // Hide filters section when using fallback
          State.availableFilters = [];
          DOM.hideFilters();

          // Update sort select value based on current sort state
          if (DOM.sortSelect) {
            if (State.sort.field === 'best-selling' || State.sort.field === 'bestselling') {
              DOM.sortSelect.value = 'best-selling';
            } else {
              const direction = State.sort.order === 'asc' ? 'ascending' : 'descending';
              DOM.sortSelect.value = `${State.sort.field}-${direction}`;
            }
          }

          DOM.renderProducts(State.products);
          DOM.renderInfo(State.pagination, State.pagination.total);
          DOM.renderPagination(State.pagination);
          DOM.renderApplied(State.filters);

        } else {
          DOM.showError(`Failed to load products: ${e.message || 'Unknown error'}`);
        }
      }
    }, C.DEBOUNCE)
  };

  // Create Shopify Web Component Modal
  function createShopifyWebComponentModal(handle, modalId) {
    const dialog = $.el('dialog', 'afs-product-modal', { 'id': modalId });

    dialog.innerHTML = `
      <shopify-context id="${modalId}-context" type="product" handle="${handle}" wait-for-update>
        <template>
          <div class="afs-product-modal__container">
            <div class="afs-product-modal__close-container">
              <button class="afs-product-modal__close" onclick="getElementById('${modalId}').close();" type="button">&#10005;</button>
            </div>
              <div class="afs-product-modal__content">
                <div class="afs-product-modal__layout">
                <div class="afs-product-modal__media">
                  <div class="afs-product-modal__images">
                    <shopify-list-context
                      type="image"
                      onclick="updateSlider(event)"
                      query="product.selectedOrFirstAvailableVariant.product.images"
                      first="50"
                    >
                      <template>
                        <div class="afs-product-modal__image">
                          <shopify-media class="afs-product-modal__image-small" width="130" height="130" query="image"></shopify-media>
                        </div>
                      </template>
                    </shopify-list-context>
                  </div>
                  <div class="afs-product-modal__image-slider">
                    <div class="afs-product-modal__image-grid" id="${modalId}-image-grid">
                      <shopify-list-context type="image" query="product.selectedOrFirstAvailableVariant.product.images" first="50">
                        <template>
                          <shopify-media class="afs-product-modal__main-image-item" layout="fixed" width="420" height="420" query="image"></shopify-media>
                        </template>
                      </shopify-list-context>
                    </div>
                  </div>
                </div>
                <div class="afs-product-modal__details">
                  <div class="afs-product-modal__header">
                    <div>
                      <span class="afs-product-modal__vendor">
                        <shopify-data query="product.vendor"></shopify-data>
                      </span>
                    </div>
                    <h1 class="afs-product-modal__title">
                      <shopify-data query="product.title"></shopify-data>
                    </h1>
                    <div class="afs-product-modal__price-container">
                      <shopify-money query="product.selectedOrFirstAvailableVariant.price"></shopify-money>
                      <shopify-money class="afs-product-modal__compare-price" query="product.selectedOrFirstAvailableVariant.compareAtPrice"></shopify-money>
                    </div>
                  </div>
                  <shopify-variant-selector></shopify-variant-selector>
                  <div class="afs-product-modal__buttons">
                    <div class="afs-product-modal__add-to-cart">
                      <div class="afs-product-modal__incrementor">
                        <button class="afs-product-modal__decrease" onclick="decreaseModalValue('${modalId}');">${Icons.minus}</button>
                        <span class="afs-product-modal__count" id="${modalId}-count">1</span>
                        <button class="afs-product-modal__increase" onclick="increaseModalValue('${modalId}');">${Icons.plus}</button>
                      </div>
                      <button
                        class="afs-product-modal__add-button"
                        onclick="addModalToCart('${modalId}');"
                        shopify-attr--disabled="!product.selectedOrFirstAvailableVariant.availableForSale"
                        type="button"
                      >
                        <shopify-money query="product.selectedOrFirstAvailableVariant.price"></shopify-money>
                        · Add to cart
                      </button>
                    </div>
                    <button
                      class="afs-product-modal__buy-button"
                      onclick="document.querySelector('shopify-store').buyNow(event)"
                      shopify-attr--disabled="!product.selectedOrFirstAvailableVariant.availableForSale"
                      type="button"
                    >
                      Buy it now
                    </button>
                  </div>
                  <div class="afs-product-modal__description">
                    <span class="afs-product-modal__description-text">
                      <shopify-data query="product.descriptionHtml"></shopify-data>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </shopify-context>
    `;

    // Close button handler
    const closeBtn = dialog.querySelector('.afs-product-modal__close');

    const closeModal = () => {
      // Restore body scroll immediately
      document.body.style.overflow = '';
      document.body.style.removeProperty('overflow');

      if (dialog.close) {
        dialog.close();
      } else {
        dialog.style.display = 'none';
      }
    };

    // Also listen for the dialog's close event to ensure overflow is restored
    dialog.addEventListener('close', () => {
      document.body.style.overflow = '';
      document.body.style.removeProperty('overflow');
    });

    // Initialize image slider when modal is shown
    const initializeSlider = () => {
      // Initialize immediately and also after delays to catch late-loading images
      initImageSlider(dialog);
      setTimeout(() => {
        initImageSlider(dialog);
      }, 100);
      setTimeout(() => {
        initImageSlider(dialog);
      }, 300);
      setTimeout(() => {
        initImageSlider(dialog);
      }, 600);
      setTimeout(() => {
        initImageSlider(dialog);
      }, 1000);
    };

    dialog.addEventListener('show', initializeSlider);

    // Also initialize if modal is already open
    if (dialog.open) {
      initializeSlider();
    }

    // Also initialize when dialog is added to DOM
    setTimeout(initializeSlider, 100);

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    // Handle ESC key and backdrop click
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeModal();
    });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeModal();
      }
    });

    return dialog;
  }
  
  // Quantity management functions for modal (based on example code)
  if (typeof window.decreaseModalValue === 'undefined') {
    window.decreaseModalValue = function(modalId) {
      const countDisplay = document.getElementById(`${modalId}-count`);
      if (!countDisplay) return;
      const currentCount = parseInt(countDisplay.textContent, 10) || 1;
      if (currentCount > 1) {
        countDisplay.textContent = currentCount - 1;
      }
    };
  }
  
  if (typeof window.increaseModalValue === 'undefined') {
    window.increaseModalValue = function(modalId) {
      const countDisplay = document.getElementById(`${modalId}-count`);
      if (!countDisplay) return;
      const currentCount = parseInt(countDisplay.textContent, 10) || 1;
      countDisplay.textContent = currentCount + 1;
    };
  }
  
  if (typeof window.addModalToCart === 'undefined') {
    window.addModalToCart = function(modalId) {
      const countDisplay = document.getElementById(`${modalId}-count`);
      const count = countDisplay ? parseInt(countDisplay.textContent, 10) || 1 : 1;
      const cart = document.getElementById('cart');
      const modal = document.getElementById(modalId);
      
      if (!cart) {
        console.error('Cart element not found');
        return;
      }
      
      // Add items to cart based on quantity (like example code)
      for (let i = 0; i < count; i++) {
        cart.addLine(event);
      }
      
      // Show cart modal and close product modal
      cart.showModal();
      if (modal && modal.close) {
        modal.close();
      }
    };
  }
  
  // Global updateSlider function for Shopify web components
  // Based on example code - finds index dynamically instead of using Liquid template variables
  if (typeof window.updateSlider === 'undefined') {
    window.updateSlider = function (event) {
      event.preventDefault();
      event.stopPropagation();

      const clickedThumbnail = event.target.closest('.afs-product-modal__image');
      if (!clickedThumbnail) return;

      const mediaContainer = clickedThumbnail.closest('.afs-product-modal__media');
      if (!mediaContainer) return;

      const imageGrid = mediaContainer.querySelector('.afs-product-modal__image-grid');
      if (!imageGrid) return;

      // Get all thumbnail images (like example code approach)
      const thumbnailImages = mediaContainer.querySelectorAll('.afs-product-modal__image-small img');
      if (thumbnailImages.length === 0) return;

      // Get the clicked thumbnail image
      const clickedThumbnailImg = clickedThumbnail.querySelector('.afs-product-modal__image-small img');
      if (!clickedThumbnailImg) return;

      // Find index by comparing with all thumbnails (like example code: Array.from(images).indexOf(selectedImage))
      const foundIndex = Array.from(thumbnailImages).indexOf(clickedThumbnailImg);
      if (foundIndex === -1) return;

      // Get all main images
      const mainImages = imageGrid.querySelectorAll('.afs-product-modal__main-image-item');
      if (mainImages.length === 0) return;

      // Hide all main images
      mainImages.forEach((img) => {
        img.style.setProperty('display', 'none', 'important');
      });

      // Show the selected image
      if (foundIndex >= 0 && mainImages[foundIndex]) {
        mainImages[foundIndex].style.setProperty('display', 'flex', 'important');
      } else if (mainImages[0]) {
        // Fallback to first image
        mainImages[0].style.setProperty('display', 'flex', 'important');
      }

      // Update active thumbnail (remove active from all, add to clicked - like example code)
      const thumbnails = mediaContainer.querySelectorAll('.afs-product-modal__image');
      thumbnails.forEach((thumb) => {
        thumb.classList.remove('afs-product-modal__image--active');
      });
      clickedThumbnail.classList.add('afs-product-modal__image--active');
    };
  }

  // Initialize image slider when modal opens
  function initImageSlider(modal) {
    const imageGrid = modal.querySelector('.afs-product-modal__image-grid');
    if (!imageGrid) return;

    // Wait for images to load using MutationObserver (like reference code)
    function waitForElement(selector, callback) {
      const elements = imageGrid.querySelectorAll(selector);
      if (elements.length > 0) {
        callback(elements);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const foundElements = imageGrid.querySelectorAll(selector);
        if (foundElements.length > 0) {
          obs.disconnect();
          callback(foundElements);
        }
      });

      observer.observe(imageGrid, {
        childList: true,
        subtree: true
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        observer.disconnect();
        const foundElements = imageGrid.querySelectorAll(selector);
        if (foundElements.length > 0) {
          callback(foundElements);
        }
      }, 5000);
    }

    waitForElement('.afs-product-modal__main-image-item', (mainImages) => {
      // Show first image and hide all others
      mainImages.forEach((img, index) => {
        if (index === 0) {
          img.style.setProperty('display', 'flex', 'important');
        } else {
          img.style.setProperty('display', 'none', 'important');
        }
      });

      // Set active state on first thumbnail
      waitForElement('.afs-product-modal__image', (thumbnails) => {
        thumbnails.forEach((thumb, i) => {
          thumb.classList.toggle('afs-product-modal__image--active', i === 0);
        });
      });
    });
  }

  // Quick Add functionality
  const QuickAdd = {
    async add(handle, productId) {
      try {
        // Fetch product to get first variant
        const productUrl = `/products/${handle}.json`;
        const response = await fetch(productUrl);

        if (!response.ok) {
          throw new Error('Failed to load product');
        }

        const data = await response.json();
        const product = data.product;

        if (!product || !product.variants || product.variants.length === 0) {
          throw new Error('Product has no variants');
        }

        // Use first available variant
        const variant = product.variants.find(v => v.available) || product.variants[0];

        await this.addVariant(variant.id, 1);
      } catch (error) {
        Log.error('Quick add failed', { error: error.message, handle });
        alert('Failed to add product to cart. Please try again.');
      }
    },

    async addFromForm(form, handle) {
      try {
        const formData = new FormData(form);
        const variantId = formData.get('id');
        const quantity = parseInt(formData.get('quantity') || '1', 10);

        if (!variantId) {
          // If no variant ID, need to find variant based on selected options
          const options = [];
          for (let i = 1; i <= 3; i++) {
            const option = formData.get(`option${i}`);
            if (option) options.push(option);
          }

          // Fetch product to find matching variant
          const productUrl = `/products/${handle}.json`;
          const response = await fetch(productUrl);
          const data = await response.json();
          const product = data.product;

          const variant = product.variants.find(v => {
            return v.options.length === options.length &&
              v.options.every((opt, idx) => opt === options[idx]);
          });

          if (variant) {
            await this.addVariant(variant.id, quantity);
          } else {
            throw new Error('Variant not found');
          }
        } else {
          await this.addVariant(variantId, quantity);
        }
      } catch (error) {
        Log.error('Add from form failed', { error: error.message });
        alert('Failed to add product to cart. Please try again.');
      }
    },

    async addVariant(variantId, quantity) {
      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: variantId,
            quantity: quantity
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.description || 'Failed to add to cart');
        }

        const item = await response.json();

        // Trigger cart update event
        document.dispatchEvent(new CustomEvent('cart:updated'));

        // Show success message
        this.showSuccess();

        // Close quick view if open
        QuickView.close();
      } catch (error) {
        Log.error('Add variant failed', { error: error.message, variantId });
        throw error;
      }
    },

    showSuccess() {
      // Create or update success message
      let message = document.querySelector('.afs-quick-add-success');
      if (!message) {
        message = $.el('div', 'afs-quick-add-success');
        document.body.appendChild(message);
      }

      message.textContent = 'Added to cart!';
      message.classList.add('afs-quick-add-success--show');

      setTimeout(() => {
        message.classList.remove('afs-quick-add-success--show');
      }, 3000);
    }
  };

  // ============================================================================
  // EVENT HANDLERS (Single delegated handler)
  // ============================================================================

  const Events = {
    attach() {
      if (!DOM.container) return;

      DOM.container.addEventListener('click', (e) => {
        const action = e.target.closest('[data-afs-action]')?.dataset.afsAction;
        const item = e.target.closest('.afs-filter-item');
        const checkbox = e.target.type === 'checkbox' ? e.target : item?.querySelector('.afs-filter-item__checkbox');
        const pagination = e.target.closest('.afs-pagination__button');

        if (action === 'clear-all') {
          // Reset to initial state (standard filters only, handles will be removed dynamically)
          State.filters = { vendor: [], productType: [], tags: [], collections: [], search: '', priceRange: null };
          State.pagination.page = 1;
          UrlManager.update(State.filters, State.pagination, State.sort);
          // Scroll to top when clearing all filters
          DOM.scrollToProducts();
          // Show loading skeleton immediately (before debounce)
          DOM.showLoading();
          Filters.apply();
        }
        else if (action === 'toggle-filters' || action === 'close-filters') {
          if (action === 'close-filters') {
            // Explicitly close filters
            if (DOM.filtersContainer) {
              DOM.filtersContainer.classList.remove('afs-filters-container--open');
              document.body.classList.remove('afs-filters-open');
              document.body.style.overflow = '';
              document.body.style.position = '';
              document.body.style.width = '';
              document.body.style.height = '';
              document.body.style.removeProperty('overflow');
              document.body.style.removeProperty('position');
              document.body.style.removeProperty('width');
              document.body.style.removeProperty('height');
              // Restore scroll position
              const scrollY = document.body.style.top;
              if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || '0') * -1);
              }
            }
          } else {
            // Toggle mobile filters
            DOM.toggleMobileFilters();
          }
        }
        else if (e.target.closest('.afs-applied-filter-chip__remove')) {
          const chip = e.target.closest('.afs-applied-filter-chip');
          const key = chip.querySelector('.afs-applied-filter-chip__remove')?.getAttribute('data-afs-filter-key');
          const value = chip.querySelector('.afs-applied-filter-chip__remove')?.getAttribute('data-afs-filter-value');
          if (key && value) {
            // If removing cpid, clear selectedCollection
            if (key === 'cpid') {
              State.selectedCollection.id = null;
              Log.debug('cpid removed, cleared selectedCollection');
            }
            Filters.toggle(key, value);
          }
        }
        // Sort dropdown is handled by change event (see below)
        else if (checkbox && item) {
          e.preventDefault(); // Prevent default checkbox toggle behavior
          e.stopPropagation(); // Stop event bubbling

          // Get handle from data attribute (handle is stored directly)
          const handle = item.getAttribute('data-afs-filter-handle') || item.getAttribute('data-afs-filter-type');
          const value = item.getAttribute('data-afs-filter-value');

          if (!handle || !value) {
            Log.warn('Invalid filter item clicked', { handle, value });
            return;
          }

          Log.debug('Filter toggle', { handle, value, currentChecked: checkbox.checked });
          Filters.toggle(handle, value);
        }
        else if (pagination && !pagination.disabled) {
          const page = parseInt(pagination.getAttribute('data-afs-page'), 10);
          if (page && page > 0) {
            // In fallback mode, read current page from URL to ensure accuracy
            if (State.usingFallback) {
              const urlParams = UrlManager.parse();
              const currentPage = urlParams.page || State.pagination.page || 1;
              // Calculate the correct next/previous page
              const isNext = page > currentPage;
              const isPrev = page < currentPage;
              State.pagination.page = page;
            } else {
              State.pagination.page = page;
            }
            UrlManager.update(State.filters, State.pagination, State.sort);
            // Scroll to top when pagination changes
            DOM.scrollToProducts();
            // Show loading skeleton immediately (before debounce)
            DOM.showLoading();
            // Only fetch products, not filters (filters haven't changed)
            Filters.applyProductsOnly();
          }
        }
        else if (e.target.closest('.afs-filter-group__clear')) {
          e.preventDefault();
          e.stopPropagation();
          const clearBtn = e.target.closest('.afs-filter-group__clear');
          if (!clearBtn) return;
          
          const handle = clearBtn.getAttribute('data-afs-filter-handle');
          if (!handle) return;
          
          // Remove the filter from State.filters
          if (State.filters[handle]) {
            delete State.filters[handle];
            Log.debug('Filter cleared', { handle });
            
            // Update URL
            UrlManager.update(State.filters, State.pagination, State.sort);
            
            // Scroll to top and show loading
            DOM.scrollToProducts();
            DOM.showLoading();
            
            // Apply filters to refresh products and filters
            Filters.apply();
          }
        }
        else if (e.target.closest('.afs-filter-group__toggle')) {
          e.preventDefault();
          e.stopPropagation();
          const group = e.target.closest('.afs-filter-group');
          if (!group) return;

          const collapsed = group.getAttribute('data-afs-collapsed') === 'true';
          const collapsedState = !collapsed;
          group.setAttribute('data-afs-collapsed', collapsedState ? 'true' : 'false');

          // Update toggle button aria-expanded
          const toggle = group.querySelector('.afs-filter-group__toggle');
          if (toggle) {
            toggle.setAttribute('aria-expanded', collapsedState ? 'false' : 'true');
          }

          // Update icon
          const icon = group.querySelector('.afs-filter-group__icon');
          if (icon) {
            // Update inline SVG HTML
            icon.innerHTML = collapsedState
              ? (Icons.rightArrow || '')
              : (Icons.downArrow || '');
          }

          // Content visibility is handled by CSS via data-afs-collapsed attribute
          Log.debug('Filter group toggled', { collapsed: collapsedState });
        }
        else if (e.target.closest('.afs-product-card__quick-add')) {
          e.preventDefault();
          e.stopPropagation();
          const btn = e.target.closest('.afs-product-card__quick-add');
          if (btn.disabled) return;
          const handle = btn.getAttribute('data-product-handle');
          const productId = btn.getAttribute('data-product-id');
          if (handle) {
            QuickAdd.add(handle, productId);
          }
        }
        else if (e.target.closest('.afs-product-card__quick-view')) {
          e.preventDefault();
          e.stopPropagation();
          const btn = e.target.closest('.afs-product-card__quick-view');
          const handle = btn.getAttribute('data-product-handle');
          if (handle) {
            // Open Shopify web component modal
            const modalId = `product-modal-${handle}`;
            let modal = document.getElementById(modalId);
            if (!modal) {
              modal = createShopifyWebComponentModal(handle, modalId);
              document.body.appendChild(modal);
            }

            // Update context if it exists
            const context = modal.querySelector(`#${modalId}-context`);
            if (context && context.update) {
              context.update({ target: btn });
            }

            // Show modal
            if (modal.showModal) {
              // Prevent body scroll when modal is open
              document.body.style.overflow = 'hidden';
              modal.showModal();
            } else {
              document.body.style.overflow = 'hidden';
              modal.style.display = 'block';
            }

            // Ensure overflow is restored when modal closes (backup)
            const restoreScroll = () => {
              document.body.style.overflow = '';
              document.body.style.removeProperty('overflow');
            };

            // Listen for close event
            modal.addEventListener('close', restoreScroll, { once: true });

            // Also set up a MutationObserver as backup
            const observer = new MutationObserver(() => {
              if (!modal.open && !modal.hasAttribute('open')) {
                restoreScroll();
                observer.disconnect();
              }
            });
            observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
          }
        }
        else if (e.target.closest('.afs-quick-view-modal__close') || e.target.closest('.afs-quick-view-modal__overlay')) {
          e.preventDefault();
          QuickView.close();
        }
      });

      // Search input
      DOM.container.addEventListener('input', (e) => {
        if (e.target.classList.contains('afs-filter-group__search-input')) {
          const term = e.target.value.toLowerCase();
          const items = e.target.closest('.afs-filter-group')?.querySelector('.afs-filter-group__items');
          if (items?._items) {
            items.querySelectorAll('.afs-filter-item').forEach((el, i) => {
              const item = items._items[i];
              if (item) {
                // Search by label (for display), but filtering still uses value
                const searchText = $.str(typeof item === 'string' ? item : (item.label || item.value || '')).toLowerCase();
                el.style.display = !term || searchText.includes(term) ? '' : 'none';
              }
            });
          }
        }
      });

      // Helper function to handle sort change
      const handleSortChange = (select) => {
        const sortValue = select.value;
        if (!sortValue) return;

        Log.info('Sort dropdown changed', { sortValue, currentSort: State.sort });

        // Calculate new sort state
        // New format: "title-ascending", "price-descending", etc.
        let newSort;
        if (sortValue === 'best-selling' || sortValue === 'bestselling') {
          newSort = { field: 'best-selling', order: 'asc' };
        } else if (sortValue.includes('-')) {
          // New format: "field-direction" (e.g., "title-ascending")
          const [field, direction] = sortValue.split('-');
          const order = direction === 'ascending' ? 'asc' : direction === 'descending' ? 'desc' : 'desc';
          newSort = { field, order };
        } else {
          // Legacy format: "field:order" (backward compatibility)
          const [field, order] = sortValue.split(':');
          newSort = { field, order: order || 'desc' };
        }

        // Always update state and call API when sort is selected
        // (even if value is same, user explicitly selected it)
        State.sort = newSort;
        State.pagination.page = 1;
        UrlManager.update(State.filters, State.pagination, State.sort);
        Log.info('Calling applyProductsOnly after sort change', { sort: State.sort });
        // Show loading skeleton immediately (before debounce)
        DOM.scrollToProducts();
        DOM.showLoading();
        // Only fetch products, not filters (filters haven't changed)
        Filters.applyProductsOnly();
      };

      // Store the previous value to detect changes
      let previousSortValue = null;

      // Track when select is focused to capture initial value
      DOM.container.addEventListener('focus', (e) => {
        if (e.target.classList.contains('afs-sort-select')) {
          previousSortValue = e.target.value;
        }
      }, true);

      // Sort dropdown change event (fires when value changes)
      DOM.container.addEventListener('change', (e) => {
        if (e.target.classList.contains('afs-sort-select')) {
          handleSortChange(e.target);
          previousSortValue = e.target.value;
        }
      });

      // Also listen for blur event (fires when dropdown closes)
      // This catches cases where user selects the same option (change event doesn't fire)
      DOM.container.addEventListener('blur', (e) => {
        if (e.target.classList.contains('afs-sort-select')) {
          const select = e.target;
          const currentValue = select.value;

          // If value is different from previous, or if change event didn't fire
          // (previousSortValue might be null on first interaction)
          if (currentValue && currentValue !== previousSortValue) {
            // Small delay to ensure change event has a chance to fire first
            setTimeout(() => {
              // Double-check: if value still doesn't match state, trigger change
              let currentSortValue;
              if (State.sort.field === 'best-selling' || State.sort.field === 'bestselling') {
                currentSortValue = 'best-selling';
              } else {
                // Convert to new format: "field-direction" (e.g., "title-ascending")
                const direction = State.sort.order === 'asc' ? 'ascending' : 'descending';
                currentSortValue = `${State.sort.field}-${direction}`;
              }

              if (currentValue !== currentSortValue) {
                handleSortChange(select);
              }
            }, 50);
          }
          previousSortValue = currentValue;
        }
      }, true);

      window.addEventListener('popstate', () => {
        const params = UrlManager.parse();

        // Store old state to detect if filters changed
        const oldFilters = JSON.stringify(State.filters);
        const oldPage = State.pagination.page;
        const oldSort = JSON.stringify(State.sort);

        // Set keep from URL params
        if (params.keep !== undefined) {
          if (params.keep === '__all__') {
            State.keep = '__all__';
          } else if (Array.isArray(params.keep) && params.keep.length > 0) {
            State.keep = params.keep;
          } else {
            State.keep = null;
          }
        }

        // Rebuild filters from params (includes standard filters + handles)
        State.filters = {
          vendor: params.vendor || [],
          productType: params.productType || [],
          tags: params.tags || [],
          collections: params.collections || [],
          search: params.search || '',
          priceRange: params.priceRange || null
        };
        // Add all handle-based filters (everything that's not a standard filter)
        Object.keys(params).forEach(key => {
          if (!['vendor', 'productType', 'tags', 'collections', 'search', 'priceRange', 'page', 'limit', 'sort', 'keep'].includes(key)) {
            if (Array.isArray(params[key])) {
              State.filters[key] = params[key];
            } else if (typeof params[key] === 'string') {
              State.filters[key] = [params[key]];
            }
          }
        });

        const newPage = params.page || State.pagination.page;
        if (newPage !== oldPage) {
          State.pagination.page = newPage;
        }

        // Update sort from URL params or default to best-selling
        if (params.sort) {
          const sortValue = params.sort.field || params.sort;
          if (typeof sortValue === 'string') {
            const normalized = sortValue.toLowerCase().trim();
            if (normalized === 'best-selling' || normalized === 'bestselling') {
              State.sort = { field: 'best-selling', order: 'asc' };
            } else if (normalized.includes('-')) {
              // New format: "field-direction" (e.g., "title-ascending")
              const [field, direction] = normalized.split('-');
              const order = direction === 'ascending' ? 'asc' : direction === 'descending' ? 'desc' : 'desc';
              State.sort = { field, order };
            } else {
              // Legacy format: "field:order" (backward compatibility)
              const [field, order] = sortValue.split(':');
              State.sort = { field, order: order || 'desc' };
            }
          } else if (params.sort.field) {
            State.sort = { field: params.sort.field, order: params.sort.order || 'desc' };
          }
        } else {
          // Default to best-selling if no sort in URL
          State.sort = { field: 'best-selling', order: 'asc' };
        }

        // Check if filters changed
        const newFilters = JSON.stringify(State.filters);
        const newSort = JSON.stringify(State.sort);
        const filtersChanged = oldFilters !== newFilters;
        const onlySortOrPageChanged = !filtersChanged && (newSort !== oldSort || newPage !== oldPage);

        // Only fetch filters if filters actually changed
        if (onlySortOrPageChanged) {
          Filters.applyProductsOnly();
        } else {
          Filters.apply();
        }
      });
    }
  };

  // ============================================================================
  // MAIN API (Minimal)
  // ============================================================================

  const AFS = {
    init(config = {}) {
      try {
        Log.enabled = config.enableLogging;
        Log.info('Initializing AFS', config);

        if (config.apiBaseUrl) {
          API.setBaseURL(config.apiBaseUrl);
          Log.info('API base URL set', { url: API.baseURL });
        }

        if (!config.shop) {
          throw new Error('Shop parameter is required in config');
        }

        State.shop = config.shop;
        State.collections = config.collections;
        State.selectedCollection = config.selectedCollection;

        // Store money format from Shopify
        if (config.moneyFormat) {
          State.moneyFormat = config.moneyFormat;
        }
        if (config.moneyWithCurrencyFormat) {
          State.moneyWithCurrencyFormat = config.moneyWithCurrencyFormat;
        }
        if (config.currency) {
          State.currency = config.currency;
        }

        // Store fallback products and pagination from Liquid
        if (config.fallbackProducts && Array.isArray(config.fallbackProducts) && config.fallbackProducts.length > 0) {
          State.fallbackProducts = config.fallbackProducts;
          Log.info('Fallback products loaded from Liquid', { count: State.fallbackProducts.length });
        }

        if (config.fallbackPagination) {
          State.fallbackPagination = config.fallbackPagination;
          Log.info('Fallback pagination loaded from Liquid', {
            currentPage: State.fallbackPagination.currentPage,
            totalPages: State.fallbackPagination.totalPages,
            totalProducts: State.fallbackPagination.totalProducts
          });
        }

        // Initialize keep from config if provided
        if (config.keep !== undefined) {
          if (config.keep === '__all__' || config.keep === '__ALL__') {
            State.keep = '__all__';
          } else if (Array.isArray(config.keep) && config.keep.length > 0) {
            State.keep = config.keep;
          } else if (typeof config.keep === 'string' && config.keep.trim()) {
            State.keep = $.split(config.keep);
          } else {
            State.keep = null;
          }
          Log.info('Keep filters set from config', { keep: State.keep });
        }

        Log.info('Shop set', { shop: State.shop });
        Log.info('Collections set', { collections: State.collections });

        DOM.init(config.container || '[data-afs-container]', config.filtersContainer, config.productsContainer);
        Log.info('DOM initialized');

        // Show loading skeleton immediately on initial load (before API calls)
        DOM.showLoading();

        Events.attach();
        Log.info('Events attached');

        this.load();
      } catch (e) {
        Log.error('Initialization failed', { error: e.message, stack: e.stack, config });
        if (DOM.container) {
          DOM.showError(`Initialization failed: ${e.message}`);
        }
        throw e;
      }
    },

    async load() {
      // Loading skeleton is already shown in init(), but ensure it's visible
      DOM.showLoading();
      try {
        Log.info('Loading filters...', { shop: State.shop, filters: State.filters });
        let filtersData;
        try {
          filtersData = await API.filters(State.filters);
          Log.enabled = true;
          Log.info('Filters loaded', { filtersCount: filtersData.filters || 0 });
        } catch (filterError) {
          Log.warn('Failed to load filters, continuing with empty filters', { error: filterError.message });
          filtersData = { filters: [] };
        }

        Log.enabled = false;
        // Validate filters is an array
        if (!Array.isArray(filtersData.filters)) {
          Log.error('Invalid filters response: filters is not an array', { filters: filtersData.filters });
          filtersData.filters = [];
        }

        State.availableFilters = filtersData.filters || [];
        State.filterMetadata = Metadata.buildFilterMetadata(State.availableFilters);

        // Parse URL params - handles are parsed directly, no conversion needed
        const urlParams = UrlManager.parse();
        Log.debug('Parsed URL params', { urlParams, availableFiltersCount: State.availableFilters.length });

        // Convert cpid to collection filter handle if collection filter exists
        if (State.selectedCollection?.id) {
          const collectionFilter = State.availableFilters.find(f => 
            f.type === 'collection' || 
            f.optionType === 'Collection' || 
            f.queryKey === 'collections' ||
            f.handle === 'collections'
          );
          
          if (collectionFilter) {
            const collectionHandle = collectionFilter.handle || collectionFilter.queryKey || 'collections';
            // Check if collection filter already has this ID in URL params
            const existingCollectionValues = urlParams[collectionHandle] || [];
            if (!existingCollectionValues.includes(String(State.selectedCollection.id))) {
              // Add cpid as collection filter to URL params
              if (!urlParams[collectionHandle]) {
                urlParams[collectionHandle] = [];
              }
              urlParams[collectionHandle].push(String(State.selectedCollection.id));
              Log.debug('Converted cpid to collection filter', { 
                cpid: State.selectedCollection.id, 
                handle: collectionHandle 
              });
            }
          }
        }

        // Set keep from URL params
        if (urlParams.keep !== undefined) {
          if (urlParams.keep === '__all__') {
            State.keep = '__all__';
          } else if (Array.isArray(urlParams.keep) && urlParams.keep.length > 0) {
            State.keep = urlParams.keep;
          } else {
            State.keep = null;
          }
          Log.debug('Keep filters set from URL', { keep: State.keep });
        } else {
          State.keep = null;
        }

        // Rebuild filters from params (includes standard filters + handles)
        State.filters = {
          vendor: urlParams.vendor || [],
          productType: urlParams.productType || [],
          tags: urlParams.tags || [],
          collections: urlParams.collections || [],
          search: urlParams.search || '',
          priceRange: urlParams.priceRange || null
        };
        // Add all handle-based filters (everything that's not a standard filter)
        Object.keys(urlParams).forEach(key => {
          if (!['vendor', 'productType', 'tags', 'collections', 'search', 'priceRange', 'page', 'limit', 'sort', 'keep', 'cpid'].includes(key)) {
            if (Array.isArray(urlParams[key])) {
              State.filters[key] = urlParams[key];
            } else if (typeof urlParams[key] === 'string') {
              State.filters[key] = [urlParams[key]];
            }
          }
        });
        Log.info('Filters set from URL', { filters: State.filters });
        // Read page from URL params (important for fallback mode)
        if (urlParams.page) {
          State.pagination.page = urlParams.page;
        } else {
          // If no page in URL, use fallback pagination current page if available
          if (State.fallbackPagination && State.fallbackPagination.currentPage) {
            State.pagination.page = State.fallbackPagination.currentPage;
          }
        }

        // Set sort from URL params or default to best-selling
        if (urlParams.sort) {
          const sortValue = urlParams.sort.field || urlParams.sort;
          if (typeof sortValue === 'string') {
            const normalized = sortValue.toLowerCase().trim();
            if (normalized === 'best-selling' || normalized === 'bestselling') {
              State.sort = { field: 'best-selling', order: 'asc' };
            } else if (normalized.includes('-')) {
              // New format: "field-direction" (e.g., "title-ascending")
              const [field, direction] = normalized.split('-');
              const order = direction === 'ascending' ? 'asc' : direction === 'descending' ? 'desc' : 'desc';
              State.sort = { field, order };
            } else {
              // Legacy format: "field:order" (backward compatibility)
              const [field, order] = sortValue.split(':');
              State.sort = { field, order: order || 'desc' };
            }
          } else if (urlParams.sort.field) {
            State.sort = { field: urlParams.sort.field, order: urlParams.sort.order || 'desc' };
          }
        } else {
          // Default to best-selling if no sort in URL
          State.sort = { field: 'best-selling', order: 'asc' };
        }

        DOM.renderFilters(State.availableFilters);
        Log.info('Filters rendered', { count: State.availableFilters.length });

        Log.info('Loading products...', { filters: State.filters, pagination: State.pagination });
        const productsData = await API.products(State.filters, State.pagination, State.sort);
        Log.info('Products loaded', { count: productsData.products?.length || 0, total: productsData.pagination?.total || 0 });

        // Check if API returned no products or empty response
        const hasProducts = productsData.products && Array.isArray(productsData.products) && productsData.products.length > 0;
        const hasFilters = State.availableFilters && Array.isArray(State.availableFilters) && State.availableFilters.length > 0;

        if (!hasProducts && State.fallbackProducts && State.fallbackProducts.length > 0) {
          Log.warn('API returned no products, using fallback products from Liquid', {
            apiProductsCount: productsData.products?.length || 0,
            fallbackCount: State.fallbackProducts.length
          });

          State.usingFallback = true; // Set fallback flag
          State.products = State.fallbackProducts;
          // Use pagination from URL params and Liquid data
          State.pagination = FallbackMode.getPagination();

          // Hide filters section when using fallback
          State.availableFilters = [];
          DOM.hideFilters();
        } else {
          State.usingFallback = false; // Reset fallback flag on success
          State.products = productsData.products || [];
          State.pagination = productsData.pagination || State.pagination;

          // Show filters section when API is working
          DOM.showFilters();
        }

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total || 0);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);

        // Update sort select value (programmatically - won't trigger change event)
        if (DOM.sortSelect) {
          // Handle best-selling sort (no order in value)
          if (State.sort.field === 'best-selling' || State.sort.field === 'bestselling') {
            DOM.sortSelect.value = 'best-selling';
          } else {
            // Convert to new format: "field-direction" (e.g., "title-ascending")
            const direction = State.sort.order === 'asc' ? 'ascending' : 'descending';
            DOM.sortSelect.value = `${State.sort.field}-${direction}`;
          }
          Log.debug('Sort select value updated programmatically', { value: DOM.sortSelect.value, sort: State.sort });
        }

        DOM.hideLoading();

        if (State.products.length === 0 && !hasFilters && (!State.fallbackProducts || State.fallbackProducts.length === 0)) {
          DOM.showError('No products or filters found. Please check your configuration.');
        }
      } catch (e) {
        DOM.hideLoading();
        Log.error('Load failed', { error: e.message, stack: e.stack, shop: State.shop, apiBaseURL: API.baseURL });

        // Try to use fallback products if available
        if (State.fallbackProducts && State.fallbackProducts.length > 0) {
          Log.warn('Initial load failed, using fallback products from Liquid', {
            error: e.message,
            fallbackCount: State.fallbackProducts.length
          });

          State.usingFallback = true; // Set fallback flag
          State.products = State.fallbackProducts;
          // Use pagination from URL params and Liquid data
          State.pagination = FallbackMode.getPagination();

          // Hide filters section when using fallback
          State.availableFilters = [];
          DOM.hideFilters();

          // Update sort select value based on URL params or current sort state
          if (DOM.sortSelect) {
            if (State.sort.field === 'best-selling' || State.sort.field === 'bestselling') {
              DOM.sortSelect.value = 'best-selling';
            } else {
              const direction = State.sort.order === 'asc' ? 'ascending' : 'descending';
              DOM.sortSelect.value = `${State.sort.field}-${direction}`;
            }
          }

          DOM.renderProducts(State.products);
          DOM.renderInfo(State.pagination, State.pagination.total);
          DOM.renderPagination(State.pagination);
          DOM.renderApplied(State.filters);

        } else {
          DOM.showError(`Failed to load: ${e.message || 'Unknown error'}. Check console for details.`);
        }
      }
    },

    Logger: Log
  };

  window.DOM = DOM;
  window.AFS_State = State;
  window.AFS_API = API;

  // Export
  if (typeof window !== 'undefined') window.AFS = AFS;
  else if (typeof global !== 'undefined') global.AFS = AFS;

})(typeof window !== 'undefined' ? window : this);

