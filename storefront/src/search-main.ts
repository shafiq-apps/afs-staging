/**
 * Advanced Filter Search - Storefront Search Module
 * Replaces native Shopify search bars with intelligent, performant search
 */

// Import utilities from collections-main
import { $, API, Lang, Log, State, Icons, Product, ShopifyWindow } from './collections-main';

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
	apiBaseUrl: 'https://fstaging.digitalcoo.com/storefront',
	shop: '',
	searchInputSelector: 'input[type="search"], input[name*="search"], input[placeholder*="search" i], .search__input, [data-search-input]',
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
	currentQuery: '',
	isOpen: false,
	selectedIndex: -1,
	searchResults: null as SearchResult | null,
	isLoading: false,
	abortController: null as AbortController | null,
	replacedInputs: new Set<HTMLInputElement>()
};

// ============================================================================
// DOM UTILITIES
// ============================================================================

const SearchDOM = {
	createDropdown(): HTMLElement {
		const dropdown = $.el('div', 'afs-search-dropdown');
		dropdown.setAttribute('role', 'listbox');
		dropdown.setAttribute('aria-label', 'Search results');
		return dropdown;
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
		if (!SearchState.dropdown) return;

		const rect = input.getBoundingClientRect();
		const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
		const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

		SearchState.dropdown.style.position = 'absolute';
		SearchState.dropdown.style.top = `${rect.bottom + scrollTop}px`;
		SearchState.dropdown.style.left = `${rect.left + scrollLeft}px`;
		SearchState.dropdown.style.width = `${rect.width}px`;
		SearchState.dropdown.style.maxHeight = '400px';
		SearchState.dropdown.style.overflowY = 'auto';
		SearchState.dropdown.style.zIndex = '9999';
	},

	showDropdown(): void {
		if (!SearchState.dropdown || !SearchState.activeInput) return;
		SearchState.isOpen = true;
		SearchState.dropdown.classList.add('afs-search-dropdown--visible');
		SearchState.dropdown.setAttribute('aria-expanded', 'true');
		this.positionDropdown(SearchState.activeInput);
		document.body.appendChild(SearchState.dropdown);
	},

	hideDropdown(): void {
		if (!SearchState.dropdown) return;
		SearchState.isOpen = false;
		SearchState.selectedIndex = -1;
		SearchState.dropdown.classList.remove('afs-search-dropdown--visible');
		SearchState.dropdown.setAttribute('aria-expanded', 'false');
		if (SearchState.dropdown.parentNode) {
			SearchState.dropdown.parentNode.removeChild(SearchState.dropdown);
		}
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

		SearchState.currentQuery = query;
		const results = await SearchAPI.search(query);
		SearchState.searchResults = results;
		SearchDOM.renderDropdown(results, query);
		
		if (results && (results.products?.length > 0 || results.suggestions?.length > 0)) {
			SearchDOM.showDropdown();
		} else if (results?.zeroResults) {
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

		// Add data attribute to identify replaced inputs
		input.setAttribute('data-afs-search', 'true');
		SearchState.replacedInputs.add(input);
	},

	findAndReplaceInputs(): void {
		const inputs = document.querySelectorAll<HTMLInputElement>(SearchState.config.searchInputSelector);
		inputs.forEach(input => {
			if (input.type === 'search' || input.name?.toLowerCase().includes('search') || 
			    input.placeholder?.toLowerCase().includes('search') ||
			    input.closest('.search') || input.hasAttribute('data-search-input')) {
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

		// Create dropdown
		SearchState.dropdown = SearchDOM.createDropdown();
		SearchState.dropdown.addEventListener('click', SearchLogic.handleClick);

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
			if (SearchState.isOpen && 
			    !SearchState.dropdown?.contains(e.target as Node) && 
			    !SearchState.activeInput?.contains(e.target as Node)) {
				SearchDOM.hideDropdown();
			}
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

