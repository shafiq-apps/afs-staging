/**
 * Advanced Filter Search - UI Module
 * DOM Renderer, Filter Manager, and Event Handlers
 */
(function(global) {
  'use strict';
  
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  const Logger = global.AFS?.Logger || {};
  const Utils = global.AFS?.Utils || {};
  const StateManager = global.AFS?.StateManager || {};
  const FilterConfigIndex = global.AFS?.FilterConfigIndex || {};
  const URLManager = global.AFS?.URLManager || {};
  
  // ============================================================================
  // DOM RENDERER
  // ============================================================================
  const DOMRenderer = {
    filtersContainer: null,
    productsContainer: null,
    domCache: new Map(),
    
    init(container, filtersContainer, productsContainer) {
      // If containers are already DOM elements, use them directly
      // Otherwise, try to find them within the container or globally
      if (filtersContainer && filtersContainer.nodeType === 1) {
        this.filtersContainer = filtersContainer;
      } else if (container && container.querySelector) {
        this.filtersContainer = typeof filtersContainer === 'string'
          ? container.querySelector(filtersContainer)
          : (container.querySelector('.afs-filters-container') || document.querySelector(filtersContainer || '.afs-filters-container'));
      } else {
        this.filtersContainer = typeof filtersContainer === 'string'
          ? document.querySelector(filtersContainer)
          : filtersContainer;
      }
      
      if (productsContainer && productsContainer.nodeType === 1) {
        this.productsContainer = productsContainer;
      } else if (container && container.querySelector) {
        this.productsContainer = typeof productsContainer === 'string'
          ? container.querySelector(productsContainer)
          : (container.querySelector('.afs-products-container') || document.querySelector(productsContainer || '.afs-products-container'));
      } else {
        this.productsContainer = typeof productsContainer === 'string'
          ? document.querySelector(productsContainer)
          : productsContainer;
      }
      
      if (!this.filtersContainer) {
        Logger.warn('Filters container not found', { selector: filtersContainer, container: container });
      }
      if (!this.productsContainer) {
        Logger.warn('Products container not found', { selector: productsContainer, container: container });
      }
    },
    
    getCachedElement(selector) {
      if (this.domCache.has(selector)) {
        const cached = this.domCache.get(selector);
        if (document.contains(cached)) {
          return cached;
        }
        this.domCache.delete(selector);
      }
      const element = document.querySelector(selector);
      if (element) {
        this.domCache.set(selector, element);
      }
      return element;
    },
    
    clearCache() {
      this.domCache.clear();
    },
    
    renderFilters(aggregations, filterConfig) {
      if (!this.filtersContainer) {
        Logger.error('Filters container not initialized');
        return;
      }
      const startTime = performance.now();
      try {
        if (!aggregations || (typeof aggregations === 'object' && Object.keys(aggregations).length === 0)) {
          this.filtersContainer.innerHTML = '<p class="afs-no-filters">No filters available</p>';
          Logger.debug('No filters to render');
          return;
        }
        if (filterConfig) {
          FilterConfigIndex.buildIndex(filterConfig);
        }
        const filtersHTML = this.buildFiltersHTML(aggregations, filterConfig);
        this.filtersContainer.innerHTML = filtersHTML;
        const duration = performance.now() - startTime;
        Logger.performance('Render filters', duration);
        if (duration > CONSTANTS.PERFORMANCE_TARGET_RENDER) {
          Logger.warn('Filter rendering exceeded target', { duration });
        }
      } catch (error) {
        Logger.error('Failed to render filters', {
          error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
        });
        this.filtersContainer.innerHTML = '<p class="afs-error">Error loading filters</p>';
      }
    },
    
    buildFiltersHTML(aggregations, filterConfig) {
      if (!aggregations || (typeof aggregations === 'object' && Object.keys(aggregations).length === 0)) {
        return '<p class="afs-no-filters">No filters available</p>';
      }
      let html = '<div class="afs-filters">';
      const filterEntries = Array.isArray(aggregations) ? aggregations : Object.entries(aggregations);
      filterEntries.forEach((entry, index) => {
        const [key, value] = Array.isArray(entry) ? entry : [index, entry];
        const filterKey = typeof key === 'string' ? key : `filter_${index}`;
        const filterData = typeof value === 'object' && value !== null ? value : { values: [] };
        const filterValues = Array.isArray(filterData.values) ? filterData.values : [];
        if (filterValues.length === 0) return;
        const filterLabel = filterData.label || filterKey;
        const filterHandle = filterData.handle || filterKey;
        html += `<div class="afs-filter-group" data-filter-key="${Utils.sanitizeHTML(filterHandle)}">`;
        html += `<h3 class="afs-filter-title">${Utils.sanitizeHTML(filterLabel)}</h3>`;
        html += '<div class="afs-filter-options">';
        filterValues.forEach(option => {
          const optionValue = typeof option === 'object' && option !== null 
            ? (option.value || option.handle || option.name || '')
            : String(option);
          const optionLabel = typeof option === 'object' && option !== null
            ? (option.label || option.name || optionValue)
            : optionValue;
          const optionHandle = typeof option === 'object' && option !== null
            ? (option.handle || option.optionId || optionValue)
            : optionValue;
          const optionCount = typeof option === 'object' && option !== null
            ? (option.count || 0)
            : 0;
          const isActive = this.isFilterActive(filterHandle, optionHandle);
          html += `<label class="afs-filter-option ${isActive ? 'active' : ''}">`;
          html += `<input type="checkbox" value="${Utils.sanitizeHTML(optionHandle)}" ${isActive ? 'checked' : ''} data-filter-key="${Utils.sanitizeHTML(filterHandle)}">`;
          html += `<span class="afs-filter-option-label">${Utils.sanitizeHTML(optionLabel)}</span>`;
          if (optionCount > 0) {
            html += `<span class="afs-filter-option-count">(${optionCount})</span>`;
          }
          html += '</label>';
        });
        html += '</div></div>';
      });
      html += '</div>';
      return html;
    },
    
    isFilterActive(filterKey, optionHandle) {
      const state = StateManager.getState ? StateManager.getState() : {};
      const filters = state.filters || {};
      const filterValues = filters[filterKey];
      if (!filterValues) return false;
      if (Array.isArray(filterValues)) {
        return filterValues.includes(optionHandle);
      }
      return filterValues === optionHandle;
    },
    
    renderProducts(products, pagination) {
      if (!this.productsContainer) {
        Logger.error('Products container not initialized');
        return;
      }
      const startTime = performance.now();
      try {
        if (!products || products.length === 0) {
          this.productsContainer.innerHTML = '<p class="afs-no-products">No products found</p>';
          Logger.debug('No products to render');
          return;
        }
        const productsHTML = this.buildProductsHTML(products);
        this.productsContainer.innerHTML = productsHTML;
        if (pagination) {
          this.renderPagination(pagination);
        }
        const duration = performance.now() - startTime;
        Logger.performance('Render products', duration);
        if (duration > CONSTANTS.PERFORMANCE_TARGET_RENDER) {
          Logger.warn('Product rendering exceeded target', { duration });
        }
      } catch (error) {
        Logger.error('Failed to render products', {
          error: Utils.sanitizeErrorMessage ? Utils.sanitizeErrorMessage(error) : error.message
        });
        this.productsContainer.innerHTML = '<p class="afs-error">Error loading products</p>';
      }
    },
    
    buildProductsHTML(products) {
      if (!products || products.length === 0) {
        return '<p class="afs-no-products">No products found</p>';
      }
      let html = '<div class="afs-products-grid">';
      products.forEach(product => {
        if (!product || typeof product !== 'object') return;
        const title = product.title || product.name || 'Untitled Product';
        const handle = product.handle || '';
        const imageUrl = product.image || product.featuredImage || product.imageUrl || '';
        const price = product.price || product.priceFormatted || '';
        const compareAtPrice = product.compareAtPrice || product.compareAtPriceFormatted || '';
        const url = product.url || `/products/${handle}`;
        html += '<div class="afs-product-card">';
        if (imageUrl) {
          html += `<a href="${Utils.sanitizeHTML(url)}" class="afs-product-image-link">`;
          html += `<img src="${Utils.sanitizeHTML(imageUrl)}" alt="${Utils.sanitizeHTML(title)}" class="afs-product-image" loading="lazy">`;
          html += '</a>';
        }
        html += `<a href="${Utils.sanitizeHTML(url)}" class="afs-product-title-link">`;
        html += `<h3 class="afs-product-title">${Utils.sanitizeHTML(title)}</h3>`;
        html += '</a>';
        html += '<div class="afs-product-price">';
        if (compareAtPrice && compareAtPrice !== price) {
          html += `<span class="afs-product-compare-price">${Utils.sanitizeHTML(compareAtPrice)}</span>`;
        }
        html += `<span class="afs-product-current-price">${Utils.sanitizeHTML(price)}</span>`;
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
      return html;
    },
    
    renderPagination(pagination) {
      if (!pagination || !this.productsContainer) return;
      const currentPage = pagination.page || 1;
      const totalPages = Math.ceil((pagination.total || 0) / (pagination.limit || CONSTANTS.DEFAULT_PAGE_SIZE));
      if (totalPages <= 1) return;
      let html = '<div class="afs-pagination">';
      if (currentPage > 1) {
        html += `<button class="afs-pagination-btn" data-page="${currentPage - 1}">Previous</button>`;
      }
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
          html += `<button class="afs-pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
          html += '<span class="afs-pagination-ellipsis">...</span>';
        }
      }
      if (currentPage < totalPages) {
        html += `<button class="afs-pagination-btn" data-page="${currentPage + 1}">Next</button>`;
      }
      html += '</div>';
      const existingPagination = this.productsContainer.querySelector('.afs-pagination');
      if (existingPagination) {
        existingPagination.outerHTML = html;
      } else {
        this.productsContainer.insertAdjacentHTML('beforeend', html);
      }
    },
    
    renderLoading(container = null) {
      const targetContainer = container || this.productsContainer;
      if (!targetContainer) return;
      targetContainer.innerHTML = '<div class="afs-loading">Loading...</div>';
    },
    
    renderError(message, container = null) {
      const targetContainer = container || this.productsContainer;
      if (!targetContainer) return;
      const sanitizedMessage = Utils.sanitizeHTML ? Utils.sanitizeHTML(message) : message;
      targetContainer.innerHTML = `<div class="afs-error">${sanitizedMessage}</div>`;
    }
  };
  
  // ============================================================================
  // FILTER MANAGER
  // ============================================================================
  const FilterManager = {
    applyFilters() {
      const state = StateManager.getState ? StateManager.getState() : {};
      const filters = state.filters || {};
      Logger.debug('Applying filters', { filters });
      const normalizedFilters = this.normalizeFilters(filters);
      if (StateManager.updateFilters) {
        StateManager.updateFilters(normalizedFilters);
      }
      return normalizedFilters;
    },
    
    normalizeFilters(filters) {
      if (!filters || typeof filters !== 'object') return {};
      const normalized = {};
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value === null || value === undefined || value === '') {
          return;
        }
        if (Array.isArray(value)) {
          const filtered = value.filter(v => v !== null && v !== undefined && v !== '');
          if (filtered.length > 0) {
            normalized[key] = filtered;
          }
        } else {
          normalized[key] = value;
        }
      });
      return normalized;
    },
    
    getFilterValue(filterKey) {
      const state = StateManager.getState ? StateManager.getState() : {};
      const filters = state.filters || {};
      return filters[filterKey] || null;
    },
    
    setFilterValue(filterKey, value) {
      const state = StateManager.getState ? StateManager.getState() : {};
      const filters = { ...(state.filters || {}) };
      if (value === null || value === undefined || value === '' || 
          (Array.isArray(value) && value.length === 0)) {
        delete filters[filterKey];
      } else {
        filters[filterKey] = value;
      }
      if (StateManager.updateFilters) {
        StateManager.updateFilters(filters);
      }
      return filters;
    },
    
    toggleFilterOption(filterKey, optionHandle) {
      const currentValue = this.getFilterValue(filterKey);
      let newValue;
      if (Array.isArray(currentValue)) {
        const index = currentValue.indexOf(optionHandle);
        if (index >= 0) {
          newValue = currentValue.filter(v => v !== optionHandle);
          if (newValue.length === 0) {
            newValue = null;
          }
        } else {
          newValue = [...currentValue, optionHandle];
        }
      } else if (currentValue === optionHandle) {
        newValue = null;
      } else {
        newValue = [optionHandle];
      }
      return this.setFilterValue(filterKey, newValue);
    },
    
    clearFilters() {
      if (StateManager.updateFilters) {
        StateManager.updateFilters({});
      }
      Logger.debug('Filters cleared');
    },
    
    getActiveFilters() {
      const state = StateManager.getState ? StateManager.getState() : {};
      const filters = state.filters || {};
      const active = {};
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== null && value !== undefined && value !== '' &&
            !(Array.isArray(value) && value.length === 0)) {
          active[key] = value;
        }
      });
      return active;
    },
    
    hasActiveFilters() {
      const active = this.getActiveFilters();
      return Object.keys(active).length > 0;
    }
  };
  
  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  const EventHandlers = {
    debouncedFilterChange: null,
    debouncedSearch: null,
    
    init() {
      this.debouncedFilterChange = Utils.debounce 
        ? Utils.debounce(this.handleFilterChange.bind(this), CONSTANTS.DEFAULT_DEBOUNCE_FILTERS)
        : this.handleFilterChange.bind(this);
      this.debouncedSearch = Utils.debounce
        ? Utils.debounce(this.handleSearch.bind(this), CONSTANTS.DEFAULT_DEBOUNCE_SEARCH)
        : this.handleSearch.bind(this);
      this.attachEventListeners();
    },
    
    attachEventListeners() {
      document.addEventListener('change', (e) => {
        if (e.target.matches && e.target.matches('.afs-filter-option input[type="checkbox"]')) {
          this.debouncedFilterChange(e);
        }
      });
      
      document.addEventListener('click', (e) => {
        if (e.target.matches && e.target.matches('.afs-pagination-btn')) {
          e.preventDefault();
          const page = parseInt(e.target.getAttribute('data-page'), 10);
          if (!isNaN(page)) {
            this.handlePagination(page);
          }
        }
      });
      
      const searchInput = document.querySelector('.afs-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.debouncedSearch(e.target.value);
        });
      }
    },
    
    handleFilterChange(e) {
      const checkbox = e.target;
      const filterKey = checkbox.getAttribute('data-filter-key');
      const optionHandle = checkbox.value;
      if (!filterKey || !optionHandle) {
        Logger.warn('Invalid filter change event', { filterKey, optionHandle });
        return;
      }
      Logger.debug('Filter changed', { filterKey, optionHandle, checked: checkbox.checked });
      FilterManager.toggleFilterOption(filterKey, optionHandle);
      if (URLManager.updateURL && StateManager.getState) {
        const state = StateManager.getState();
        URLManager.updateURL(state.filters, state.pagination, state.sort);
      }
      if (global.AFS && global.AFS.refresh) {
        global.AFS.refresh();
      }
    },
    
    handleSearch(query) {
      Logger.debug('Search query changed', { query });
      const state = StateManager.getState ? StateManager.getState() : {};
      const filters = { ...(state.filters || {}) };
      if (query && query.trim()) {
        filters.search = query.trim();
      } else {
        delete filters.search;
      }
      if (StateManager.updateFilters) {
        StateManager.updateFilters(filters);
      }
      if (StateManager.updateState) {
        StateManager.updateState({ pagination: { ...(state.pagination || {}), page: 1 } });
      }
      if (URLManager.updateURL) {
        URLManager.updateURL(filters, state.pagination || {}, state.sort || null);
      }
      if (global.AFS && global.AFS.refresh) {
        global.AFS.refresh();
      }
    },
    
    handlePagination(page) {
      Logger.debug('Pagination changed', { page });
      const state = StateManager.getState ? StateManager.getState() : {};
      if (StateManager.updateState) {
        StateManager.updateState({
          pagination: { ...(state.pagination || {}), page }
        });
      }
      if (URLManager.updateURL) {
        URLManager.updateURL(state.filters || {}, { ...(state.pagination || {}), page }, state.sort || null);
      }
      if (global.AFS && global.AFS.refresh) {
        global.AFS.refresh();
      }
      if (DOMRenderer.productsContainer) {
        DOMRenderer.productsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };
  
  // ============================================================================
  // EXPOSE TO GLOBAL
  // ============================================================================
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.DOMRenderer = DOMRenderer;
    window.AFS.FilterManager = FilterManager;
    window.AFS.EventHandlers = EventHandlers;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.DOMRenderer = DOMRenderer;
    global.AFS.FilterManager = FilterManager;
    global.AFS.EventHandlers = EventHandlers;
  }
  
})(typeof window !== 'undefined' ? window : this);

