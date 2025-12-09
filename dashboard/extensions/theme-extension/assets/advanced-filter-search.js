/**
 * Advanced Filter Search - OPTIMIZED VERSION
 * Fastest filter system with minimal, reusable functions
 * 
 * Optimizations:
 * - Lookup maps (O(1) instead of O(n))
 * - Batched DOM operations
 * - Minimal function calls
 * - Reusable micro-functions
 * - No unnecessary object copies
 */

(function(global) {
  'use strict';

  // ============================================================================
  // MINIMAL CONSTANTS
  // ============================================================================
  
  const C = {
    DEBOUNCE: 200,
    TIMEOUT: 10000,
    CACHE_TTL: 300000,
    PAGE_SIZE: 20
  };

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
    id: (p) => p.id || p.gid,
    
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
    }
  };

  // ============================================================================
  // LOOKUP MAP BUILDERS (O(1) lookups)
  // ============================================================================
  
  const Maps = {
    // Build handle->option map from filters array (replaces filterConfig)
    buildHandleMap: (filters) => {
      const m = new Map();
      if (!Array.isArray(filters)) return m;
      filters.forEach(f => {
        if (f.type === 'option' && f.handle) {
          // Map handle to option name (queryKey or optionKey)
          const optionName = f.queryKey || f.optionKey || f.handle;
          m.set(f.handle, optionName);
          Log.debug('Handle mapping from filter', { handle: f.handle, optionName, queryKey: f.queryKey, optionKey: f.optionKey });
        }
      });
      return m;
    },
    
    // Build handle->filter map from availableFilters (alias for consistency)
    buildFilterMap: (filters) => {
      return Maps.buildHandleMap(filters);
    },
    
    // Build option->handle map (for URL building: option name -> handle)
    buildOptionMap: (filters) => {
      const m = new Map();
      if (!Array.isArray(filters)) return m;
      filters.forEach(f => {
        if (f.type === 'option' && f.handle) {
          const optionName = f.queryKey || f.optionKey || f.label || f.handle;
          const key = $.str(optionName).toLowerCase();
          const handle = $.str(f.handle);
          if (key && handle) {
            m.set(key, handle);
            Log.debug('Option mapping', { optionName, key, handle });
          }
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
    filters: { vendor: [], productType: [], tags: [], collections: [], options: {}, search: '', priceRange: null },
    products: [],
    collections: [],
    pagination: { page: 1, limit: C.PAGE_SIZE, total: 0, totalPages: 0 },
    sort: { field: 'createdAt', order: 'desc' },
    loading: false,
    availableFilters: [],
    handleMap: new Map(),
    optionMap: new Map()
  };

  // ============================================================================
  // LOGGER (Minimal, production-safe)
  // ============================================================================
  
  const Log = {
    enabled: true, // Always enabled for debugging
    error: (msg, data) => console.error('[AFS]', msg, data || ''),
    warn: (msg, data) => console.warn('[AFS]', msg, data || ''),
    info: (msg, data) => console.info('[AFS]', msg, data || ''),
    debug: (msg, data) => console.debug('[AFS]', msg, data || '')
  };

  // ============================================================================
  // URL PARSER (Optimized with lookup maps)
  // ============================================================================
  
  const UrlManager = {
    parse() {
      const url = new URL(window.location);
      const params = {};
      
      // Build handle->optionName map from availableFilters (replaces filterConfig)
      const handleToOptionMap = Maps.buildHandleMap(State.availableFilters);
      
      Log.debug('Handle maps built', { 
        handleToOptionMapSize: handleToOptionMap.size,
        availableFiltersCount: State.availableFilters?.length || 0
      });
      
      url.searchParams.forEach((value, key) => {
        if (key === 'shop' || key === 'shop_domain' || key === 'preserveFilters') return;
        
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
          const [field, order] = value.split(':');
          params.sort = { field, order: order || 'desc' };
        }
        else {
          // Check if key is a handle - try to find matching filter by handle
          // Handles are used directly as URL param keys (e.g., ef4gd=red, not options[color]=red)
          const optionName = handleToOptionMap.get(key);
          if (optionName) {
            // This is an option filter with a handle - map handle to option name for internal state
            if (!params.options) params.options = {};
            params.options[optionName] = $.split(value);
            Log.debug('Mapped handle to option', { handle: key, optionName, value });
          } else {
            Log.debug('Unknown URL param (not a handle or standard filter)', { key, value });
            // If not found, it might be a standard filter or unknown - skip it
          }
        }
      });
      
      return params;
    },
    
    update(filters, pagination, sort) {
      const url = new URL(window.location);
      url.search = '';
      const optionMap = State.optionMap;
      
      Log.debug('Updating URL', { filters, pagination, optionMapSize: optionMap.size });
      
      if (filters && !$.empty(filters)) {
        Object.keys(filters).forEach(key => {
          const value = filters[key];
          if ($.empty(value)) return;
          
          if (Array.isArray(value) && value.length > 0) {
            url.searchParams.set(key, value.join(','));
            Log.debug('URL param set', { key, value: value.join(',') });
          }
          else if (key === 'options' && typeof value === 'object') {
            Object.keys(value).forEach(optKey => {
              const optValues = value[optKey];
              if (!$.empty(optValues) && Array.isArray(optValues) && optValues.length > 0) {
                const handle = optionMap.get(optKey.toLowerCase()) || optKey;
                url.searchParams.set(handle, optValues.join(','));
                Log.debug('Option URL param set', { optKey, handle, values: optValues.join(','), optionMapSize: optionMap.size });
              }
            });
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
      Object.keys(filters).forEach(k => {
        const v = filters[k];
        if ($.empty(v)) return;
        if (Array.isArray(v)) params.set(k, v.join(','));
        else if (k === 'options' && typeof v === 'object') {
          // API expects option names in options[Color]=red format
          Object.keys(v).forEach(optKey => {
            const optValues = v[optKey];
            if (!$.empty(optValues) && Array.isArray(optValues) && optValues.length > 0) {
              // Send as options[Color]=red format with option name
              params.set(`options[${optKey}]`, optValues.join(','));
            }
          });
        }
        else if (k === 'priceRange' && v && typeof v === 'object' && v.min !== undefined && v.max !== undefined) {
          params.set('priceRange', `${v.min}-${v.max}`);
        }
        else if (typeof v === 'string') params.set(k, v);
      });
      params.set('page', pagination.page);
      params.set('limit', pagination.limit);
      if (sort.field) params.set('sort', `${sort.field}:${sort.order}`);
      
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
      Object.keys(filters).forEach(k => {
        const v = filters[k];
        if (!$.empty(v) && Array.isArray(v)) params.set(k, v.join(','));
      });
      
      const url = `${this.baseURL}/storefront/filters?${params}`;
      Log.info('Fetching filters', { url, shop: State.shop });
      
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
    
    init(containerSel, filtersSel, productsSel) {
      this.container = document.querySelector(containerSel) || document.querySelector('[data-afs-container]');
      if (!this.container) throw new Error('Container not found');
      
      this.container.setAttribute('data-afs-container', 'true');
      
      const main = this.container.querySelector('.afs-main-content') || $.el('div', 'afs-main-content');
      if (!main.parentNode) this.container.appendChild(main);
      
      this.filtersContainer = document.querySelector(filtersSel) || $.el('div', 'afs-filters-container');
      if (!this.filtersContainer.parentNode) main.appendChild(this.filtersContainer);
      
      this.productsContainer = document.querySelector(productsSel) || $.el('div', 'afs-products-container');
      if (!this.productsContainer.parentNode) main.appendChild(this.productsContainer);
      
      this.productsInfo = $.el('div', 'afs-products-info');
      this.productsContainer.insertBefore(this.productsInfo, this.productsContainer.firstChild);
      
      this.productsGrid = $.el('div', 'afs-products-grid');
      this.productsContainer.appendChild(this.productsGrid);
    },
    
    // Fastest filter rendering (batched)
    renderFilters(filters) {
      if (!this.filtersContainer || !Array.isArray(filters)) return;
      
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
      Log.debug('Rendering filters', { total: filters.length, valid: validFilters.length });
      
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
        
        const isOption = filter.type === 'option';
        const optionName = isOption ? filter.queryKey : null;
        const filterType = isOption ? 'options' : (filter.queryKey || filter.key);
        if (!filterType) return;
        
        const group = $.el('div', 'afs-filter-group', { 'data-afs-filter-type': filterType });
        if (optionName) group.setAttribute('data-afs-option-name', optionName);
        
        const stateKey = filter.key || (optionName ? `options:${optionName}` : filterType);
        group.setAttribute('data-afs-filter-key', stateKey);
        
        const saved = states.get(stateKey);
        const collapsed = saved?.collapsed ?? filter.collapsed === true;
        group.setAttribute('data-afs-collapsed', collapsed ? 'true' : 'false');
        
        // Header
        const header = $.el('div', 'afs-filter-group__header');
        const toggle = $.el('button', 'afs-filter-group__toggle', { type: 'button', 'aria-expanded': !collapsed ? 'true' : 'false' });
        toggle.appendChild($.txt($.el('span', 'afs-filter-group__icon'), '▼'));
        toggle.appendChild($.txt($.el('label', 'afs-filter-group__label'), filter.label || optionName || filterType));
        header.appendChild(toggle);
        group.appendChild(header);
        
        // Content
        const content = $.el('div', 'afs-filter-group__content');
        if (filter.searchable) {
          const searchContainer = $.el('div', 'afs-filter-group__search');
          const search = $.el('input', 'afs-filter-group__search-input', { type: 'text', placeholder: 'Search...' });
          if (saved?.search) search.value = saved.search;
          searchContainer.appendChild(search);
          content.appendChild(searchContainer);
        }
        
        const items = $.el('div', 'afs-filter-group__items');
        items._items = filter.values; // Store directly, no JSON
        
        // Create items fragment
        const itemsFragment = document.createDocumentFragment();
        filter.values.forEach(item => {
          const itemEl = this.createFilterItem(filterType, item, optionName, filter);
          if (itemEl) itemsFragment.appendChild(itemEl);
        });
        items.appendChild(itemsFragment);
        content.appendChild(items);
        group.appendChild(content);
        
        fragment.appendChild(group);
      });
      
      if (fragment.children.length > 0) {
        this.filtersContainer.appendChild(fragment);
        Log.debug('Filters rendered', { count: fragment.children.length });
      } else {
        Log.warn('No filter groups created');
      }
    },
    
    // Minimal filter item creation
    // Displays label for UI, uses value for filtering
    createFilterItem(type, item, optionName, config) {
      // Get value (for filtering) - always use original value
      const value = $.str(typeof item === 'string' ? item : (item.value || item.key || item.name || ''));
      if (!value || value === '[object Object]') return null;
      
      // Get label (for display) - use label if available, fallback to value
      let displayLabel = typeof item === 'string' 
        ? item 
        : (item.label || item.value || value);
      
      // If this is a Collection filter, map collection ID to collection label
      // Remove filter item if collection ID is not found in State.collections
      if (config?.optionType === 'Collection' && State.collections && Array.isArray(State.collections)) {
        const collection = State.collections.find(c => {
          // Try different possible ID fields
          const collectionId = c.id || c.gid || c.collectionId || String(c.id || '');
          return String(collectionId) === String(value);
        });
        if (!collection) {
          // Collection not found in State.collections, remove this filter item
          return null;
        }
        // Use collection title/label if available
        displayLabel = collection.title || collection.label || collection.name || displayLabel;
      }
      
      // Check if this filter is currently active
      let isChecked = false;
      if (type === 'options' && optionName) {
        const currentValues = State.filters.options[optionName] || [];
        isChecked = currentValues.includes(value);
      } else if (type && State.filters[type]) {
        const currentValues = Array.isArray(State.filters[type]) ? State.filters[type] : [];
        isChecked = currentValues.includes(value);
      }
      
      const label = $.el('label', 'afs-filter-item', {
        'data-afs-filter-type': type,
        'data-afs-filter-value': value // Store original value for filtering
      });
      if (optionName) label.setAttribute('data-afs-option-name', optionName);
      if (isChecked) label.classList.add('afs-filter-item--active');
      
      const cb = $.el('input', 'afs-filter-item__checkbox', { type: 'checkbox' });
      cb.checked = isChecked; // Set checked state based on current filters
      cb.setAttribute('data-afs-filter-type', type);
      cb.setAttribute('data-afs-filter-value', value); // Store original value for filtering
      if (optionName) cb.setAttribute('data-afs-option-name', optionName);
      
      label.appendChild(cb);
      label.appendChild($.txt($.el('span', 'afs-filter-item__label'), displayLabel)); // Display label
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
      toggle.appendChild($.txt($.el('span', 'afs-filter-group__icon'), '▼'));
      toggle.appendChild($.txt($.el('label', 'afs-filter-group__label'), filter.label || 'Price'));
      header.appendChild(toggle);
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
      
      const existing = new Map();
      this.productsGrid.querySelectorAll('[data-afs-product-id]').forEach(el => {
        existing.set(el.getAttribute('data-afs-product-id'), el);
      });
      
      const newIds = new Set(products.map($.id));
      const fragment = document.createDocumentFragment();
      
      products.forEach(product => {
        const id = $.id(product);
        const el = existing.get(id);
        if (el) {
          // Update existing
          const title = el.querySelector('.afs-product-card__title');
          if (title && title.textContent !== product.title) title.textContent = product.title || 'Untitled';
          
          const price = el.querySelector('.afs-product-card__price');
          if (price && product.priceRange) {
            const min = product.priceRange.minVariantPrice?.amount || '0';
            const max = product.priceRange.maxVariantPrice?.amount || '0';
            const priceText = min === max ? `$${parseFloat(min).toFixed(2)}` : `$${parseFloat(min).toFixed(2)} - $${parseFloat(max).toFixed(2)}`;
            if (price.textContent !== priceText) price.textContent = priceText;
          }
        } else {
          // Create new
          fragment.appendChild(this.createProduct(product));
        }
      });
      
      // Remove products not in new list
      existing.forEach((el, id) => {
        if (!newIds.has(id)) el.remove();
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
        const img = $.el('img', '', { src: p.imageUrl || p.featuredImage?.url || '', alt: p.title || '', loading: 'lazy' });
        imgContainer.appendChild(img);
        card.appendChild(imgContainer);
      }
      
      const info = $.el('div', 'afs-product-card__info');
      info.appendChild($.txt($.el('h3', 'afs-product-card__title'), p.title || 'Untitled'));
      if (p.vendor) info.appendChild($.txt($.el('div', 'afs-product-card__vendor'), p.vendor));
      if (p.priceRange) {
        const min = p.priceRange.minVariantPrice?.amount || '0';
        const max = p.priceRange.maxVariantPrice?.amount || '0';
        const priceText = min === max ? `$${parseFloat(min).toFixed(2)}` : `$${parseFloat(min).toFixed(2)} - $${parseFloat(max).toFixed(2)}`;
        info.appendChild($.txt($.el('div', 'afs-product-card__price'), priceText));
      }
      card.appendChild(info);
      
      return card;
    },
    
    // Update filter active state (optimized)
    updateFilterState(type, value, active, optionName) {
      if (!this.filtersContainer) {
        Log.warn('Cannot update filter state: filtersContainer not found');
        return;
      }
      
      // Escape special characters in value for CSS selector
      const escapeValue = (val) => String(val).replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
      const escapedValue = escapeValue(value);
      
      const selector = optionName 
        ? `.afs-filter-item[data-afs-filter-type="${type}"][data-afs-option-name="${optionName}"][data-afs-filter-value="${escapedValue}"]`
        : `.afs-filter-item[data-afs-filter-type="${type}"][data-afs-filter-value="${escapedValue}"]`;
      
      const item = this.filtersContainer.querySelector(selector);
      if (item) {
        const cb = item.querySelector('.afs-filter-item__checkbox');
        if (cb) {
          cb.checked = active;
          Log.debug('Checkbox state updated', { type, value, active, optionName, wasChecked: !active, nowChecked: active });
        } else {
          Log.warn('Checkbox not found in filter item', { type, value, optionName });
        }
        item.classList.toggle('afs-filter-item--active', active);
      } else {
        Log.warn('Filter item not found for state update', { type, value, active, optionName, selector });
      }
    },
    
    // Products info
    renderInfo(pagination, total) {
      if (!this.productsInfo) return;
      $.clear(this.productsInfo);
      
      if (total === 0) this.productsInfo.appendChild($.txt($.el('div', 'afs-products-info__results'), 'No products found'));
      else if (total === 1) this.productsInfo.appendChild($.txt($.el('div', 'afs-products-info__results'), '1 product found'));
      else {
        const start = (pagination.page - 1) * pagination.limit + 1;
        const end = Math.min(pagination.page * pagination.limit, total);
        this.productsInfo.appendChild($.txt($.el('div', 'afs-products-info__results'), `Showing ${start}-${end} of ${total} products`));
      }
      
      if (pagination.totalPages > 1) {
        this.productsInfo.appendChild($.txt($.el('div', 'afs-products-info__page'), `Page ${pagination.page} of ${pagination.totalPages}`));
      }
    },
    
    // Applied filters (minimal)
    renderApplied(filters) {
      // Implementation similar but optimized
    },
    
    showLoading() {
      if (!this.loading) {
        this.loading = $.el('div', 'afs-loading-indicator');
        this.loading.innerHTML = '<div class="afs-loading-spinner"></div><p>Loading...</p>';
      }
      if (!this.loading.parentNode && this.productsContainer) {
        this.productsContainer.appendChild(this.loading);
      }
    },
    
    hideLoading() {
      if (this.loading?.parentNode) this.loading.remove();
    },
    
    showError(message) {
      if (!this.productsContainer) {
        Log.error('Cannot show error: productsContainer not found');
        return;
      }
      
      // Remove loading if present
      this.hideLoading();
      
      // Clear existing error
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
  // FILTER MANAGER (Optimized)
  // ============================================================================
  
  const Filters = {
    toggle(type, value) {
      const normalized = $.str(value);
      if (!normalized) {
        Log.warn('Invalid filter value', { type, value });
        return;
      }
      
      const current = State.filters[type] || [];
      const isActive = current.includes(normalized);
      const newValues = isActive
        ? current.filter(v => v !== normalized)
        : [...current, normalized];
      
      State.filters[type] = newValues;
      State.pagination.page = 1;
      
      Log.debug('Filter toggled', { type, value: normalized, wasActive: isActive, isActive: !isActive, newValues });
      
      UrlManager.update(State.filters, State.pagination, State.sort);
      DOM.updateFilterState(type, normalized, !isActive);
      this.apply();
    },
    
    toggleOption(name, value) {
      const normalized = $.str(value);
      if (!normalized) {
        Log.warn('Invalid option value', { name, value });
        return;
      }
      
      const current = State.filters.options[name] || [];
      const isActive = current.includes(normalized);
      const newValues = isActive
        ? current.filter(v => v !== normalized)
        : [...current, normalized];
      
      if (newValues.length === 0) delete State.filters.options[name];
      else State.filters.options[name] = newValues;
      
      State.pagination.page = 1;
      
      Log.debug('Option toggled', { name, value: normalized, wasActive: isActive, isActive: !isActive, newValues });
      
      UrlManager.update(State.filters, State.pagination, State.sort);
      DOM.updateFilterState('options', normalized, !isActive, name);
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
      this.apply();
    },
    
    apply: $.debounce(async () => {
      DOM.showLoading();
      try {
        const data = await API.products(State.filters, State.pagination, State.sort);
        State.products = data.products || [];
        State.pagination = data.pagination || State.pagination;
        
        // Fetch updated filters after products (will hit cache created by products request)
        try {
          const updatedFiltersData = await API.filters(State.filters);
          if (Array.isArray(updatedFiltersData.filters)) {
            State.availableFilters = updatedFiltersData.filters;
            State.optionMap = Maps.buildOptionMap(State.availableFilters);
            State.handleMap = Maps.buildHandleMap(State.availableFilters);
            DOM.renderFilters(State.availableFilters);
          }
        } catch (e) {
          Log.warn('Failed to fetch updated filters', { error: e.message });
          // Continue with existing filters if update fails
        }
        
        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total || 0);
        DOM.hideLoading();
      } catch (e) {
        DOM.hideLoading();
        Log.error('Failed to apply filters', e);
        DOM.showError(`Failed to load products: ${e.message || 'Unknown error'}`);
      }
    }, C.DEBOUNCE)
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
          State.filters = { vendor: [], productType: [], tags: [], collections: [], options: {}, search: '', priceRange: null };
          State.pagination.page = 1;
          UrlManager.update(State.filters, State.pagination, State.sort);
          Filters.apply();
        }
        else if (checkbox && item) {
          e.preventDefault(); // Prevent default checkbox toggle behavior
          e.stopPropagation(); // Stop event bubbling
          
          const type = item.getAttribute('data-afs-filter-type');
          const value = item.getAttribute('data-afs-filter-value');
          const optionName = item.getAttribute('data-afs-option-name');
          
          if (!type || !value) {
            Log.warn('Invalid filter item clicked', { type, value, optionName });
            return;
          }
          
          Log.debug('Filter toggle', { type, value, optionName, currentChecked: checkbox.checked });
          
          if (type === 'options' && optionName) {
            Filters.toggleOption(optionName, value);
          } else if (type) {
            Filters.toggle(type, value);
          }
        }
        else if (pagination && !pagination.disabled) {
          const page = parseInt(pagination.getAttribute('data-afs-page'), 10);
          if (page) {
            State.pagination.page = page;
            UrlManager.update(State.filters, State.pagination, State.sort);
            Filters.apply();
          }
        }
        else if (e.target.closest('.afs-filter-group__toggle')) {
          const group = e.target.closest('.afs-filter-group');
          const collapsed = group.getAttribute('data-afs-collapsed') === 'true';
          group.setAttribute('data-afs-collapsed', !collapsed ? 'true' : 'false');
          group.querySelector('.afs-filter-group__toggle')?.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
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
      
      window.addEventListener('popstate', () => {
        const params = UrlManager.parse();
        if (params.vendor || params.productType || params.tags || params.collections || params.search || params.options || params.priceRange) {
          State.filters = {
            vendor: params.vendor || [],
            productType: params.productType || [],
            tags: params.tags || [],
            collections: params.collections || [],
            search: params.search || '',
            options: params.options || {},
            priceRange: params.priceRange || null
          };
        }
        if (params.page) State.pagination.page = params.page;
        Filters.apply();
      });
    }
  };

  // ============================================================================
  // MAIN API (Minimal)
  // ============================================================================
  
  const AFS = {
    init(config = {}) {
      try {
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
        Log.info('Shop set', { shop: State.shop });
        Log.info('Collections set', { collections: State.collections });
        
        DOM.init(config.container || '[data-afs-container]', config.filtersContainer, config.productsContainer);
        Log.info('DOM initialized');
        
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
      DOM.showLoading();
      try {
        Log.info('Loading filters...', { shop: State.shop, filters: State.filters });
        const filtersData = await API.filters(State.filters);
        Log.info('Filters loaded', { filtersCount: filtersData.filters?.length || 0 });
        
        // Validate filters is an array
        if (!Array.isArray(filtersData.filters)) {
          Log.error('Invalid filters response: filters is not an array', { filters: filtersData.filters });
          filtersData.filters = [];
        }
        
        State.availableFilters = filtersData.filters || [];
        State.optionMap = Maps.buildOptionMap(State.availableFilters);
        State.handleMap = Maps.buildHandleMap(State.availableFilters);
        
        // Parse URL params AFTER filters are loaded (so we can map handles to option names)
        const urlParams = UrlManager.parse();
        Log.debug('Parsed URL params', { urlParams, availableFiltersCount: State.availableFilters.length });
        
        if (urlParams.vendor || urlParams.productType || urlParams.tags || urlParams.collections || urlParams.search || urlParams.options || urlParams.priceRange) {
          State.filters = {
            vendor: urlParams.vendor || [],
            productType: urlParams.productType || [],
            tags: urlParams.tags || [],
            collections: urlParams.collections || [],
            search: urlParams.search || '',
            options: urlParams.options || {},
            priceRange: urlParams.priceRange || null
          };
          Log.info('Filters set from URL', { filters: State.filters });
        }
        if (urlParams.page) State.pagination.page = urlParams.page;
        
        DOM.renderFilters(State.availableFilters);
        Log.info('Filters rendered', { count: State.availableFilters.length });
        
        Log.info('Loading products...', { filters: State.filters, pagination: State.pagination });
        const productsData = await API.products(State.filters, State.pagination, State.sort);
        Log.info('Products loaded', { count: productsData.products?.length || 0, total: productsData.pagination?.total || 0 });
        
        State.products = productsData.products || [];
        State.pagination = productsData.pagination || State.pagination;
        
        // Fetch updated filters after products (will hit cache created by products request)
        try {
          const updatedFiltersData = await API.filters(State.filters);
          if (Array.isArray(updatedFiltersData.filters)) {
            State.availableFilters = updatedFiltersData.filters;
            State.optionMap = Maps.buildOptionMap(State.availableFilters);
            State.handleMap = Maps.buildHandleMap(State.availableFilters);
            DOM.renderFilters(State.availableFilters);
          }
        } catch (e) {
          Log.warn('Failed to fetch updated filters', { error: e.message });
          // Continue with existing filters if update fails
        }
        
        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total || 0);
        DOM.hideLoading();
        
        if (State.products.length === 0 && State.availableFilters.length === 0) {
          DOM.showError('No products or filters found. Please check your configuration.');
        }
      } catch (e) {
        DOM.hideLoading();
        Log.error('Load failed', { error: e.message, stack: e.stack, shop: State.shop, apiBaseURL: API.baseURL });
        DOM.showError(`Failed to load: ${e.message || 'Unknown error'}. Check console for details.`);
      }
    },
    
    Logger: Log
  };

  // Export
  if (typeof window !== 'undefined') window.AFS = AFS;
  else if (typeof global !== 'undefined') global.AFS = AFS;

})(typeof window !== 'undefined' ? window : this);

