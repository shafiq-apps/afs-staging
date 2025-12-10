/**
 * Advanced Filter Search
 * 
 * Describe hardcoded values and their means and functionality
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

  // Excluded query parameter keys (not processed as filters)
  // Note: preserveFilter/preserveFilters is excluded from filter processing but will be parsed separately
  const EXCLUDED_QUERY_PARAMS = new Set(['shop', 'shop_domain', 'preserveFilter', 'preserveFilters', 'cpid']);

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
    selectedCollection: {id: null, sortBy: null},
    pagination: { page: 1, limit: C.PAGE_SIZE, total: 0, totalPages: 0 },
    sort: { field: 'best-selling', order: 'asc' },
    loading: false,
    availableFilters: [],
    // Metadata maps (for display only, not for state management)
    filterMetadata: new Map(), // handle -> { label, type, queryKey, optionKey }
    // Preserve filter keys for maintaining filter aggregations
    preserveFilters: null // null, array of strings, or '__all__'
  };

  // ============================================================================
  // LOGGER (Minimal, production-safe)
  // ============================================================================
  
  const Log = {
    enabled: true, // Always enabled for debugging
    error: (msg, data) => Log.enabled? console.error('[AFS]', msg, data || ''): () => {},
    warn: (msg, data) => Log.enabled? console.warn('[AFS]', msg, data || ''): () => {},
    info: (msg, data) => Log.enabled? console.info('[AFS]', msg, data || ''): () => {},
    debug: (msg, data) => Log.enabled? console.debug('[AFS]', msg, data || ''): () => {},
  };

  // ============================================================================
  // URL PARSER (Optimized with lookup maps)
  // ============================================================================
  
  const UrlManager = {
    parse() {
      const url = new URL(window.location);
      const params = {};
      
      // Standard filter keys (fixed)
      const STANDARD_FILTERS = new Set(['vendor', 'vendors', 'productType', 'productTypes', 'tag', 'tags', 'collection', 'collections', 'search', 'priceRange', 'price', 'page', 'limit', 'sort']);
      
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
          // Handle sort parameter - can be "best-selling", "price:asc", "createdAt:desc", etc.
          const sortValue = value.toLowerCase().trim();
          if (sortValue === 'best-selling' || sortValue === 'bestselling') {
            params.sort = { field: 'best-selling', order: 'asc' };
          } else {
            const [field, order] = value.split(':');
            params.sort = { field, order: order || 'desc' };
          }
        }
        else if (key === 'preserveFilter' || key === 'preserveFilters') {
          // Parse preserveFilter/preserveFilters - can be comma-separated string or '__all__'
          const preserveValue = $.str(value);
          if (preserveValue === '__all__') {
            params.preserveFilters = '__all__';
          } else {
            params.preserveFilters = $.split(value);
          }
          Log.debug('Preserve filters parsed', { preserveFilters: params.preserveFilters });
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
          url.searchParams.set('sort', `${sort.field}:${sort.order || 'desc'}`);
        }
        Log.debug('Sort URL param set', { field: sort.field, order: sort.order });
      }
      
      // Update preserveFilters parameter
      if (State.preserveFilters !== null && State.preserveFilters !== undefined) {
        if (State.preserveFilters === '__all__') {
          url.searchParams.set('preserveFilters', '__all__');
        } else if (Array.isArray(State.preserveFilters) && State.preserveFilters.length > 0) {
          url.searchParams.set('preserveFilters', State.preserveFilters.join(','));
        }
        Log.debug('Preserve filters URL param set', { preserveFilters: State.preserveFilters });
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
      
      // The ID of the collection page the user is viewing.
      // Example: if the user navigates to the Jeans collection,
      // only products from that collection should be shown.
      if(State.selectedCollection.id) {
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
          params.set('sort', `${sort.field}:${sort.order}`);
        }
      }
      
      // Add preserveFilters parameter if set
      if (State.preserveFilters !== null && State.preserveFilters !== undefined) {
        if (State.preserveFilters === '__all__') {
          params.set('preserveFilters', '__all__');
        } else if (Array.isArray(State.preserveFilters) && State.preserveFilters.length > 0) {
          params.set('preserveFilters', State.preserveFilters.join(','));
        }
        Log.debug('Preserve filters sent to products API', { preserveFilters: State.preserveFilters });
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
      if(State.selectedCollection.id) {
        params.set('cpid', State.selectedCollection.id);
      }
      Object.keys(filters).forEach(k => {
        const v = filters[k];
        if (!$.empty(v) && Array.isArray(v)) params.set(k, v.join(','));
      });
      
      // Add preserveFilters parameter if set
      if (State.preserveFilters !== null && State.preserveFilters !== undefined) {
        if (State.preserveFilters === '__all__') {
          params.set('preserveFilters', '__all__');
        } else if (Array.isArray(State.preserveFilters) && State.preserveFilters.length > 0) {
          params.set('preserveFilters', State.preserveFilters.join(','));
        }
        Log.debug('Preserve filters sent to filters API', { preserveFilters: State.preserveFilters });
      }
      
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
      
      this.productsContainer = document.querySelector(productsSel) || $.el('div', 'afs-products-container');
      if (!this.productsContainer.parentNode) main.appendChild(this.productsContainer);
      
      this.productsInfo = $.el('div', 'afs-products-info');
      this.productsContainer.insertBefore(this.productsInfo, this.productsContainer.firstChild);
      
      // Sort dropdown - create and store reference
      this.sortContainer = $.el('div', 'afs-sort-container');
      const sortLabel = $.el('label', 'afs-sort-label');
      sortLabel.textContent = 'Sort by: ';
      this.sortSelect = $.el('select', 'afs-sort-select', { 'data-afs-sort': 'true' });
      this.sortSelect.innerHTML = `
        <option value="best-selling">Best Selling</option>
        <option value="createdAt:desc">Newest First</option>
        <option value="createdAt:asc">Oldest First</option>
        <option value="title:asc">Name (A-Z)</option>
        <option value="title:desc">Name (Z-A)</option>
        <option value="price:asc">Price (Low to High)</option>
        <option value="price:desc">Price (High to Low)</option>
      `;
      this.sortContainer.appendChild(sortLabel);
      this.sortContainer.appendChild(this.sortSelect);
      this.productsInfo.appendChild(this.sortContainer);
      
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
        icon.textContent = collapsed ? '▶' : '▼';
        toggle.appendChild(icon);
        toggle.appendChild($.txt($.el('label', 'afs-filter-group__label'), filter.label || handle));
        header.appendChild(toggle);
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
        Log.debug('Filters rendered', { count: fragment.children.length });
      } else {
        Log.warn('No filter groups created');
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
        'data-afs-filter-value': value     // Store original value for filtering
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
      icon.textContent = collapsed ? '▶' : '▼';
      toggle.appendChild(icon);
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
          if (price && product.priceRange) {
            const min = product.priceRange.minVariantPrice?.amount || '0';
            const max = product.priceRange.maxVariantPrice?.amount || '0';
            const priceText = min === max ? `$${parseFloat(min).toFixed(2)}` : `$${parseFloat(min).toFixed(2)} - $${parseFloat(max).toFixed(2)}`;
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
      if (!this.productsGrid || !pagination || pagination.totalPages <= 1) return;
      
      // Remove existing pagination
      const existing = this.productsGrid.parentNode?.querySelector('.afs-pagination');
      if (existing) existing.remove();
      
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
            const label = metadata?.label || key;
            activeFilters.push({ handle: key, label: `${label}: ${v}`, value: v });
          });
        }
      });
      
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
      this.apply();
    },
    
    // Apply products only (for sort/pagination changes - no filter update needed)
    applyProductsOnly: $.debounce(async () => {
      Log.info('applyProductsOnly called', { filters: State.filters, pagination: State.pagination, sort: State.sort });
      // Scroll to top when products are being fetched
      DOM.scrollToProducts();
      DOM.showLoading();
      try {
        Log.info('Fetching products...', { url: `${API.baseURL}/storefront/products` });
        const data = await API.products(State.filters, State.pagination, State.sort);
        Log.info('Products fetched successfully', { count: data.products?.length || 0 });
        State.products = data.products || [];
        State.pagination = data.pagination || State.pagination;
        
        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total || 0);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);
        DOM.hideLoading();
      } catch (e) {
        DOM.hideLoading();
        Log.error('Failed to load products', e);
        DOM.showError(`Failed to load products: ${e.message || 'Unknown error'}`);
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
          // Reset to initial state (standard filters only, handles will be removed dynamically)
          State.filters = { vendor: [], productType: [], tags: [], collections: [], search: '', priceRange: null };
          State.pagination.page = 1;
          UrlManager.update(State.filters, State.pagination, State.sort);
          // Scroll to top when clearing all filters
          DOM.scrollToProducts();
          Filters.apply();
        }
        else if (e.target.closest('.afs-applied-filter-chip__remove')) {
          const chip = e.target.closest('.afs-applied-filter-chip');
          const key = chip.querySelector('.afs-applied-filter-chip__remove')?.getAttribute('data-afs-filter-key');
          const value = chip.querySelector('.afs-applied-filter-chip__remove')?.getAttribute('data-afs-filter-value');
          if (key && value) {
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
          if (page) {
            State.pagination.page = page;
            UrlManager.update(State.filters, State.pagination, State.sort);
            // Scroll to top when pagination changes
            DOM.scrollToProducts();
            // Only fetch products, not filters (filters haven't changed)
            Filters.applyProductsOnly();
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
            icon.textContent = collapsedState ? '▶' : '▼';
          }
          
          // Content visibility is handled by CSS via data-afs-collapsed attribute
          Log.debug('Filter group toggled', { collapsed: collapsedState });
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
        let newSort;
        if (sortValue === 'best-selling' || sortValue === 'bestselling') {
          newSort = { field: 'best-selling', order: 'asc' };
        } else {
          const [field, order] = sortValue.split(':');
          newSort = { field, order: order || 'desc' };
        }
        
        // Always update state and call API when sort is selected
        // (even if value is same, user explicitly selected it)
        State.sort = newSort;
        State.pagination.page = 1;
        UrlManager.update(State.filters, State.pagination, State.sort);
        Log.info('Calling applyProductsOnly after sort change', { sort: State.sort });
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
              const currentSortValue = State.sort.field === 'best-selling' || State.sort.field === 'bestselling' 
                ? 'best-selling' 
                : `${State.sort.field}:${State.sort.order}`;
              
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
        
        // Set preserveFilters from URL params
        if (params.preserveFilters !== undefined) {
          if (params.preserveFilters === '__all__') {
            State.preserveFilters = '__all__';
          } else if (Array.isArray(params.preserveFilters) && params.preserveFilters.length > 0) {
            State.preserveFilters = params.preserveFilters;
          } else {
            State.preserveFilters = null;
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
          if (!['vendor', 'productType', 'tags', 'collections', 'search', 'priceRange', 'page', 'limit', 'sort', 'preserveFilters'].includes(key)) {
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
            } else {
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
        
        // Initialize preserveFilters from config if provided
        if (config.preserveFilters !== undefined) {
          if (config.preserveFilters === '__all__' || config.preserveFilters === '__ALL__') {
            State.preserveFilters = '__all__';
          } else if (Array.isArray(config.preserveFilters) && config.preserveFilters.length > 0) {
            State.preserveFilters = config.preserveFilters;
          } else if (typeof config.preserveFilters === 'string' && config.preserveFilters.trim()) {
            State.preserveFilters = $.split(config.preserveFilters);
          } else {
            State.preserveFilters = null;
          }
          Log.info('Preserve filters set from config', { preserveFilters: State.preserveFilters });
        }

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
        Log.enabled = true;
        Log.info('Filters loaded', { filtersCount: filtersData.filters || 0 });
        
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
        
        // Set preserveFilters from URL params
        if (urlParams.preserveFilters !== undefined) {
          if (urlParams.preserveFilters === '__all__') {
            State.preserveFilters = '__all__';
          } else if (Array.isArray(urlParams.preserveFilters) && urlParams.preserveFilters.length > 0) {
            State.preserveFilters = urlParams.preserveFilters;
          } else {
            State.preserveFilters = null;
          }
          Log.debug('Preserve filters set from URL', { preserveFilters: State.preserveFilters });
        } else {
          State.preserveFilters = null;
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
          if (!['vendor', 'productType', 'tags', 'collections', 'search', 'priceRange', 'page', 'limit', 'sort', 'preserveFilters'].includes(key)) {
            if (Array.isArray(urlParams[key])) {
              State.filters[key] = urlParams[key];
            } else if (typeof urlParams[key] === 'string') {
              State.filters[key] = [urlParams[key]];
            }
          }
        });
        Log.info('Filters set from URL', { filters: State.filters });
        if (urlParams.page) State.pagination.page = urlParams.page;
        
        // Set sort from URL params or default to best-selling
        if (urlParams.sort) {
          const sortValue = urlParams.sort.field || urlParams.sort;
          if (typeof sortValue === 'string') {
            const normalized = sortValue.toLowerCase().trim();
            if (normalized === 'best-selling' || normalized === 'bestselling') {
              State.sort = { field: 'best-selling', order: 'asc' };
            } else {
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
        
        State.products = productsData.products || [];
        State.pagination = productsData.pagination || State.pagination;
        
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
            DOM.sortSelect.value = `${State.sort.field}:${State.sort.order}`;
          }
          Log.debug('Sort select value updated programmatically', { value: DOM.sortSelect.value, sort: State.sort });
        }
        
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

