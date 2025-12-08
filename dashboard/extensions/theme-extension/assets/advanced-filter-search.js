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
    // Build handle->option map from filterConfig
    buildHandleMap: (config) => {
      const m = new Map();
      if (!config?.options) return m;
      config.options.forEach(opt => {
        if (opt.handle && opt.status === 'published') {
          m.set(opt.handle, opt.variantOptionKey || opt.optionType || opt.handle);
        }
      });
      return m;
    },
    
    // Build handle->filter map from availableFilters
    buildFilterMap: (filters) => {
      const m = new Map();
      if (!Array.isArray(filters)) return m;
      filters.forEach(f => {
        if (f.type === 'option' && f.handle) {
          m.set(f.handle, f.queryKey || f.optionKey || f.handle);
        }
      });
      return m;
    },
    
    // Build option->handle map
    buildOptionMap: (filters) => {
      const m = new Map();
      if (!Array.isArray(filters)) return m;
      filters.forEach(f => {
        if (f.type === 'option') {
          const key = $.str(f.queryKey || f.optionKey || f.label || f.handle).toLowerCase();
          const handle = $.str(f.handle || f.queryKey || f.optionKey || f.label);
          if (key && handle) m.set(key, handle);
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
    filters: { vendor: [], productType: [], tags: [], collections: [], options: {}, search: '' },
    products: [],
    pagination: { page: 1, limit: C.PAGE_SIZE, total: 0, totalPages: 0 },
    sort: { field: 'createdAt', order: 'desc' },
    loading: false,
    availableFilters: [],
    filterConfig: null,
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
    parse(filterConfig = null) {
      const url = new URL(window.location);
      const params = {};
      const handleMap = Maps.buildHandleMap(filterConfig);
      const filterMap = Maps.buildFilterMap(State.availableFilters);
      
      // Build reverse map: handle -> optionName from availableFilters for O(1) lookup
      const handleToOptionMap = new Map();
      if (Array.isArray(State.availableFilters)) {
        State.availableFilters.forEach(f => {
          if (f.type === 'option' && f.handle) {
            const optionName = f.queryKey || f.optionKey || f.handle;
            handleToOptionMap.set(f.handle, optionName);
            Log.debug('Handle mapping', { handle: f.handle, optionName, queryKey: f.queryKey, optionKey: f.optionKey });
          }
        });
      }
      
      Log.debug('Handle maps built', { 
        handleToOptionMapSize: handleToOptionMap.size,
        handleMapSize: handleMap.size,
        filterMapSize: filterMap.size,
        availableFiltersCount: State.availableFilters?.length || 0
      });
      
      url.searchParams.forEach((value, key) => {
        if (key === 'shop' || key === 'shop_domain' || key === 'preserveFilters') return;
        
        if (key === 'vendor' || key === 'vendors') params.vendor = $.split(value);
        else if (key === 'productType' || key === 'productTypes') params.productType = $.split(value);
        else if (key === 'tag' || key === 'tags') params.tags = $.split(value);
        else if (key === 'collection' || key === 'collections') params.collections = $.split(value);
        else if (key === 'search') params.search = value;
        else if (key === 'page') params.page = parseInt(value, 10) || 1;
        else if (key === 'limit') params.limit = parseInt(value, 10) || C.PAGE_SIZE;
        else if (key === 'sort') {
          const [field, order] = value.split(':');
          params.sort = { field, order: order || 'desc' };
        }
        else {
          // Check if key is a handle - try to find matching filter by handle
          // Handles are used directly as URL param keys (e.g., ef4gd=red, not options[color]=red)
          const optionName = handleToOptionMap.get(key) || handleMap.get(key) || filterMap.get(key);
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
      const handleMap = State.handleMap;
      const optionMap = State.optionMap;
      
      if (filters && !$.empty(filters)) {
        Object.keys(filters).forEach(key => {
          const value = filters[key];
          if ($.empty(value)) return;
          
          if (Array.isArray(value) && value.length > 0) {
            url.searchParams.set(key, value.join(','));
          }
          else if (key === 'options' && typeof value === 'object') {
            Object.keys(value).forEach(optKey => {
              const optValues = value[optKey];
              if (!$.empty(optValues) && Array.isArray(optValues) && optValues.length > 0) {
                const handle = optionMap.get(optKey.toLowerCase()) || optKey;
                url.searchParams.set(handle, optValues.join(','));
              }
            });
          }
          else if (key === 'search' && typeof value === 'string' && value.trim()) {
            url.searchParams.set(key, value.trim());
          }
        });
      }
      
      if (pagination && pagination.page > 1) url.searchParams.set('page', pagination.page);
      
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
          hasFilters: !!data.filters,
          hasConfig: !!data.filterConfig
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
      
      const validFilters = filters.filter(f => f && f.values?.length > 0 && f.type !== 'priceRange' && f.type !== 'variantPriceRange');
      Log.debug('Rendering filters', { total: filters.length, valid: validFilters.length });
      
      if (validFilters.length === 0) {
        Log.warn('No valid filters to render');
        return;
      }
      
      const fragment = document.createDocumentFragment();
      
      validFilters.forEach(filter => {
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
      const displayLabel = typeof item === 'string' 
        ? item 
        : (item.label || item.value || value);
      
      const label = $.el('label', 'afs-filter-item', {
        'data-afs-filter-type': type,
        'data-afs-filter-value': value // Store original value for filtering
      });
      if (optionName) label.setAttribute('data-afs-option-name', optionName);
      
      const cb = $.el('input', 'afs-filter-item__checkbox', { type: 'checkbox' });
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
      const selector = optionName 
        ? `.afs-filter-item[data-afs-filter-type="${type}"][data-afs-option-name="${optionName}"][data-afs-filter-value="${value}"]`
        : `.afs-filter-item[data-afs-filter-type="${type}"][data-afs-filter-value="${value}"]`;
      
      const item = this.filtersContainer?.querySelector(selector);
      if (item) {
        const cb = item.querySelector('.afs-filter-item__checkbox');
        if (cb) cb.checked = active;
        item.classList.toggle('afs-filter-item--active', active);
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
      const current = State.filters[type] || [];
      const newValues = current.includes(value) 
        ? current.filter(v => v !== value)
        : [...current, value];
      
      State.filters[type] = newValues;
      State.pagination.page = 1;
      
      UrlManager.update(State.filters, State.pagination, State.sort);
      DOM.updateFilterState(type, value, newValues.includes(value));
      this.apply();
    },
    
    toggleOption(name, value) {
      const normalized = $.str(value);
      if (!normalized) return;
      
      const current = State.filters.options[name] || [];
      const newValues = current.includes(normalized)
        ? current.filter(v => v !== normalized)
        : [...current, normalized];
      
      if (newValues.length === 0) delete State.filters.options[name];
      else State.filters.options[name] = newValues;
      
      State.pagination.page = 1;
      UrlManager.update(State.filters, State.pagination, State.sort);
      DOM.updateFilterState('options', normalized, newValues.includes(normalized), name);
      this.apply();
    },
    
    apply: $.debounce(async () => {
      DOM.showLoading();
      try {
        const data = await API.products(State.filters, State.pagination, State.sort);
        State.products = data.products || [];
        State.pagination = data.pagination || State.pagination;
        
        // Update filterConfig if provided
        if (data.filterConfig !== undefined) {
          State.filterConfig = data.filterConfig;
        }
        
        // Fetch updated filters after products (will hit cache created by products request)
        try {
          const updatedFiltersData = await API.filters(State.filters);
          if (Array.isArray(updatedFiltersData.filters)) {
            State.availableFilters = updatedFiltersData.filters;
            if (updatedFiltersData.filterConfig !== undefined) {
              State.filterConfig = updatedFiltersData.filterConfig;
            }
            State.optionMap = Maps.buildOptionMap(State.availableFilters);
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
          State.filters = { vendor: [], productType: [], tags: [], collections: [], options: {}, search: '' };
          State.pagination.page = 1;
          UrlManager.update(State.filters, State.pagination, State.sort);
          Filters.apply();
        }
        else if (checkbox && item) {
          const type = item.getAttribute('data-afs-filter-type');
          const value = item.getAttribute('data-afs-filter-value');
          const optionName = item.getAttribute('data-afs-option-name');
          
          if (type === 'options' && optionName) Filters.toggleOption(optionName, value);
          else if (type) Filters.toggle(type, value);
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
        const params = UrlManager.parse(State.filterConfig);
        if (params.vendor || params.productType || params.tags || params.collections || params.search || params.options) {
          State.filters = {
            vendor: params.vendor || [],
            productType: params.productType || [],
            tags: params.tags || [],
            collections: params.collections || [],
            search: params.search || '',
            options: params.options || {}
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
        Log.info('Shop set', { shop: State.shop });
        
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
        Log.info('Filters loaded', { filtersCount: filtersData.filters?.length || 0, hasConfig: !!filtersData.filterConfig });
        
        // Validate filters is an array
        if (!Array.isArray(filtersData.filters)) {
          Log.error('Invalid filters response: filters is not an array', { filters: filtersData.filters });
          filtersData.filters = [];
        }
        
        State.availableFilters = filtersData.filters || [];
        State.filterConfig = filtersData.filterConfig || null;
        State.optionMap = Maps.buildOptionMap(State.availableFilters);
        State.handleMap = Maps.buildHandleMap(State.filterConfig);
        
        // Parse URL params AFTER filters are loaded (so we can map handles to option names)
        const urlParams = UrlManager.parse(State.filterConfig);
        Log.debug('Parsed URL params', { urlParams, availableFiltersCount: State.availableFilters.length });
        
        if (urlParams.vendor || urlParams.productType || urlParams.tags || urlParams.collections || urlParams.search || urlParams.options) {
          State.filters = {
            vendor: urlParams.vendor || [],
            productType: urlParams.productType || [],
            tags: urlParams.tags || [],
            collections: urlParams.collections || [],
            search: urlParams.search || '',
            options: urlParams.options || {}
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
        
        // Update filterConfig if provided (products endpoint may have updated it)
        if (productsData.filterConfig !== undefined) {
          State.filterConfig = productsData.filterConfig;
        }
        
        // Fetch updated filters after products (will hit cache created by products request)
        try {
          const updatedFiltersData = await API.filters(State.filters);
          if (Array.isArray(updatedFiltersData.filters)) {
            State.availableFilters = updatedFiltersData.filters;
            if (updatedFiltersData.filterConfig !== undefined) {
              State.filterConfig = updatedFiltersData.filterConfig;
            }
            State.optionMap = Maps.buildOptionMap(State.availableFilters);
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

