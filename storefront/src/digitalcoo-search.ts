/**
 * Advanced Filter Search - Storefront Search Module
 * Replaces native Shopify search bars with intelligent, performant search
 */

// Import utilities from collections-main
import { $, API, Lang, Log, State, Icons } from './digitalcoo-filter';
import { ProductType as Product, ShopifyWindow } from './type';

// ============================================================================
// TYPES
// ============================================================================

interface SearchConfig {
	apiBaseUrl?: string;
	shop?: string;
	searchInputSelector?: string;
	minQueryLength?: number;
	debounceMs?: number;
	maxSuggestions?: number;
	maxProducts?: number;
	showSuggestions?: boolean;
	showProducts?: boolean;
	enableKeyboardNav?: boolean;
}

interface SearchResult {
	products: Product[];
	suggestions?: string[];
	alternativeQueries?: string[];
	didYouMean?: string;
	zeroResults?: boolean;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

interface SearchAPIResponse {
	success: boolean;
	data: SearchResult;
	message?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<SearchConfig> = {
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
	searchResults: null as SearchResult | null,
	isLoading: false,
	abortController: null as AbortController | null,
	replacedInputs: new Set<HTMLInputElement>(),
	inputContainers: new Map<HTMLInputElement, HTMLElement>()
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

	createProductItem(product: Product, index: number): HTMLElement {
		const item = $.el('a', 'afs-search-dropdown__product', {
			'href': `/products/${product.handle || ''}`,
			'role': 'option',
			'data-index': String(index),
			'tabindex': '-1'
		});

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

	renderDropdown(results: SearchResult | null, query: string): void {
		if (!SearchState.dropdown) return;

		// Clear existing content
		SearchState.dropdown.innerHTML = '';
		SearchState.selectedIndex = -1;

		if (SearchState.isLoading) {
			SearchState.dropdown.appendChild(this.createLoadingState());
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

			results.products.slice(0, SearchState.config.maxProducts).forEach(product => {
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
	async search(query: string): Promise<SearchResult | null> {
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

			const data = await response.json() as SearchAPIResponse;
			
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
		
		if (input.value.trim().length >= SearchState.config.minQueryLength && SearchState.searchResults) {
			SearchDOM.renderDropdown(SearchState.searchResults, input.value.trim());
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
			// Let the link navigate naturally
			return;
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

	init(config: SearchConfig = {}): void {
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

		// Find and replace search inputs
		this.findAndReplaceInputs();

		// Watch for dynamically added inputs
		const observer = new MutationObserver(() => {
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
			init: (config?: SearchConfig) => void;
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

