/**
 * Advanced Filter Search - Storefront Search Module
 * Replaces native Shopify search bars with intelligent, performant search
*/

// Import utilities from collections-main
import { API, Log, State } from './digitalcoo-filter';
import { Lang } from './locals';
import { ProductType, SearchAPIResponseType, SearchConfigtype, SearchResultType, ShopifyWindow } from './type';
import { $ } from './utils/$.utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<SearchConfigtype> = {
	apiBaseUrl: 'http://localhost:3554/storefront',
	shop: '',
	searchInputSelector: 'input[name="q"], input[name="search"], input[type="search"][name*="q"], input[type="search"][name*="search"], .search__input, form[action*="/search"] input[type="search"], form[action*="/search"] input[name*="q"]',
	minQueryLength: 2,
	debounceMs: 300,
	maxSuggestions: 5,
	maxProducts: 6,
	showSuggestions: true,
	showProducts: true,
	enableKeyboardNav: true
};

// ============================================================================
// STATE
// ============================================================================

const SearchState = {
	config: DEFAULT_CONFIG,
	activeInput: null as HTMLInputElement | null,
	dropdown: null as HTMLElement | null,
	container: null as HTMLElement | null,
	currentQuery: '',
	isOpen: false,
	selectedIndex: -1,
	searchResults: null as SearchResultType | null,
	isLoading: false,
	abortController: null as AbortController | null,
	replacedInputs: new Set<HTMLInputElement>(),
	inputContainers: new Map<HTMLInputElement, HTMLElement>(),
	overriddenContainers: new Set<HTMLElement>(),
	searchButtons: new Set<HTMLElement>(),
	customSearchBox: null as HTMLElement | null
};

// ============================================================================
// DOM UTILITIES
// ============================================================================

const SearchDOM = {
	createContainer(input: HTMLInputElement): HTMLElement {
		// Create container that will be positioned absolutely, NOT wrapping the input
		// This ensures the input's parent and width are never affected
		const container = $.el('div', 'afs-search-container');
		container.style.position = 'absolute';
		container.style.display = 'block';
		
		// Set initial width based on input width with minimum 280px
		// IMPORTANT: We only modify the container, NEVER the input element or its parent
		const inputRect = input.getBoundingClientRect();
		const inputWidth = inputRect.width;
		const minWidth = 280;
		const containerWidth = inputWidth < minWidth ? minWidth : inputWidth;
		
		// Position container relative to input (not wrapping it)
		const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
		const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
		
		container.style.top = `${inputRect.bottom + scrollTop}px`;
		container.style.left = `${inputRect.left + scrollLeft}px`;
		container.style.width = `${containerWidth}px`;
		container.style.minWidth = `${minWidth}px`;
		container.style.zIndex = '999999';
		
		return container;
	},

	createDropdown(): HTMLElement {
		const dropdown = $.el('div', 'afs-search-dropdown');
		dropdown.setAttribute('role', 'listbox');
		dropdown.setAttribute('aria-label', 'Search results');
		return dropdown;
	},

	setupInputContainer(input: HTMLInputElement): HTMLElement {
		// Check if container already exists
		if (SearchState.inputContainers.has(input)) {
			const existingContainer = SearchState.inputContainers.get(input)!;
			// Update container position and width in case input size/position changed
			this.updateContainerPosition(input, existingContainer);
			return existingContainer;
		}

		// IMPORTANT: We do NOT wrap the input or modify its parent
		// The container is positioned absolutely and appended to body
		// This ensures the input's parent and width are NEVER affected
		
		// Create container positioned absolutely relative to input
		const container = this.createContainer(input);
		
		// Append container to body (not wrapping the input)
		// This way the input's parent remains unchanged
		document.body.appendChild(container);

		// Create and append dropdown to container
		const dropdown = this.createDropdown();
		container.appendChild(dropdown);

		// Store the container
		SearchState.inputContainers.set(input, container);
		
		// Watch for input width/position changes (read-only, to update container)
		// We observe the input but NEVER modify it or its parent
		const resizeObserver = new ResizeObserver(() => {
			// Only update container position and width based on input's current size/position
			// Input itself and its parent remain completely untouched
			this.updateContainerPosition(input, container);
			if (SearchState.isOpen && SearchState.activeInput === input) {
				this.positionDropdown(input);
			}
		});
		resizeObserver.observe(input);
		
		return container;
	},

	updateContainerPosition(input: HTMLInputElement, container: HTMLElement): void {
		// IMPORTANT: We only read from input and modify container, NEVER modify input or its parent
		const inputRect = input.getBoundingClientRect();
		const inputWidth = inputRect.width;
		const minWidth = 280;
		const containerWidth = inputWidth < minWidth ? minWidth : inputWidth;
		
		// Calculate position relative to viewport
		const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
		const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
		
		// Only modify container styles, preserve input's original width/height and parent completely
		container.style.top = `${inputRect.bottom + scrollTop}px`;
		container.style.left = `${inputRect.left + scrollLeft}px`;
		container.style.width = `${containerWidth}px`;
		container.style.minWidth = `${minWidth}px`;
		// Never modify input.style, input.width, input.height, input.parentElement, or any input properties
	},

	createSuggestionItem(suggestion: string, index: number): HTMLElement {
		const item = $.el('div', 'afs-search-dropdown__suggestion', {
			'role': 'option',
			'data-index': String(index),
			'tabindex': '-1'
		});
		
		const icon = $.el('span', 'afs-search-dropdown__suggestion-icon');
		icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
		
		const text = $.el('span', 'afs-search-dropdown__suggestion-text');
		text.textContent = suggestion;
		
		item.appendChild(icon);
		item.appendChild(text);
		return item;
	},

	createProductItem(product: ProductType, index: number): HTMLElement {
		// Use handle if available, otherwise fallback to empty string (will be handled by click handler)
		const handle = product.handle || '';
		const productUrl = handle ? `/products/${handle}` : '#';
		
		const item = $.el('a', 'afs-search-dropdown__product', {
			'href': productUrl,
			'role': 'option',
			'data-index': String(index),
			'data-handle': handle,
			'tabindex': '-1'
		});

		// Prevent navigation if no handle (shouldn't happen, but safety check)
		if (!handle) {
			item.addEventListener('click', (e) => {
				e.preventDefault();
				Log.warn('Product item clicked but no handle available', { product });
			});
		}

		// Image
		if (product.imageUrl || product.featuredImage) {
			const imgContainer = $.el('div', 'afs-search-dropdown__product-image');
			const img = $.el('img', '', {
				'alt': product.title || '',
				'loading': 'lazy',
				'decoding': 'async'
			}) as HTMLImageElement;
			
			const baseImageUrl = product.featuredImage?.url || product.featuredImage?.urlFallback || product.imageUrl || '';
			if (baseImageUrl) {
				img.src = baseImageUrl;
			}
			imgContainer.appendChild(img);
			item.appendChild(imgContainer);
		}

		// Info
		const info = $.el('div', 'afs-search-dropdown__product-info');
		
		const title = $.el('div', 'afs-search-dropdown__product-title');
		title.textContent = product.title || '';
		info.appendChild(title);

		if (product.vendor) {
			const vendor = $.el('div', 'afs-search-dropdown__product-vendor');
			vendor.textContent = product.vendor;
			info.appendChild(vendor);
		}

		// Price
		if (product.minPrice !== undefined) {
			const price = $.el('div', 'afs-search-dropdown__product-price');
			const minPrice = parseFloat(String(product.minPrice || 0)) * 100;
			const maxPrice = parseFloat(String(product.maxPrice || 0)) * 100;
			const formattedMin = $.formatMoney(minPrice, State.moneyFormat || '{{amount}}', State.currency || '');
			const priceText = minPrice === maxPrice ? formattedMin : `from ${formattedMin}`;
			price.textContent = priceText;
			info.appendChild(price);
		}

		item.appendChild(info);
		return item;
	},

	createDidYouMeanItem(query: string): HTMLElement {
		const item = $.el('div', 'afs-search-dropdown__did-you-mean', {
			'role': 'option',
			'data-type': 'did-you-mean',
			'tabindex': '-1'
		});
		
		const text = $.el('span', 'afs-search-dropdown__did-you-mean-text');
		text.innerHTML = `Did you mean <strong>${query}</strong>?`;
		item.appendChild(text);
		return item;
	},

	createEmptyState(message: string): HTMLElement {
		const item = $.el('div', 'afs-search-dropdown__empty', {
			'role': 'option'
		});
		item.textContent = message;
		return item;
	},

	createLoadingState(): HTMLElement {
		const item = $.el('div', 'afs-search-dropdown__loading', {
			'role': 'option'
		});
		item.innerHTML = `
			<div class="afs-search-dropdown__loading-spinner"></div>
			<span>${Lang.labels.loading}</span>
		`;
		return item;
	},

	renderDropdown(results: SearchResultType | null, query: string, showEmptyState: boolean = false): void {
		if (!SearchState.dropdown) return;

		// Clear existing content
		SearchState.dropdown.innerHTML = '';
		SearchState.selectedIndex = -1;

		if (SearchState.isLoading) {
			SearchState.dropdown.appendChild(this.createLoadingState());
			return;
		}

		// Show empty state if no query and showEmptyState is true
		if (!query && showEmptyState) {
			const emptyState = this.createEmptyState('Start typing to search...');
			SearchState.dropdown.appendChild(emptyState);
			return;
		}

		if (!results) {
			return;
		}

		const fragment = document.createDocumentFragment();
		let itemIndex = 0;

		// Did you mean
		if (results.didYouMean && results.zeroResults) {
			const didYouMeanItem = this.createDidYouMeanItem(results.didYouMean);
			didYouMeanItem.setAttribute('data-index', String(itemIndex));
			fragment.appendChild(didYouMeanItem);
			itemIndex++;
		}

		// Suggestions
		if (SearchState.config.showSuggestions && results.suggestions && results.suggestions.length > 0) {
			const suggestionsHeader = $.el('div', 'afs-search-dropdown__header');
			suggestionsHeader.textContent = 'Suggestions';
			fragment.appendChild(suggestionsHeader);

			results.suggestions.slice(0, SearchState.config.maxSuggestions).forEach(suggestion => {
				const item = this.createSuggestionItem(suggestion, itemIndex);
				fragment.appendChild(item);
				itemIndex++;
			});
		}

		// Products
		if (SearchState.config.showProducts && results.products && results.products.length > 0) {
			const productsHeader = $.el('div', 'afs-search-dropdown__header');
			productsHeader.textContent = `Products (${results.pagination?.total || results.products.length})`;
			fragment.appendChild(productsHeader);

			results.products.slice(0, SearchState.config.maxProducts).forEach((product: ProductType) => {
				const item = this.createProductItem(product, itemIndex);
				fragment.appendChild(item);
				itemIndex++;
			});

			// View all results link
			if (results.pagination && results.pagination.total > SearchState.config.maxProducts) {
				const viewAll = $.el('a', 'afs-search-dropdown__view-all', {
					'href': `/search?q=${encodeURIComponent(query)}`,
					'role': 'option'
				});
				viewAll.textContent = `View all ${results.pagination.total} results`;
				viewAll.setAttribute('data-index', String(itemIndex));
				fragment.appendChild(viewAll);
				itemIndex++;
			}
		}

		// Empty state
		if (results.zeroResults && (!results.suggestions || results.suggestions.length === 0) && (!results.products || results.products.length === 0)) {
			fragment.appendChild(this.createEmptyState('No products found. Try adjusting your search terms.'));
		}

		SearchState.dropdown.appendChild(fragment);
	},

	positionDropdown(input: HTMLInputElement): void {
		if (!SearchState.dropdown || !SearchState.container) return;

		// Update container position first (in case input moved)
		this.updateContainerPosition(input, SearchState.container);

		// Position dropdown absolutely within the container, below the input
		SearchState.dropdown.style.position = 'absolute';
		SearchState.dropdown.style.top = '100%';
		SearchState.dropdown.style.left = '0';
		SearchState.dropdown.style.width = '100%';
		SearchState.dropdown.style.maxHeight = '400px';
		SearchState.dropdown.style.overflowY = 'auto';
		SearchState.dropdown.style.zIndex = '999999';
		SearchState.dropdown.style.marginTop = '4px';
	},

	showDropdown(): void {
		if (!SearchState.dropdown || !SearchState.activeInput) return;
		
		// Ensure container is set up
		if (!SearchState.container) {
			SearchState.container = this.setupInputContainer(SearchState.activeInput);
			// Get the dropdown from the container
			SearchState.dropdown = SearchState.container.querySelector('.afs-search-dropdown') as HTMLElement;
			if (!SearchState.dropdown) {
				SearchState.dropdown = this.createDropdown();
				SearchState.container.appendChild(SearchState.dropdown);
			}
		}

		SearchState.isOpen = true;
		SearchState.dropdown.classList.add('afs-search-dropdown--visible');
		SearchState.dropdown.setAttribute('aria-expanded', 'true');
		this.positionDropdown(SearchState.activeInput);
	},

	hideDropdown(): void {
		if (!SearchState.dropdown) return;
		SearchState.isOpen = false;
		SearchState.selectedIndex = -1;
		SearchState.dropdown.classList.remove('afs-search-dropdown--visible');
		SearchState.dropdown.setAttribute('aria-expanded', 'false');
		// Don't remove from DOM, just hide it
	},

	highlightItem(index: number): void {
		if (!SearchState.dropdown) return;

		const items = SearchState.dropdown.querySelectorAll('[role="option"][data-index]');
		items.forEach((item, i) => {
			if (i === index) {
				item.classList.add('afs-search-dropdown__item--selected');
				(item as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			} else {
				item.classList.remove('afs-search-dropdown__item--selected');
			}
		});
		SearchState.selectedIndex = index;
	},

	getSelectedItem(): HTMLElement | null {
		if (!SearchState.dropdown || SearchState.selectedIndex < 0) return null;
		const items = SearchState.dropdown.querySelectorAll<HTMLElement>('[role="option"][data-index]');
		return items[SearchState.selectedIndex] || null;
	}
};

// ============================================================================
// API
// ============================================================================

const SearchAPI = {
	async search(query: string): Promise<SearchResultType | null> {
		// Try to get shop and API baseURL from State/API if not set in config
		let shop = SearchState.config.shop;
		let apiBaseUrl = SearchState.config.apiBaseUrl;

		if (!shop && State.shop) {
			shop = State.shop;
		}

		if (!apiBaseUrl && API.baseURL) {
			apiBaseUrl = API.baseURL;
		}

		if (!shop || !apiBaseUrl) {
			Log.error('Search API: shop or apiBaseUrl not configured', { 
				hasShop: !!shop, 
				hasApiBaseUrl: !!apiBaseUrl,
				stateShop: State.shop,
				apiBaseURL: API.baseURL
			});
			return null;
		}

		// Cancel previous request
		if (SearchState.abortController) {
			SearchState.abortController.abort();
		}
		SearchState.abortController = new AbortController();

		const params = new URLSearchParams();
		params.set('shop', shop);
		params.set('q', query);
		params.set('suggestions', 'true');
		params.set('autocomplete', 'true');
		params.set('limit', String(SearchState.config.maxProducts));

		const url = `${apiBaseUrl}/search?${params}`;

		try {
			SearchState.isLoading = true;
			SearchDOM.renderDropdown(null, query);

			const response = await fetch(url, {
				signal: SearchState.abortController.signal,
				headers: {
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json() as SearchAPIResponseType;
			
			if (!data.success || !data.data) {
				Log.error('Invalid search response', { data });
				return null;
			}

			return data.data;
		} catch (error: any) {
			if (error.name === 'AbortError') {
				Log.debug('Search request aborted');
				return null;
			}
			Log.error('Search API error', { error: error.message, query });
			return null;
		} finally {
			SearchState.isLoading = false;
		}
	}
};

// ============================================================================
// SEARCH LOGIC
// ============================================================================

const SearchLogic = {
	debouncedSearch: $.debounce(async (query: string): Promise<void> => {
		if (query.length < SearchState.config.minQueryLength) {
			SearchState.searchResults = null;
			SearchDOM.hideDropdown();
			return;
		}

		// Ensure container is set up before showing dropdown
		if (SearchState.activeInput && !SearchState.inputContainers.has(SearchState.activeInput)) {
			SearchInit.replaceInput(SearchState.activeInput);
		}

		SearchState.currentQuery = query;
		const results = await SearchAPI.search(query);
		SearchState.searchResults = results;
		
		// Always render dropdown when we have results (even if empty)
		if (results !== null) {
			SearchDOM.renderDropdown(results, query);
			SearchDOM.showDropdown();
		} else {
			SearchDOM.hideDropdown();
		}
	}, DEFAULT_CONFIG.debounceMs),

	handleInput(e: Event): void {
		const input = e.target as HTMLInputElement;
		const query = input.value.trim();
		
		SearchState.activeInput = input;
		SearchLogic.debouncedSearch(query);
	},

	handleFocus(e: Event): void {
		const input = e.target as HTMLInputElement;
		SearchState.activeInput = input;
		
		// Ensure container and dropdown are set up for this input
		if (!SearchState.inputContainers.has(input)) {
			SearchInit.replaceInput(input);
		} else {
			SearchState.container = SearchState.inputContainers.get(input)!;
			SearchState.dropdown = SearchState.container.querySelector('.afs-search-dropdown') as HTMLElement;
		}
		
		// Always show dropdown on focus
		const query = input.value.trim();
		if (query.length >= SearchState.config.minQueryLength && SearchState.searchResults) {
			// Show existing results if available
			SearchDOM.renderDropdown(SearchState.searchResults, query);
			SearchDOM.showDropdown();
		} else if (query.length > 0) {
			// If input has value but no results yet, trigger search
			SearchLogic.debouncedSearch(query);
		} else {
			// Show empty state when focused with no query (better UX)
			SearchDOM.renderDropdown(null, '', true);
			SearchDOM.showDropdown();
		}
	},

	handleBlur(e: Event): void {
		// Delay to allow click events on dropdown items
		setTimeout(() => {
			if (!SearchState.dropdown?.matches(':hover') && !SearchState.activeInput?.matches(':focus')) {
				SearchDOM.hideDropdown();
			}
		}, 200);
	},

	handleKeyDown(e: KeyboardEvent): void {
		if (!SearchState.isOpen || !SearchState.dropdown) return;

		const items = SearchState.dropdown.querySelectorAll<HTMLElement>('[role="option"][data-index]');
		const itemCount = items.length;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				SearchState.selectedIndex = Math.min(SearchState.selectedIndex + 1, itemCount - 1);
				SearchDOM.highlightItem(SearchState.selectedIndex);
				break;

			case 'ArrowUp':
				e.preventDefault();
				SearchState.selectedIndex = Math.max(SearchState.selectedIndex - 1, -1);
				if (SearchState.selectedIndex >= 0) {
					SearchDOM.highlightItem(SearchState.selectedIndex);
				} else {
					SearchState.activeInput?.focus();
				}
				break;

			case 'Enter':
				e.preventDefault();
				const selected = SearchDOM.getSelectedItem();
				if (selected) {
					if (selected.tagName === 'A') {
						window.location.href = (selected as HTMLAnchorElement).href;
					} else if (selected.getAttribute('data-type') === 'did-you-mean') {
						const didYouMean = SearchState.searchResults?.didYouMean;
						if (didYouMean && SearchState.activeInput) {
							SearchState.activeInput.value = didYouMean;
							SearchLogic.debouncedSearch(didYouMean);
						}
					} else {
						const suggestion = selected.querySelector('.afs-search-dropdown__suggestion-text')?.textContent;
						if (suggestion && SearchState.activeInput) {
							SearchState.activeInput.value = suggestion;
							SearchLogic.debouncedSearch(suggestion);
						}
					}
				} else if (SearchState.activeInput) {
					// Navigate to search results page
					const query = SearchState.activeInput.value.trim();
					if (query) {
						window.location.href = `/search?q=${encodeURIComponent(query)}`;
					}
				}
				break;

			case 'Escape':
				e.preventDefault();
				SearchDOM.hideDropdown();
				SearchState.activeInput?.blur();
				break;
		}
	},

	handleClick(e: Event): void {
		const target = e.target as HTMLElement;
		const item = target.closest('[role="option"]') as HTMLElement;
		
		if (!item) return;

		if (item.tagName === 'A') {
			// For product links, ensure handle is present before navigation
			const handle = item.getAttribute('data-handle');
			if (handle) {
				// Let the link navigate naturally to /products/{handle}
				// Close dropdown after click
				SearchDOM.hideDropdown();
				if (SearchState.customSearchBox) {
					SearchInit.hideCustomSearchBox();
				}
				return;
			} else {
				// Prevent navigation if no handle
				e.preventDefault();
				Log.warn('Product link clicked but no handle available');
				return;
			}
		}

		e.preventDefault();

		if (item.getAttribute('data-type') === 'did-you-mean') {
			const didYouMean = SearchState.searchResults?.didYouMean;
			if (didYouMean && SearchState.activeInput) {
				SearchState.activeInput.value = didYouMean;
				SearchLogic.debouncedSearch(didYouMean);
			}
		} else {
			const suggestion = item.querySelector('.afs-search-dropdown__suggestion-text')?.textContent;
			if (suggestion && SearchState.activeInput) {
				SearchState.activeInput.value = suggestion;
				SearchLogic.debouncedSearch(suggestion);
			}
		}
	}
};

// ============================================================================
// INITIALIZATION
// ============================================================================

const SearchInit = {
	/**
	 * Create custom search box that will override theme's search
	 */
	createCustomSearchBox(): HTMLElement {
		if (SearchState.customSearchBox) {
			return SearchState.customSearchBox;
		}

		const searchBox = $.el('div', 'afs-search-override-box');
		searchBox.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			background: var(--afs-bg-color, #fff);
			border-bottom: 1px solid var(--afs-border-color, #e0e0e0);
			z-index: 999998;
			padding: 16px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			display: none;
		`;

		const searchForm = $.el('form', 'afs-search-override-form');
		searchForm.style.cssText = `
			display: flex;
			align-items: center;
			gap: 12px;
			max-width: 1200px;
			margin: 0 auto;
		`;

		const searchInput = $.el('input', 'afs-search-override-input') as HTMLInputElement;
		searchInput.type = 'search';
		searchInput.name = 'q';
		searchInput.placeholder = 'Search products...';
		searchInput.autocomplete = 'off';
		searchInput.style.cssText = `
			flex: 1;
			padding: 12px 16px;
			border: 1px solid var(--afs-border-color, #e0e0e0);
			border-radius: 4px;
			font-size: 16px;
			outline: none;
		`;

		const closeButton = $.el('button', 'afs-search-override-close');
		closeButton.type = 'button';
		closeButton.innerHTML = '✕';
		closeButton.setAttribute('aria-label', 'Close search');
		closeButton.style.cssText = `
			padding: 8px 16px;
			background: transparent;
			border: none;
			font-size: 24px;
			cursor: pointer;
			color: var(--afs-text-color, #333);
		`;

		closeButton.addEventListener('click', () => {
			this.hideCustomSearchBox();
		});

		searchForm.appendChild(searchInput);
		searchForm.appendChild(closeButton);
		searchBox.appendChild(searchForm);
		document.body.appendChild(searchBox);

		// Replace this input with our enhanced search
		this.replaceInput(searchInput);

		SearchState.customSearchBox = searchBox;
		return searchBox;
	},

	showCustomSearchBox(): void {
		const searchBox = this.createCustomSearchBox();
		searchBox.style.display = 'block';
		
		// Focus the input
		const input = searchBox.querySelector('input') as HTMLInputElement;
		if (input) {
			setTimeout(() => input.focus(), 100);
		}

		// Prevent body scroll
		document.body.style.overflow = 'hidden';
	},

	hideCustomSearchBox(): void {
		if (SearchState.customSearchBox) {
			SearchState.customSearchBox.style.display = 'none';
			SearchDOM.hideDropdown();
		}
		document.body.style.overflow = '';
	},

	/**
	 * Find search icon buttons (common theme patterns)
	 */
	findSearchButtons(): HTMLElement[] {
		const selectors = [
			'button[aria-label*="search" i]',
			'button[aria-label*="Search" i]',
			'a[aria-label*="search" i]',
			'a[aria-label*="Search" i]',
			'button.search',
			'a.search',
			'button[class*="search"]',
			'a[class*="search"]',
			'button[data-search]',
			'a[data-search]',
			'[data-search-toggle]',
			'[data-search-trigger]',
			'.search-icon',
			'.search-button',
			'[id*="search" i]',
			'[class*="search-icon" i]',
			'[class*="search-button" i]',
			// Shopify common patterns
			'header button[type="button"]:has(svg[class*="search"])',
			'header a:has(svg[class*="search"])',
			'.header__icon--search',
			'.site-header__search',
		];

		const buttons: HTMLElement[] = [];
		selectors.forEach(selector => {
			try {
				const elements = document.querySelectorAll<HTMLElement>(selector);
				elements.forEach(el => {
					// Check if it looks like a search button (has search icon or text)
					const text = el.textContent?.toLowerCase() || '';
					const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
					const hasSearchIcon = el.querySelector('svg[class*="search"], svg[aria-label*="search" i]');
					
					if (hasSearchIcon || text.includes('search') || ariaLabel.includes('search')) {
						buttons.push(el);
					}
				});
			} catch (e) {
				// Invalid selector, skip
			}
		});

		return buttons;
	},

	/**
	 * Find predictive search containers (common theme patterns)
	 */
	findPredictiveSearchContainers(): HTMLElement[] {
		const selectors = [
			'[data-predictive-search]',
			'[id*="predictive" i]',
			'[class*="predictive" i]',
			'[class*="search-results" i]',
			'[class*="search-dropdown" i]',
			'[class*="search-suggestions" i]',
			'.predictive-search',
			'.search-results',
			'.search-dropdown',
			'.search-suggestions',
			'[data-search-results]',
			'[data-search-dropdown]',
			// Shopify common patterns
			'[id*="Search" i]',
			'[class*="Search" i]',
		];

		const containers: HTMLElement[] = [];
		selectors.forEach(selector => {
			try {
				const elements = document.querySelectorAll<HTMLElement>(selector);
				elements.forEach(el => {
					// Check if it's a search results container (not our own)
					if (!el.classList.contains('afs-search-container') && 
					    !el.classList.contains('afs-search-dropdown')) {
						containers.push(el);
					}
				});
			} catch (e) {
				// Invalid selector, skip
			}
		});

		return containers;
	},

	/**
	 * Override search button click to show our custom search
	 */
	overrideSearchButton(button: HTMLElement): void {
		if (SearchState.searchButtons.has(button)) return;

		// Prevent default behavior
		button.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();

			// Hide any theme search containers
			this.hideThemeSearchContainers();

			// Show our custom search box
			this.showCustomSearchBox();
		}, true); // Use capture phase to intercept early

		SearchState.searchButtons.add(button);
		Log.debug('Overridden search button', { button });
	},

	/**
	 * Hide theme's native search containers
	 */
	hideThemeSearchContainers(): void {
		const containers = this.findPredictiveSearchContainers();
		containers.forEach(container => {
			container.style.display = 'none';
			container.setAttribute('data-afs-hidden', 'true');
			SearchState.overriddenContainers.add(container);
		});
	},

	/**
	 * Override search containers by replacing their content
	 */
	overrideSearchContainers(): void {
		const containers = this.findPredictiveSearchContainers();
		containers.forEach(container => {
			if (SearchState.overriddenContainers.has(container)) return;

			// Hide the container
			container.style.display = 'none';
			container.setAttribute('data-afs-hidden', 'true');
			SearchState.overriddenContainers.add(container);

			Log.debug('Overridden search container', { container });
		});
	},

	replaceInput(input: HTMLInputElement): void {
		if (SearchState.replacedInputs.has(input)) return;

		// Setup container for this input
		const container = SearchDOM.setupInputContainer(input);
		SearchState.container = container;

		// Get or create dropdown for this container
		let dropdown = container.querySelector('.afs-search-dropdown') as HTMLElement;
		if (!dropdown) {
			dropdown = SearchDOM.createDropdown();
			container.appendChild(dropdown);
		}
		SearchState.dropdown = dropdown;
		dropdown.addEventListener('click', SearchLogic.handleClick);

		// Prevent native Shopify search
		const form = input.closest('form');
		if (form) {
			form.addEventListener('submit', (e) => {
				e.preventDefault();
				const query = input.value.trim();
				if (query) {
					window.location.href = `/search?q=${encodeURIComponent(query)}`;
				}
			});
		}

		// Add event listeners
		input.addEventListener('input', SearchLogic.handleInput);
		input.addEventListener('focus', SearchLogic.handleFocus);
		input.addEventListener('blur', SearchLogic.handleBlur);
		input.addEventListener('keydown', SearchLogic.handleKeyDown);

		// Add data attribute to identify replaced inputs (does not affect styling)
		// IMPORTANT: We never modify input.style, input.width, input.height, or any CSS properties
		input.setAttribute('data-afs-search', 'true');
		SearchState.replacedInputs.add(input);
	},

	isFilterSectionInput(input: HTMLInputElement): boolean {
		// Exclude filter section search inputs
		// Filter inputs have class 'afs-filter-group__search-input' or are inside filter containers
		if (input.classList.contains('afs-filter-group__search-input')) {
			return true;
		}
		
		// Check if input is inside filter container
		const filterContainer = input.closest('[data-afs-container]');
		if (filterContainer) {
			return true;
		}
		
		// Check if input is inside filter group
		const filterGroup = input.closest('.afs-filter-group');
		if (filterGroup) {
			return true;
		}
		
		// Check if input name starts with 'afs-search-' (filter search inputs)
		if (input.name && input.name.startsWith('afs-search-')) {
			return true;
		}
		
		return false;
	},

	isShopifySearchInput(input: HTMLInputElement): boolean {
		// Primary: name="q" (standard Shopify search)
		if (input.name === 'q') {
			return true;
		}
		
		// Secondary: name="search" (alternative Shopify format)
		if (input.name === 'search') {
			return true;
		}
		
		// Check if input is in a form that submits to /search
		const form = input.closest('form');
		if (form) {
			const action = form.getAttribute('action');
			if (action && (action.includes('/search') || action.includes('search'))) {
				// Only if it's a search or text input type
				if (input.type === 'search' || input.type === 'text' || !input.type) {
					return true;
				}
			}
		}
		
		// Check for Shopify search input classes
		if (input.classList.contains('search__input')) {
			return true;
		}
		
		// Check if input has data-search-input attribute
		if (input.hasAttribute('data-search-input')) {
			return true;
		}
		
		return false;
	},

	overrideSearchButtons(): void {
		const buttons = this.findSearchButtons();
		buttons.forEach(button => {
			this.overrideSearchButton(button);
		});
	},

	findAndReplaceInputs(): void {
		const inputs = document.querySelectorAll<HTMLInputElement>(SearchState.config.searchInputSelector);
		inputs.forEach(input => {
			// Skip if already replaced
			if (SearchState.replacedInputs.has(input)) {
				return;
			}
			
			// Skip filter section inputs
			if (this.isFilterSectionInput(input)) {
				Log.debug('Skipping filter section input', { name: input.name, class: input.className });
				return;
			}
			
			// Only process Shopify search inputs
			if (this.isShopifySearchInput(input)) {
				Log.debug('Processing Shopify search input', { name: input.name, type: input.type });
				this.replaceInput(input);
			}
		});
	},

	init(config: SearchConfigtype = {}): void {
		// Merge config
		SearchState.config = { ...DEFAULT_CONFIG, ...config };

		// Use shop from State if available
		if (!SearchState.config.shop && State.shop) {
			SearchState.config.shop = State.shop;
		}

		// Use API baseURL from API if available
		if (!SearchState.config.apiBaseUrl && API.baseURL) {
			SearchState.config.apiBaseUrl = API.baseURL;
		}

		// Override search buttons and containers FIRST (before finding inputs)
		this.overrideSearchButtons();
		this.overrideSearchContainers();

		// Find and replace search inputs
		this.findAndReplaceInputs();

		// Watch for dynamically added inputs, buttons, and containers
		const observer = new MutationObserver(() => {
			this.overrideSearchButtons();
			this.overrideSearchContainers();
			this.findAndReplaceInputs();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true
		});

		// Close dropdown on outside click
		document.addEventListener('click', (e) => {
			if (SearchState.isOpen && SearchState.container) {
				const target = e.target as Node;
				if (!SearchState.container.contains(target) && 
				    !SearchState.activeInput?.contains(target)) {
					SearchDOM.hideDropdown();
				}
			}

			// Close custom search box if clicking outside
			if (SearchState.customSearchBox && SearchState.customSearchBox.style.display === 'block') {
				const target = e.target as Node;
				if (!SearchState.customSearchBox.contains(target)) {
					// Don't close if clicking on search buttons
					const clickedButton = (target as HTMLElement).closest('button, a');
					if (!clickedButton || !SearchState.searchButtons.has(clickedButton as HTMLElement)) {
						this.hideCustomSearchBox();
					}
				}
			}
		});

		// Close on Escape key
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && SearchState.customSearchBox && SearchState.customSearchBox.style.display === 'block') {
				this.hideCustomSearchBox();
			}
		});

		// Update dropdown position and container width on scroll/resize
		let resizeTimer: ReturnType<typeof setTimeout>;
		const updatePosition = () => {
			if (SearchState.activeInput && SearchState.container) {
				// Update container position and width to match input (min 280px)
				// This does NOT modify the input or its parent
				SearchDOM.updateContainerPosition(SearchState.activeInput, SearchState.container);
				
				// Update dropdown position if open
				if (SearchState.isOpen) {
					SearchDOM.positionDropdown(SearchState.activeInput);
				}
			}
		};

		window.addEventListener('scroll', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(updatePosition, 10);
		}, true);

		window.addEventListener('resize', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(updatePosition, 10);
		});

		Log.info('Search module initialized', { config: SearchState.config });
	}
};

// ============================================================================
// EXPORTS
// ============================================================================

declare global {
	interface Window {
		AFSSearch?: {
			init: (config?: SearchConfigtype) => void;
		};
	}
}

if (typeof window !== 'undefined') {
	const win = window as ShopifyWindow;
	win.AFSSearch = {
		init: SearchInit.init.bind(SearchInit)
	};
}

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		SearchInit.init();
	});
} else {
	SearchInit.init();
}