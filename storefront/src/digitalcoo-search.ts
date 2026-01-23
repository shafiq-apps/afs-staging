/**
 * Advanced Filter Search - Storefront Search Module
 * Replaces native Shopify search bars with intelligent, performant search
 * 
 * This module is completely independent and does not rely on the filter module.
 * All configuration comes from data attributes in the Liquid block or explicit config.
*/

// Import lightweight shared utilities
import { Log } from './utils/shared';
import { Lang } from './locals';
import { ProductType, SearchAPIResponseType, SearchConfigtype, SearchResultType } from './type';
import { $ } from './utils/$.utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<SearchConfigtype> = {
	apiBaseUrl: 'https://fstaging.digitalcoo.com/storefront',
	shop: null,
	moneyFormat: null,
	currency: null,
	moneyWithCurrencyFormat: null,
	searchInputSelector: 'input[name="q"], input[name="search"], input[type="search"][name*="q"], input[type="search"][name*="search"], .search__input, form[action*="/search"] input[type="search"], form[action*="/search"] input[name*="q"]',
	minQueryLength: 2,
	debounceMs: 300,
	maxSuggestions: 5,
	maxProducts: 6,
	showSuggestions: true,
	showProducts: true,
	enableKeyboardNav: true,
	debug: false
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
	customSearchBox: null as HTMLElement | null,
	visibilityObserver: null as IntersectionObserver | null,
	observedInputs: new Set<HTMLInputElement>()
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
		const item = $.el('a', 'afs-search-dropdown__suggestion', {
			'href': `/search?q=${encodeURIComponent(suggestion)}`,
			'role': 'option',
			'data-index': String(index),
			'data-type': 'suggestion',
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
			// Get money format from config
			const moneyFormat = SearchState.config.moneyFormat || '{{amount}}';
			const currency = SearchState.config.currency || '';
			const formattedMin = $.formatMoney(minPrice, moneyFormat, currency);
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

		if (!shop || !apiBaseUrl) {
			Log.error('Search API: shop or apiBaseUrl not configured', { 
				hasShop: !!shop, 
				hasApiBaseUrl: !!apiBaseUrl
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

		const itemType = item.getAttribute('data-type');

		if (itemType === 'did-you-mean') {
			const didYouMean = SearchState.searchResults?.didYouMean;
			if (didYouMean && SearchState.activeInput) {
				SearchState.activeInput.value = didYouMean;
				SearchLogic.debouncedSearch(didYouMean);
			}
			e.preventDefault();
			return;
		}

		if (itemType === 'suggestion') {
			const suggestion = item.querySelector('.afs-search-dropdown__suggestion-text')?.textContent || item.textContent || '';
			if (suggestion && SearchState.activeInput) {
				SearchState.activeInput.value = suggestion;
			}
			// Close dropdown and navigate to search results page
			SearchDOM.hideDropdown();
			if (SearchState.customSearchBox) {
				SearchInit.hideCustomSearchBox();
			}
			window.location.href = `/search?q=${encodeURIComponent(suggestion)}`;
			e.preventDefault();
			return;
		}

		if (item.tagName === 'A') {
			// Product or navigation links
			const handle = item.getAttribute('data-handle');
			if (handle) {
				// Let the link navigate naturally to /products/{handle}
				SearchDOM.hideDropdown();
				if (SearchState.customSearchBox) {
					SearchInit.hideCustomSearchBox();
				}
				return;
			}

			// Allow navigation for view-all/suggestion links with href
			if (item.getAttribute('href')) {
				SearchDOM.hideDropdown();
				if (SearchState.customSearchBox) {
					SearchInit.hideCustomSearchBox();
				}
				return;
			}

			// Prevent navigation if no target found
			e.preventDefault();
			Log.warn('Link clicked but no navigation target available');
			return;
		} else {
			const suggestion = item.querySelector('.afs-search-dropdown__suggestion-text')?.textContent;
			if (suggestion && SearchState.activeInput) {
				SearchState.activeInput.value = suggestion;
				SearchLogic.debouncedSearch(suggestion);
			}
			e.preventDefault();
		}
	}
};

// ============================================================================
// INITIALIZATION
// ============================================================================

const SearchInit = {
	/**
	 * Read config from data attributes on container element
	 */
	readConfigFromDataAttributes(): Partial<SearchConfigtype> | null {
		// Look for container with data-afs-search-container attribute
		const container = document.querySelector<HTMLElement>('[data-afs-search-container]');
		if (!container) {
			return null;
		}

		const config: Partial<SearchConfigtype> = {};

		// Read shop from data attribute
		if (container.dataset.afsSearchShop) {
			config.shop = container.dataset.afsSearchShop;
		}

		// Read API base URL
		if (container.dataset.afsSearchApiBaseUrl) {
			config.apiBaseUrl = container.dataset.afsSearchApiBaseUrl;
		}

		// Read money format
		if (container.dataset.afsSearchMoneyFormat) {
			config.moneyFormat = container.dataset.afsSearchMoneyFormat;
		}

		// Read currency
		if (container.dataset.afsSearchCurrency) {
			config.currency = container.dataset.afsSearchCurrency;
		}

		// Read money with currency format
		if (container.dataset.afsSearchMoneyWithCurrencyFormat) {
			config.moneyWithCurrencyFormat = container.dataset.afsSearchMoneyWithCurrencyFormat;
		}

		// Read debug flag (always present from Liquid, parse as boolean)
		if (container.dataset.afsSearchDebug !== undefined) {
			const value = container.dataset.afsSearchDebug;
			(config as any).debug = value === 'true' || value === '1';
		}

		// Read min query length (always present from Liquid with default)
		if (container.dataset.afsSearchMinQueryLength) {
			const minQueryLength = parseInt(container.dataset.afsSearchMinQueryLength, 10);
			if (!isNaN(minQueryLength) && minQueryLength > 0) {
				config.minQueryLength = minQueryLength;
			}
		}

		// Read debounce ms (always present from Liquid with default)
		if (container.dataset.afsSearchDebounceMs) {
			const debounceMs = parseInt(container.dataset.afsSearchDebounceMs, 10);
			if (!isNaN(debounceMs) && debounceMs >= 0) {
				config.debounceMs = debounceMs;
			}
		}

		// Read max suggestions (always present from Liquid with default)
		if (container.dataset.afsSearchMaxSuggestions) {
			const maxSuggestions = parseInt(container.dataset.afsSearchMaxSuggestions, 10);
			if (!isNaN(maxSuggestions) && maxSuggestions > 0) {
				config.maxSuggestions = maxSuggestions;
			}
		}

		// Read max products (always present from Liquid with default)
		if (container.dataset.afsSearchMaxProducts) {
			const maxProducts = parseInt(container.dataset.afsSearchMaxProducts, 10);
			if (!isNaN(maxProducts) && maxProducts > 0) {
				config.maxProducts = maxProducts;
			}
		}

		// Read show suggestions flag (always present from Liquid with default)
		if (container.dataset.afsSearchShowSuggestions !== undefined) {
			const value = container.dataset.afsSearchShowSuggestions;
			config.showSuggestions = value === 'true' || value === '1';
		}

		// Read show products flag (always present from Liquid with default)
		if (container.dataset.afsSearchShowProducts !== undefined) {
			const value = container.dataset.afsSearchShowProducts;
			config.showProducts = value === 'true' || value === '1';
		}

		// Read enable keyboard nav flag (always present from Liquid with default)
		if (container.dataset.afsSearchEnableKeyboardNav !== undefined) {
			const value = container.dataset.afsSearchEnableKeyboardNav;
			config.enableKeyboardNav = value === 'true' || value === '1';
		}

		// Read search input selector
		if (container.dataset.afsSearchInputSelector) {
			config.searchInputSelector = container.dataset.afsSearchInputSelector;
		}

		return Object.keys(config).length > 0 ? config : null;
	},

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
		// closeButton.type = 'button';
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

		// Remove inline event handlers (onclick, etc.)
		this.removeInlineHandlers(button);
		
		// Add our click handler in capture phase to intercept before native handlers
		button.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			// Find the search input and focus it
			const searchInput = document.querySelector<HTMLInputElement>('input[name="q"], input[name="search"], input[type="search"]');
			if (searchInput) {
				searchInput.focus();
			}
		}, true); // Capture phase - runs before native handlers

		SearchState.searchButtons.add(button);
		Log.debug('Removed inline handlers and added capture-phase listener to search button', { button });
	},

	/**
	 * Override search containers by removing their event listeners (don't hide them)
	 */
	overrideSearchContainers(): void {
		const containers = this.findPredictiveSearchContainers();
		containers.forEach(container => {
			if (SearchState.overriddenContainers.has(container)) return;

			// Remove inline event handlers
			this.removeInlineHandlers(container);
			
			// Add capture-phase listeners to intercept any clicks/events
			container.addEventListener('click', (e) => {
				e.stopImmediatePropagation();
			}, true); // Capture phase
			
			container.setAttribute('data-afs-handled', 'true');
			SearchState.overriddenContainers.add(container);

			Log.debug('Removed inline handlers and added capture-phase listeners to search container', { container });
		});
	},

	/**
	 * Remove inline event handlers from an element (onclick, onsubmit, etc.)
	 */
	removeInlineHandlers(element: HTMLElement): void {
		// Remove all inline event handlers by setting them to null
		const inlineHandlers = ['onclick', 'onsubmit', 'onfocus', 'onblur', 'oninput', 'onchange', 'onkeydown', 'onkeyup'];
		inlineHandlers.forEach(handler => {
			if (element.hasAttribute(handler)) {
				element.removeAttribute(handler);
			}
			// Also remove from element properties (some themes set these directly)
			try {
				(element as any)[handler] = null;
			} catch (e) {
				// Ignore errors if property is read-only
			}
		});
	},

	replaceInput(input: HTMLInputElement): void {
		if (SearchState.replacedInputs.has(input)) return;

		// Remove inline event handlers (onclick, oninput, etc.)
		this.removeInlineHandlers(input);

		// Use the original input - no cloning needed!
		const newInput = input;

		// Setup container for this input
		const container = SearchDOM.setupInputContainer(newInput);
		SearchState.container = container;

		// Get or create dropdown for this container
		let dropdown = container.querySelector('.afs-search-dropdown') as HTMLElement;
		if (!dropdown) {
			dropdown = SearchDOM.createDropdown();
			container.appendChild(dropdown);
		}
		SearchState.dropdown = dropdown;
		dropdown.addEventListener('click', SearchLogic.handleClick);

		// Prevent native Shopify search form submission
		// Remove inline handlers and use capture phase to intercept before native handlers
		const form = newInput.closest('form');
		if (form && !form.hasAttribute('data-afs-form-handled')) {
			// Remove inline form handlers
			this.removeInlineHandlers(form);
			
			// Add our submit handler in capture phase to intercept before native handlers
			form.addEventListener('submit', (e) => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				const query = newInput.value.trim();
				if (query) {
					// Use our search instead of native Shopify search
					window.location.href = `/search?q=${encodeURIComponent(query)}`;
				}
			}, true); // Capture phase - runs before native handlers
			
			form.setAttribute('data-afs-form-handled', 'true');
		}

		// Add our event listeners in capture phase to intercept before native handlers
		// stopImmediatePropagation() will prevent native handlers from running
		newInput.addEventListener('input', (e: Event) => {
			e.stopImmediatePropagation();
			SearchLogic.handleInput(e);
		}, true); // Capture phase
		
		newInput.addEventListener('focus', (e: Event) => {
			e.stopImmediatePropagation();
			SearchLogic.handleFocus(e);
		}, true); // Capture phase
		
		newInput.addEventListener('blur', (e: Event) => {
			// Don't stop propagation on blur - let it bubble normally
			SearchLogic.handleBlur(e);
		}, true); // Capture phase
		
		newInput.addEventListener('keydown', (e: KeyboardEvent) => {
			e.stopImmediatePropagation();
			SearchLogic.handleKeyDown(e);
		}, true); // Capture phase

		// Add data attribute to identify replaced inputs (does not affect styling)
		// IMPORTANT: We never modify input.style, input.width, input.height, or any CSS properties
		newInput.setAttribute('data-afs-search', 'true');
		SearchState.replacedInputs.add(newInput);
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

	/**
	 * Check if an element is actually visible to the user (not just in DOM)
	 */
	isElementVisible(element: HTMLElement): boolean {
		if (!element) return false;
		
		// Check computed style
		const style = window.getComputedStyle(element);
		if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
			return false;
		}
		
		// Check if element has dimensions
		const rect = element.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			return false;
		}
		
		// Check if element is in viewport (at least partially)
		const isInViewport = rect.top < window.innerHeight && 
		                     rect.bottom > 0 && 
		                     rect.left < window.innerWidth && 
		                     rect.right > 0;
		
		// Check if element or any parent is hidden
		let parent: HTMLElement | null = element.parentElement;
		while (parent && parent !== document.body) {
			const parentStyle = window.getComputedStyle(parent);
			if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
				return false;
			}
			parent = parent.parentElement;
		}
		
		return isInViewport;
	},

	/**
	 * Observe an input element for when it becomes visible, then initialize search on it
	 */
	observeInputForVisibility(input: HTMLInputElement): void {
		// Skip if already observing this input
		if (SearchState.observedInputs.has(input)) {
			return;
		}
		
		// Create IntersectionObserver if it doesn't exist
		if (!SearchState.visibilityObserver) {
			SearchState.visibilityObserver = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					const input = entry.target as HTMLInputElement;
					
					// If input becomes visible and is intersecting
					if (entry.isIntersecting && entry.intersectionRatio > 0) {
						// Check if it's actually visible (not just in viewport but also has display/visibility)
						if (this.isElementVisible(input)) {
							// Check if it's a Shopify search input and not already replaced
							if (this.isShopifySearchInput(input) && 
							    !SearchState.replacedInputs.has(input) &&
							    !this.isFilterSectionInput(input)) {
								Log.debug('Search input became visible, initializing search', { 
									name: input.name, 
									type: input.type 
								});
								this.replaceInput(input);
								// Stop observing this input
								SearchState.visibilityObserver?.unobserve(input);
								SearchState.observedInputs.delete(input);
							}
						}
					}
				});
			}, {
				// Observe when element enters viewport
				threshold: 0.01,
				rootMargin: '0px'
			});
		}
		
		// Start observing the input
		SearchState.visibilityObserver.observe(input);
		SearchState.observedInputs.add(input);
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
				// Check if input is visible
				if (this.isElementVisible(input)) {
					Log.debug('Processing visible Shopify search input', { name: input.name, type: input.type });
					this.replaceInput(input);
				} else {
					// Input is not visible yet, observe it for when it becomes visible
					Log.debug('Shopify search input found but not visible, observing for visibility', { name: input.name });
					this.observeInputForVisibility(input);
				}
			}
		});
	},

	init(config?: Partial<SearchConfigtype>): void {
		// Priority: 1. Explicit config parameter, 2. Data attributes, 3. Defaults
		let finalConfig: Partial<SearchConfigtype> = {};
		
		// First, try to read from data attributes (from Liquid block)
		const dataConfig = this.readConfigFromDataAttributes();
		if (dataConfig) {
			finalConfig = { ...finalConfig, ...dataConfig };
		}
		
		// Then, override with explicit config if provided (for programmatic initialization)
		if (config && Object.keys(config).length > 0) {
			finalConfig = { ...finalConfig, ...config };
		}

		// Merge with defaults (lowest priority)
		SearchState.config = { ...DEFAULT_CONFIG, ...finalConfig };

		// Override search buttons and containers FIRST (before finding inputs)
		this.overrideSearchButtons();
		this.overrideSearchContainers();

		// Find and replace search inputs
		this.findAndReplaceInputs();

		// Watch for dynamically added inputs, buttons, and containers
		const observer = new MutationObserver(() => {
			this.overrideSearchButtons();
			this.overrideSearchContainers();
			// This will check visibility and observe hidden inputs
			this.findAndReplaceInputs();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
		
		// Also check for inputs that might become visible on scroll/resize
		let visibilityCheckTimeout: number | null = null;
		const checkVisibleInputs = () => {
			if (visibilityCheckTimeout) {
				clearTimeout(visibilityCheckTimeout);
			}
			visibilityCheckTimeout = window.setTimeout(() => {
				// Re-check all inputs that are in DOM but not yet replaced
				const inputs = document.querySelectorAll<HTMLInputElement>(SearchState.config.searchInputSelector);
				inputs.forEach(input => {
					if (!SearchState.replacedInputs.has(input) && 
					    !this.isFilterSectionInput(input) &&
					    this.isShopifySearchInput(input)) {
						if (this.isElementVisible(input)) {
							Log.debug('Input became visible on scroll/resize, initializing', { name: input.name });
							this.replaceInput(input);
							// Stop observing if we were observing it
							if (SearchState.observedInputs.has(input)) {
								SearchState.visibilityObserver?.unobserve(input);
								SearchState.observedInputs.delete(input);
							}
						} else if (!SearchState.observedInputs.has(input)) {
							// Start observing if not already
							this.observeInputForVisibility(input);
						}
					}
				});
			}, 100); // Debounce visibility checks
		};
		
		// Check on scroll and resize
		window.addEventListener('scroll', checkVisibleInputs, { passive: true });
		window.addEventListener('resize', checkVisibleInputs, { passive: true });

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
	window.AFSSearch = {
		init: SearchInit.init.bind(SearchInit)
	};
}

// Auto-initialize from data attributes if DOM is ready
const autoInit = () => {
	// Only auto-init if container with data attributes exists
	const container = document.querySelector<HTMLElement>('[data-afs-search-container]');
	if (container) {
		SearchInit.init();
	}
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', autoInit);
} else {
	// DOM already ready, but wait a bit for Liquid to render
	setTimeout(autoInit, 50);
}