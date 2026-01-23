import { Icons } from './components/Icons';
import { Config } from './config';
import { Lang } from './locals';
import { $ } from './utils/$.utils';
import { waitForElement, waitForElements } from './utils/dom-ready';
import { FilterKeyType, FilterStateType, FilterOptionType, FilterMetadataType, FiltersStateType, PaginationStateType, SortStateType, ProductsResponseDataType, FiltersResponseDataType, PriceRangeType, AFSConfigType, FilterValueType, ShopifyWindow, SpecialValueType, SortFieldType, SortOrderType, AppliedFilterType, ParsedUrlParamsType, LoggableData, FilterGroupStateType, ProductType, APIResponse, AFSInterfaceType, FilterItemsElement, SliderOptionsType, SliderSlideChangeEventDetailType, ProductVariantType, ProductModalElement, AFSInterface } from "./type";
import { findMatchingVariants, getSelectedOptions, isOptionValueAvailable, isVariantAvailable } from './utils/variant-util';
import { Log } from './utils/shared';

// Persistent map for filter group UI states (collapsed/search/lastUpdated)
const States = new Map<string, FilterGroupStateType>();

// Excluded query parameter keys (not processed as filters)
const EXCLUDED_QUERY_PARAMS = new Set<string>([FilterKeyType.SHOP, FilterKeyType.SHOP_DOMAIN, FilterKeyType.CPID]);

// ============================================================================
// PRICE FORMATTING UTILITY
// ============================================================================

/**
 * Format price to 2 decimal places without rounding up/down too much
 * Keeps prices accurate and consistent with backend aggregation values
 * @param value - Price value to format
 * @returns Formatted price with max 2 decimal places
 */
const formatPrice = (value: number): number => {
	if (typeof value !== 'number' || isNaN(value)) return 0;
	// Use toFixed(2) to limit to 2 decimal places, then parse back to number
	return parseFloat(value.toFixed(2));
};

// ============================================================================
// METADATA BUILDERS (For display only, not for state management)
// ============================================================================
const Metadata = {
	// Build metadata map from filters array (for display labels, types, etc.)
	buildFilterMetadata: (filters: FilterOptionType[]): Map<string, FilterMetadataType> => {
		const m = new Map<string, FilterMetadataType>();
		if (!Array.isArray(filters)) return m;
		filters.forEach(f => {
			if (f.handle) {
				// Store metadata for rendering (label, type, etc.)
				m.set(f.handle, {
					label: f.label || f.queryKey || f.optionKey || f.handle,
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
const FilterState: FilterStateType = {
	shop: null,
	// Filters: standard filters (fixed keys) + dynamic option filters (handles as keys)
	// Example: { vendor: [], ef4gd: ["red"], pr_a3k9x: ["M"], search: '', priceRange: null }
	filters: { vendor: [], productType: [], tags: [], collections: [], search: '', priceRange: null },
	products: [],
	collections: [],
	selectedCollection: { id: null, sortBy: null },
	pagination: { page: 1, limit: Config.PAGE_SIZE, total: 0, totalPages: 0 },
	sort: { field: 'best-selling', order: 'asc' },
	loading: false,
	availableFilters: [],
	// Metadata maps (for display only, not for state management)
	filterMetadata: new Map<string, FilterMetadataType>(), // handle -> { label, type, queryKey, optionKey }
	// Fallback products from Liquid (to prevent blank screen when API fails)
	fallbackProducts: [],
	// Fallback pagination from Liquid (for proper pagination controls when API fails)
	fallbackPagination: { currentPage: 1, totalPages: 1, totalProducts: 0 },
	// Flag to track if we're using fallback mode (API failed)
	usingFallback: false,
	// Money formatting from Shopify
	moneyFormat: null,
	moneyWithCurrencyFormat: null,
	currency: null,
	scrollToProductsOnFilter: false,
	// Handle-based keys for range filters (provided by server filter config)
	priceRangeHandle: null,
};

// ============================================================================
// URL PARSER (Optimized with lookup maps)
// ============================================================================
const UrlManager = {
	parse(): ParsedUrlParamsType {
		const url = new URL(window.location.href);
		const params: ParsedUrlParamsType = {};
		// Price range can come from:
		// - New (server-supported): priceMin / priceMax
		// - Legacy (backward compat): priceRange=min-max or price=min-max
		let parsedPriceMin: number | undefined;
		let parsedPriceMax: number | undefined;

		url.searchParams.forEach((value, key) => {
			if (EXCLUDED_QUERY_PARAMS.has(key)) return;

			// Standard filters
			if ($.isVendorKey(key)) params.vendor = $.split(value);
			else if ($.isProductTypeKey(key)) params.productType = $.split(value);
			else if ($.isTagKey(key)) params.tags = $.split(value);
			else if ($.isCollectionKey(key)) params.collections = $.split(value);
			else if ($.equals(key, FilterKeyType.SEARCH)) params.search = value;
			// Support Shopify search page 'q' parameter (map to 'search')
			else if ($.equals(key, 'q')) params.search = value;
			// Server-supported price range params
		else if ($.equals(key, FilterKeyType.PRICE_MIN)) {
			const v = formatPrice(parseFloat(value));
			if (!isNaN(v) && v >= 0) parsedPriceMin = v;
		}
		else if ($.equals(key, FilterKeyType.PRICE_MAX)) {
			const v = formatPrice(parseFloat(value));
			if (!isNaN(v) && v >= 0) parsedPriceMax = v;
		}
		// Legacy price range params: "min-max"
		else if ($.isPriceRangeKey(key)) {
			const parts = value.split('-');
			if (parts.length === 2) {
				const min = formatPrice(parseFloat(parts[0]));
				const max = formatPrice(parseFloat(parts[1]));
				if (!isNaN(min) && min >= 0) parsedPriceMin = min;
				if (!isNaN(max) && max >= 0) parsedPriceMax = max;
			}
			}
			else if ($.equals(key, FilterKeyType.PAGE)) params.page = parseInt(value, 10) || 1;
			else if ($.equals(key, FilterKeyType.LIMIT)) params.limit = parseInt(value, 10) || Config.PAGE_SIZE;
			else if ($.equals(key, FilterKeyType.SORT)) {
				// Handle sort parameter - can be "best-selling", "title-ascending", "price:asc", etc.
				const sortValue = value.toLowerCase().trim();
				if ($.isBestSelling(sortValue)) {
					params.sort = { field: SortFieldType.BEST_SELLING, order: SortOrderType.ASC };
				} else if (sortValue.includes('-')) {
					// New format: "field-direction" (e.g., "title-ascending")
					const [field, direction] = sortValue.split('-');
					const order = $.equalsAny(direction, SortOrderType.ASCENDING) ? SortOrderType.ASC : $.equalsAny(direction, SortOrderType.DESCENDING) ? SortOrderType.DESC : SortOrderType.DESC;
					params.sort = { field, order };
				} else {
					// Legacy format: "field:order" (backward compatibility)
					const [field, order] = value.split(':');
					params.sort = { field, order: ($.equalsAny(order, SortOrderType.ASC) ? SortOrderType.ASC : SortOrderType.DESC) as 'asc' | 'desc' };
				}
			}
			else {
				// Everything else is a handle (dynamic filter) - use directly, no conversion
				params[key] = $.split(value);
				Log.debug('Handle filter parsed directly', { handle: key, value });
			}
		});

		// Normalize price range into the state shape used by the UI (dual-handle slider).
		// Allow partial ranges (only min or only max) so deep links work even if one side is omitted.
		if (parsedPriceMin !== undefined || parsedPriceMax !== undefined) {
			params.priceRange = {
				min: parsedPriceMin,
				max: parsedPriceMax
			};
		}

		return params;
	},
	update(filters: FiltersStateType, pagination: PaginationStateType, sort: SortStateType): void {
		const url = new URL(window.location.href);
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
			// Price range: write as server-supported params
			else if ($.isPriceRangeKey(key) && value && typeof value === 'object' && !Array.isArray(value)) {
				const priceRange = value as PriceRangeType;
				const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? formatPrice(priceRange.min) : undefined;
				const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? formatPrice(priceRange.max) : undefined;
					if (FilterState.priceRangeHandle) {
						// Handle-style: {handle}=min-max
						const handleValue = `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`;
						url.searchParams.set(FilterState.priceRangeHandle, handleValue);
						Log.debug('Price range URL handle param set', { handle: FilterState.priceRangeHandle, value: handleValue });
					} else {
						// Backward compatibility
						if (min !== undefined) url.searchParams.set('priceMin', String(min));
						if (max !== undefined) url.searchParams.set('priceMax', String(max));
						Log.debug('Price range URL params set', { priceMin: min, priceMax: max });
					}
				}
				else if ($.equals(key, FilterKeyType.SEARCH) && typeof value === 'string' && value.trim()) {
					// For search template, use 'q' parameter (Shopify standard)
					// For other templates, use 'search' parameter
					const isSearchTemplate = (window as any).AFS_Config?.isSearchTemplate || false;
					const paramKey = isSearchTemplate ? 'q' : 'search';
					url.searchParams.set(paramKey, value.trim());
					Log.debug('Search URL param set', { key: paramKey, value: value.trim(), isSearchTemplate });
				}
			});
		}

		if (pagination && pagination.page > 1) {
			url.searchParams.set('page', String(pagination.page));
			Log.debug('Page URL param set', { page: pagination.page });
		}

		// Update sort parameter
		if (sort && sort.field) {
			if (sort.field === 'best-selling' || sort.field === 'bestselling') {
				url.searchParams.set('sort', 'best-selling');
			} else {
				// Convert to new format: "field-direction" (e.g., "title-ascending")
				const direction = $.equals(sort.order, SortOrderType.ASC) ? SortOrderType.ASCENDING : SortOrderType.DESCENDING;
				url.searchParams.set('sort', `${sort.field}-${direction}`);
			}
			Log.debug('Sort URL param set', { field: sort.field, order: sort.order });
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
	baseURL: 'https://fstaging.digitalcoo.com/storefront', // Default, should be set via config
	__v: 'v2.0',
	__id: '01-13-2026',
	cache: new Map<string, ProductsResponseDataType>(),
	timestamps: new Map<string, number>(),
	pending: new Map<string, Promise<ProductsResponseDataType>>(),

	key(filters: FiltersStateType, pagination: PaginationStateType, sort: SortStateType): string {
		// Defensive checks for minification safety - ensure pagination and sort are defined
		const page = (pagination && typeof pagination === 'object' && typeof pagination.page === 'number') ? pagination.page : 1;
		const limit = (pagination && typeof pagination === 'object' && typeof pagination.limit === 'number') ? pagination.limit : (Config.PAGE_SIZE || 24);
		const sortField = (sort && typeof sort === 'object' && sort.field) ? sort.field : 'best-selling';
		const sortOrder = (sort && typeof sort === 'object' && sort.order) ? sort.order : 'asc';
		return `${page}-${limit}-${sortField}-${sortOrder}-${JSON.stringify(filters)}`;
	},

	get(key: string): ProductsResponseDataType | null {
		const ts = this.timestamps.get(key);
		if (!ts || Date.now() - ts > Config.CACHE_TTL) {
			this.cache.delete(key);
			this.timestamps.delete(key);
			return null;
		}
		return this.cache.get(key) || null;
	},

	set(key: string, value: ProductsResponseDataType): void {
		this.cache.set(key, value);
		this.timestamps.set(key, Date.now());
	},

	async fetch(url: string, timeout: number = Config.TIMEOUT): Promise<APIResponse<ProductsResponseDataType | FiltersResponseDataType>> {
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
			const data = await res.json() as APIResponse<ProductsResponseDataType | FiltersResponseDataType>;
			Log.debug('Fetch success', { url, hasData: !!data });
			return data;
		} catch (e) {
			clearTimeout(timeoutId);
			if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timeout');
			Log.error('Fetch failed', { url, error: e instanceof Error ? e.message : String(e) });
			throw e;
		}
	},

	async products(filters: FiltersStateType, pagination: PaginationStateType, sort: SortStateType): Promise<ProductsResponseDataType> {
		if (!this.baseURL) throw new Error('API baseURL not set. Call AFS.init({ apiBaseUrl: "..." })');
		if (!FilterState.shop) throw new Error('Shop not set');

		// Defensive checks for minification safety - ensure pagination and sort are defined
		const safePagination: PaginationStateType = (pagination && typeof pagination === 'object') ? pagination : {
			page: FilterState.pagination?.page || 1,
			limit: FilterState.pagination?.limit || Config.PAGE_SIZE || 24,
			total: FilterState.pagination?.total || 0,
			totalPages: FilterState.pagination?.totalPages || 0
		};
		const safeSort: SortStateType = (sort && typeof sort === 'object') ? sort : {
			field: FilterState.sort?.field || 'best-selling',
			order: FilterState.sort?.order || 'asc'
		};

		const key = this.key(filters, safePagination, safeSort);
		const cached = this.get(key);
		if (cached) {
			Log.debug('Cache hit', { key });
			return cached;
		}

		// Deduplication: return existing promise if same request
		if (this.pending.has(key)) {
			Log.debug('Request deduplication', { key });
			return this.pending.get(key)!;
		}

		const params = new URLSearchParams();
		params.set('shop', FilterState.shop);

		// Always send CPID if it exists - never drop it
		// CPID is server-managed and should always be sent to products API
		if (FilterState.selectedCollection?.id) {
			params.set('cpid', FilterState.selectedCollection.id);
			Log.debug('cpid sent to products API', { cpid: FilterState.selectedCollection.id, filters });
		} else {
			Log.warn('cpid not available in selectedCollection', { selectedCollection: FilterState.selectedCollection });
		}

		// Send ALL filters as direct query parameters using handles as keys
		// URL format: ?handle1=value1&handle2=value2
		// API format: ?handle1=value1&handle2=value2 (same as URL)
		Object.keys(filters).forEach(k => {
			const v = filters[k];
			if ($.empty(v)) return;

		// Direct params (search, price range)
		if ($.isPriceRangeKey(k) && v && typeof v === 'object' && !Array.isArray(v)) {
			const priceRange = v as PriceRangeType;
			const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? formatPrice(priceRange.min) : undefined;
			const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? formatPrice(priceRange.max) : undefined;
				if (FilterState.priceRangeHandle) {
					params.set(FilterState.priceRangeHandle, `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`);
				} else {
					// Backward compatibility
					if (min !== undefined) params.set('priceMin', String(min));
					if (max !== undefined) params.set('priceMax', String(max));
				}
			}
			else if (k === 'search' && typeof v === 'string' && v.trim()) {
				params.set(k, v.trim());
			}
			else {
				// ALL other filters (vendors, tags, collections, options) use handles as direct query params
				// k is already the handle (from FilterState.filters which uses handle as key)
				if (Array.isArray(v) && v.length > 0) {
					params.set(k, v.join(','));
					Log.debug('Filter sent as direct handle param', { handle: k, value: v.join(',') });
				} else if (typeof v === 'string') {
					params.set(k, v);
					Log.debug('Filter sent as direct handle param', { handle: k, value: v });
				}
			}
		});
		params.set('page', String(safePagination.page));
		params.set('limit', String(safePagination.limit));
		if (safeSort.field) {
			// Handle best-selling sort (no order needed, server handles it)
			if ($.isBestSelling(safeSort.field)) {
				params.set('sort', SortFieldType.BEST_SELLING);
			} else {
				// Convert to new format: "field-direction" (e.g., "title-ascending")
				const direction = $.equals(safeSort.order, SortOrderType.ASC) ? SortOrderType.ASCENDING : SortOrderType.DESCENDING;
				params.set('sort', `${safeSort.field}-${direction}`);
			}
		}

		const url = `${this.baseURL}/products?${params}`;
		Log.info('Fetching products', { url, shop: FilterState.shop, page: safePagination.page });
		DOM.showProductsSkeleton();

		const promise = this.fetch(url).then(res => {
			if (!res.success || !res.data) {
				Log.error('Invalid products response', { response: res });
				throw new Error(`Invalid products response: ${res.message || Lang.messages.unknownError}`);
			}
			const data = res.data as ProductsResponseDataType;
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
			Log.error('Products fetch failed', { error: e instanceof Error ? e.message : String(e), url });
			throw e;
		});
		DOM.showProductsSkeleton();
		this.pending.set(key, promise);
		return promise;
	},

	async filters(filters: FiltersStateType): Promise<FiltersResponseDataType> {
		if (!this.baseURL) throw new Error('API baseURL not set. Call AFS.init({ apiBaseUrl: "..." })');
		if (!FilterState.shop) throw new Error('Shop not set');

		const params = new URLSearchParams();
		params.set('shop', FilterState.shop);

		// Always send CPID if it exists - never drop it
		// CPID is server-managed and should always be sent to filters API
		if (FilterState.selectedCollection?.id) {
			params.set('cpid', FilterState.selectedCollection.id);
			Log.debug('cpid sent to filters API', { cpid: FilterState.selectedCollection.id, filters });
		} else {
			Log.warn('cpid not available in selectedCollection', { selectedCollection: FilterState.selectedCollection });
		}

		// When calculating aggregations for a specific filter, that filter should be excluded
		// from the query so we get all possible values based on other active filters
		const filtersForAggregation: FiltersStateType = { ...filters };

		// Send only the filters that should be included in aggregation query
		Object.keys(filtersForAggregation).forEach(k => {
			const v = filtersForAggregation[k];
			if ($.empty(v)) return;
			if (Array.isArray(v)) {
				params.set(k, v.join(','));
			} else if (k === 'search' && typeof v === 'string' && v.trim()) {
				params.set('search', v.trim());
			} else if (k === 'priceRange' && v && typeof v === 'object' && !Array.isArray(v)) {
				const priceRange = v as PriceRangeType;
				const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? priceRange.min : undefined;
				const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? priceRange.max : undefined;
				if (FilterState.priceRangeHandle) {
					params.set(FilterState.priceRangeHandle, `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`);
				} else {
					if (min !== undefined) params.set('priceMin', String(min));
					if (max !== undefined) params.set('priceMax', String(max));
				}
			}
		});

		// Debug: Log all params before constructing URL
		const allParams: Record<string, string> = {};
		params.forEach((value, key) => {
			allParams[key] = value;
		});
		Log.debug('All params for filters endpoint', {
			params: allParams
		});

		const url = `${this.baseURL}/filters?${params}`;
		Log.info('Fetching filters', { url, shop: FilterState.shop });

		DOM.showLoading();

		const res = await this.fetch(url);
		if (!res.success || !res.data) {
			Log.error('Invalid filters response', { response: res });
			throw new Error(`Invalid filters response: ${res.message || Lang.messages.unknownError}`);
		}

		// Validate response structure
		const data = res.data as FiltersResponseDataType;
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

	setBaseURL(url: string): void {
		this.baseURL = url;
	},

	buildFiltersFromUrl(urlParams: Record<string, any>): void {
		// This ensures filters endpoint receives the correct filters from URL
		// Support both 'search' and 'q' parameters (Shopify search page uses 'q')
		const searchQuery = urlParams.search || urlParams.q || '';
		FilterState.filters = {
			vendor: urlParams.vendor || [],
			productType: urlParams.productType || [],
			tags: urlParams.tags || [],
			collections: urlParams.collections || [],
			search: searchQuery,
			priceRange: urlParams.priceRange || null
		};

		// Add all handle-based filters (everything that's not a standard filter)
		Object.keys(urlParams).forEach(key => {
			if (!['vendor', 'productType', 'tags', 'collections', 'search', 'priceRange', 'page', 'limit', 'sort', 'cpid'].includes(key)) {
				const paramValue = urlParams[key];
				if (Array.isArray(paramValue)) {
					FilterState.filters[key] = paramValue;
				} else if (typeof paramValue === 'string') {
					FilterState.filters[key] = [paramValue];
				}
			}
		});
	},

	setPaginationFromUrl(urlParams: Record<string, any>): void {
		if (urlParams.page) {
			FilterState.pagination.page = urlParams.page;
		} else {
			// If no page in URL, use fallback pagination current page if available
			if (FilterState.fallbackPagination && FilterState.fallbackPagination.currentPage) {
				FilterState.pagination.page = FilterState.fallbackPagination.currentPage;
			}
		}
	},

	setSortFromUrl(urlParams: Record<string, any>): void {
		// Set sort from URL params or default to best-selling
		if (urlParams.sort) {
			const sortValue = typeof urlParams.sort === 'object' ? urlParams.sort.field : urlParams.sort;
			if (typeof sortValue === 'string') {
				const normalized = sortValue.toLowerCase().trim();
				if (normalized === 'best-selling' || normalized === 'bestselling') {
					FilterState.sort = { field: 'best-selling', order: 'asc' };
				} else if (normalized.includes('-')) {
					// New format: "field-direction" (e.g., "title-ascending")
					const [field, direction] = normalized.split('-');
					const order = $.equalsAny(direction, SortOrderType.ASCENDING) ? SortOrderType.ASC : $.equalsAny(direction, SortOrderType.DESCENDING) ? SortOrderType.DESC : SortOrderType.DESC;
					FilterState.sort = { field, order };
				} else {
					// Legacy format: "field:order" (backward compatibility)
					const [field, order] = sortValue.split(':');
					FilterState.sort = { field, order: (order || 'desc') as 'asc' | 'desc' };
				}
			} else if (typeof urlParams.sort === 'object' && urlParams.sort.field) {
				FilterState.sort = { field: urlParams.sort.field, order: urlParams.sort.order || 'desc' };
			}
		} else {
			// Default to best-selling if no sort in URL
			FilterState.sort = { field: 'best-selling', order: 'asc' };
		}
	},

};

// ============================================================================
// DOM RENDERER (Optimized, batched operations)
// ============================================================================

const DOM = {
	container: null as HTMLElement | null,
	filtersContainer: null as HTMLElement | null,
	productsContainer: null as HTMLElement | null,
	productsInfo: null as HTMLElement | null,
	productsGrid: null as HTMLElement | null,
	loading: null as HTMLElement[] | HTMLElement | null,
	sortContainer: null as HTMLElement | null,
	sortSelect: null as HTMLSelectElement | null,
	mobileFilterButton: null as HTMLButtonElement | null,
	mobileFilterClose: null as HTMLButtonElement | null,
	mobileFilterBackdrop: null as HTMLElement | null,
	mobileResultsButton: null as HTMLElement | null,

	init(containerSel: string, filtersSel: string | undefined, productsSel: string | undefined): void {
		// Validate container selector - must not be empty
		if (!containerSel || typeof containerSel !== 'string' || containerSel.trim() === '') {
			throw new Error('Container selector cannot be empty. Provide a valid selector or ensure [data-afs-container] exists in the DOM.');
		}

		this.container = document.querySelector<HTMLElement>(containerSel) || document.querySelector<HTMLElement>('[data-afs-container]');
		if (!this.container) {
			throw new Error(`Container not found. Selector: "${containerSel}". Please ensure the container element exists in the DOM.`);
		}

		this.container.setAttribute('data-afs-container', 'true');

		// Initialize search bar for search template
		this.initSearchBar();

		const main = this.container.querySelector<HTMLElement>('.afs-main-content') || $.el('div', 'afs-main-content');
		if (!main.parentNode) this.container.appendChild(main);

		// Only querySelector if selector is provided and not empty
		this.filtersContainer = (filtersSel && filtersSel.trim() !== '')
			? document.querySelector<HTMLElement>(filtersSel) || null
			: null;

		if (!this.filtersContainer) {
			this.filtersContainer = $.el('div', 'afs-filters-container');
		}

		// Move search bar above applied filters (for search template)
		// The search bar should appear before the applied filters section
		const searchBar = this.container.querySelector<HTMLElement>('[data-afs-search-bar]');
		if (searchBar) {
			// Remove from current position if it exists
			if (searchBar.parentNode) {
				searchBar.parentNode.removeChild(searchBar);
			}
			// Insert at the beginning of container (before applied filters and filters container)
			if (this.container && !searchBar.parentNode) {
				this.container.insertBefore(searchBar, this.container.firstChild);
			}
		}

		if (!this.filtersContainer.parentNode && main) main.appendChild(this.filtersContainer);

	// Ensure filters are closed by default on mobile
	if (window.innerWidth <= 767) {
		this.filtersContainer.classList.remove('afs-filters-container--open');
	}

	// Mobile filter close button will be created only when filters are rendered

		// Create backdrop overlay for mobile drawer (click outside to close)
		// Check if backdrop already exists
		this.mobileFilterBackdrop = this.container.querySelector<HTMLElement>('.afs-mobile-filter-backdrop');
		if (!this.mobileFilterBackdrop) {
			this.mobileFilterBackdrop = $.el('div', 'afs-mobile-filter-backdrop', {
				'data-afs-action': 'close-filters'
			});
			this.mobileFilterBackdrop.style.display = 'none';
			// Insert before main content so it appears behind drawer
			if (main.parentNode) {
				main.parentNode.insertBefore(this.mobileFilterBackdrop, main);
			} else {
				this.container.appendChild(this.mobileFilterBackdrop);
			}
		}

		// Only querySelector if selector is provided and not empty
		this.productsContainer = (productsSel && productsSel.trim() !== '')
			? document.querySelector<HTMLElement>(productsSel) || null
			: null;

		if (!this.productsContainer) {
			this.productsContainer = $.el('div', 'afs-products-container');
		}

		if (!this.productsContainer.parentNode && main) main.appendChild(this.productsContainer);

		this.productsInfo = $.el('div', 'afs-products-info');
		if (this.productsContainer) {
			this.productsContainer.insertBefore(this.productsInfo, this.productsContainer.firstChild);
		}

		// Mobile filter toggle button
		this.mobileFilterButton = $.el('button', 'afs-mobile-filter-button', {
			type: 'button',
			'data-afs-action': 'toggle-filters',
			'aria-label': Lang.buttons.toggleFilters
		}) as HTMLButtonElement;
		this.mobileFilterButton.innerHTML = `<span class="afs-mobile-filter-button__icon">☰</span> <span class="afs-mobile-filter-button__text">${Lang.buttons.filters}</span>`;
		if (this.productsInfo) {
			this.productsInfo.insertBefore(this.mobileFilterButton, this.productsInfo.firstChild);
		}

		// Sort dropdown - create and store reference
		this.sortContainer = $.el('div', 'afs-sort-container');
		const sortLabel = $.el('label', 'afs-sort-label', { 'for': 'afs-sort-label' });
		sortLabel.textContent = Lang.labels.sortBy;
		this.sortSelect = $.el('select', 'afs-sort-select', { 'data-afs-sort': 'true' }) as HTMLSelectElement;
		this.sortSelect.innerHTML = `
        <option value="${SortFieldType.BEST_SELLING}">${Lang.sortOptions.bestSelling}</option>
        <option value="title-${SortOrderType.ASCENDING}">${Lang.sortOptions.titleAsc}</option>
        <option value="title-${SortOrderType.DESCENDING}">${Lang.sortOptions.titleDesc}</option>
        <option value="price-${SortOrderType.ASCENDING}">${Lang.sortOptions.priceAsc}</option>
        <option value="price-${SortOrderType.DESCENDING}">${Lang.sortOptions.priceDesc}</option>
        <option value="created-${SortOrderType.ASCENDING}">${Lang.sortOptions.createdAsc}</option>
        <option value="created-${SortOrderType.DESCENDING}">${Lang.sortOptions.createdDesc}</option>
      `;
		this.sortContainer.appendChild(sortLabel);
		this.sortContainer.appendChild(this.sortSelect);
		if (this.productsInfo) {
			this.productsInfo.appendChild(this.sortContainer);
		}

		this.productsGrid = $.el('div', 'afs-products-grid');
		if (this.productsContainer) {
			this.productsContainer.appendChild(this.productsGrid);
		}
	},

	initSearchBar(): void {
		if (!this.container) return;

		const searchBar = this.container.querySelector<HTMLElement>('[data-afs-search-bar]');
		if (!searchBar) return;

		const searchInput = searchBar.querySelector<HTMLInputElement>('[data-afs-search-input]');
		const searchForm = searchBar.querySelector<HTMLFormElement>('[data-afs-search-form]');

		if (!searchInput || !searchForm) return;

		// Show search bar
		searchBar.style.display = '';

		// Set initial value from URL or config
		const urlParams = UrlManager.parse();
		const initialQuery = urlParams.q || urlParams.search || '';
		if (initialQuery) {
			searchInput.value = String(initialQuery);
		}

		// Handle form submission
		searchForm.addEventListener('submit', (e) => {
			e.preventDefault();
			const query = searchInput.value.trim();
			if (query) {
				// Update search filter
				FilterState.filters.search = query;
				FilterState.pagination.page = 1;
				UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
				DOM.scrollToProducts();
				DOM.showProductsSkeleton();
				Filters.apply();
			}
		});

		// Handle input change with debounce (longer on search template to reduce request load)
		const debounceDelay = ((window as any).AFS_Config?.isSearchTemplate) ? 400 : Config.DEBOUNCE;
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		searchInput.addEventListener('input', () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				const query = searchInput.value.trim();
				// Update search filter
				FilterState.filters.search = query;
				FilterState.pagination.page = 1;
				UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
				DOM.scrollToProducts();
				DOM.showProductsSkeleton();
				Filters.apply();
			}, debounceDelay);
		});

		// Sync search input with URL changes (back/forward navigation)
		const syncSearchInput = () => {
			const urlParams = UrlManager.parse();
			const currentQuery = String(urlParams.q || urlParams.search || '');
			if (searchInput.value !== currentQuery) {
				searchInput.value = currentQuery;
			}
		};

		// Listen for URL changes
		window.addEventListener('popstate', syncSearchInput);

		// Store reference to sync function for use in popstate handler
		(searchInput as any)._syncSearchInput = syncSearchInput;

		Log.debug('Search bar initialized', { hasInput: !!searchInput, hasForm: !!searchForm });
	},

	attachEvents(): void {
		if (!DOM.container) return;

		DOM.container.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const action = target.closest<HTMLElement>('[data-afs-action]')?.dataset.afsAction;
			const item = target.closest<HTMLElement>('.afs-filter-item');
			const checkbox = (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) ? target : item?.querySelector<HTMLInputElement>('.afs-filter-item__checkbox');
			const pagination = target.closest<HTMLButtonElement>('.afs-pagination__button');

			if (action === 'clear-all') {
				// Reset to initial state (standard filters only, handles will be removed dynamically)
				FilterState.filters = { vendor: [], productType: [], tags: [], collections: [], search: '', priceRange: null };
				// Keep CPID when clearing client-visible filters; CPID is server-managed
				if (FilterState.selectedCollection?.id) {
					Log.debug('Clear All: keeping server-managed cpid (not exposed to UI)');
				}
				FilterState.pagination.page = 1;
				UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
				// Scroll to top when clearing all filters
				DOM.scrollToProducts();
				// Show loading skeleton immediately (before debounce) - only products, filters will update via Filters.process
				DOM.showProductsSkeleton();
				Filters.apply();
			}
			else if (action === 'toggle-filters' || action === 'close-filters') {
				if (action === 'close-filters') {
					// Explicitly close filters drawer
					DOM.toggleMobileFilters();
				} else {
					// Toggle mobile filters drawer
					DOM.toggleMobileFilters();
				}
			}
			else if (target.closest<HTMLElement>('.afs-applied-filter-chip__remove')) {
				const chip = target.closest<HTMLElement>('.afs-applied-filter-chip');
				const removeBtn = chip?.querySelector<HTMLElement>('.afs-applied-filter-chip__remove');
				const key = removeBtn?.getAttribute('data-afs-filter-key');
				const value = removeBtn?.getAttribute('data-afs-filter-value');
				if (!key) return;

				if ($.equals(key, FilterKeyType.CPID)) {
					if (FilterState.selectedCollection?.id) {
						Log.debug('cpid removed, cleared selectedCollection');
					}
					UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
					DOM.scrollToProducts();
					DOM.showProductsSkeleton();
					Filters.apply();
					return;
				}

				if ($.equals(key, FilterKeyType.SEARCH)) {
					FilterState.filters.search = '';
					FilterState.pagination.page = 1;
					UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
					DOM.scrollToProducts();
					DOM.showProductsSkeleton();
					Filters.apply();
					return;
				}

				if ($.isPriceRangeKey(key)) {
					FilterState.filters.priceRange = null;
					FilterState.pagination.page = 1;
					UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
					DOM.scrollToProducts();
					DOM.showProductsSkeleton();
					Filters.apply();
					return;
				}

				// Default: toggle-able filters
				if (value) {
					Filters.toggle(key, value);
				}
			}
			// Sort dropdown is handled by change event (see below)
			else if (checkbox && item) {
				e.preventDefault(); // Prevent default checkbox toggle behavior
				e.stopPropagation(); // Stop event bubbling

				// Get handle from data attribute (handle is stored directly)
				const handle = item.getAttribute('data-afs-filter-handle') || item.parentElement?.getAttribute('data-afs-filter-handle');
				const value = item.getAttribute('data-afs-filter-value');
				const allowMultiselect = item.getAttribute('data-afs-filter-multiselect') || item.parentElement?.getAttribute('data-afs-filter-multiselect');

				if (!handle || !value) {
					Log.warn('Invalid filter item clicked', { handle, value });
					return;
				}

				Log.debug('Filter toggle', { handle, value, currentChecked: checkbox.checked });

				// remove other selections if multiselect not allowed
				if (allowMultiselect === '0' || allowMultiselect === 'false') {
					FilterState.filters[handle] = [];
				}
				Filters.toggle(handle, value);
			}
			else if (pagination && !pagination.disabled) {
				const page = parseInt(pagination.getAttribute('data-afs-page') || '0', 10);
				if (page && page > 0) {
					// In fallback mode, read current page from URL to ensure accuracy
					if (FilterState.usingFallback) {
						const urlParams = UrlManager.parse();
						const currentPage = urlParams.page || FilterState.pagination.page || 1;
						// Calculate the correct next/previous page
						FilterState.pagination.page = page;
					} else {
						FilterState.pagination.page = page;
					}
					UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
					// Scroll to top when pagination changes
					DOM.scrollToProducts();
					// Show loading skeleton immediately (before debounce) - only products, not filters
					DOM.showProductsSkeleton();
					// Only fetch products, not filters (filters haven't changed)
					Filters.applyProductsOnly();
				}
			}
			else if (target.closest<HTMLElement>('.afs-filter-group__clear')) {
				e.preventDefault();
				e.stopPropagation();
				const clearBtn = target.closest<HTMLElement>('.afs-filter-group__clear');
				if (!clearBtn) return;

				const handle = clearBtn.getAttribute('data-afs-filter-handle');
				if (!handle) return;

				// Check if this is a collection filter and if cpid should be cleared
				const metadata = FilterState.filterMetadata.get(handle);
				const isCollectionFilter = ($.isCollectionOptionType(metadata?.optionType) || $.isCollectionKey(handle));

				// Remove the filter from FilterState.filters
				if (FilterState.filters[handle]) {

					delete FilterState.filters[handle];
					Log.debug('Filter cleared', { handle, isCollectionFilter });

					// Update URL
					UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);

					// Scroll to top and show loading - only products, filters will update via Filters.process
					DOM.scrollToProducts();
					DOM.showProductsSkeleton();

					// Apply filters to refresh products and filters
					Filters.apply();
				}
			}
			else if (target.closest<HTMLElement>('.afs-filter-group__toggle')) {
				e.preventDefault();
				e.stopPropagation();
				const group = target.closest<HTMLElement>('.afs-filter-group');
				if (!group) return;

				const collapsed = group.getAttribute('data-afs-collapsed') === 'true';
				const collapsedState = !collapsed;
				group.setAttribute('data-afs-collapsed', collapsedState ? 'true' : 'false');

				// Persist collapse state in States Map with improved error handling
				const stateKey = group.getAttribute('data-afs-filter-key');
				if (stateKey) {
					try {
						// Get or create state
						const state = States.get(stateKey) || {};
						state.collapsed = collapsedState;
						state.lastUpdated = Date.now();
						States.set(stateKey, state);

						// Also persist to sessionStorage for page refresh persistence
						try {
							const stateKey = `afs_filter_state_${group.getAttribute('data-afs-filter-handle')}`;
							sessionStorage.setItem(stateKey, JSON.stringify({ collapsed: collapsedState }));
						} catch (e) {
							// SessionStorage might be disabled, ignore
							Log.debug('Could not persist to sessionStorage', { error: e instanceof Error ? e.message : String(e) });
						}
					} catch (error) {
						Log.error('Failed to persist filter state', {
							stateKey,
							error: error instanceof Error ? error.message : String(error)
						});
					}
				}

				// Update toggle button aria-expanded
				const toggle = group.querySelector<HTMLButtonElement>('.afs-filter-group__toggle');
				if (toggle) {
					toggle.setAttribute('aria-expanded', collapsedState ? 'false' : 'true');
				}

				// Update icon
				const icon = group.querySelector<HTMLElement>('.afs-filter-group__icon');
				if (icon) {
					// Update inline SVG HTML
					icon.innerHTML = collapsedState
						? (Icons.rightArrow || '')
						: (Icons.downArrow || '');
				}

				// In top bar layout, close other open filters when opening a new one (accordion behavior)
				const isTopBarLayout = this.container?.getAttribute('data-afs-layout') === 'top';
				if (isTopBarLayout && !collapsedState) {
					// Close all other filter groups
					const allGroups = this.filtersContainer?.querySelectorAll<HTMLElement>('.afs-filter-group');
					allGroups?.forEach(otherGroup => {
						if (otherGroup !== group && otherGroup.getAttribute('data-afs-collapsed') === 'false') {
							otherGroup.setAttribute('data-afs-collapsed', 'true');
							const otherToggle = otherGroup.querySelector<HTMLButtonElement>('.afs-filter-group__toggle');
							const otherIcon = otherGroup.querySelector<HTMLElement>('.afs-filter-group__icon');
							if (otherToggle) otherToggle.setAttribute('aria-expanded', 'false');
							if (otherIcon) otherIcon.innerHTML = Icons.rightArrow || '';
							
							// Update state
							const otherStateKey = otherGroup.getAttribute('data-afs-filter-key');
							if (otherStateKey) {
								const otherState = States.get(otherStateKey) || {};
								otherState.collapsed = true;
								States.set(otherStateKey, otherState);
							}
						}
					});
				}

				// Content visibility is handled by CSS via data-afs-collapsed attribute
				Log.debug('Filter group toggled', { collapsed: collapsedState, stateKey });
			}
			else if (target.closest<HTMLElement>('.afs-product-card__quick-add')) {
				e.preventDefault();
				e.stopPropagation();
				const btn = target.closest<HTMLButtonElement>('.afs-product-card__quick-add');
				if (!btn || btn.disabled) return;
				const handle = btn.getAttribute('data-product-handle');
				const productId = btn.getAttribute('data-product-id');
				if (handle) {
					QuickAdd.add(handle, productId);
				}
			}
			else if (target.closest<HTMLElement>('.afs-product-card__quick-view')) {
				e.preventDefault();
				e.stopPropagation();
				const btn = target.closest<HTMLButtonElement>('.afs-product-card__quick-view');
				if (!btn) return;
				const handle = btn.getAttribute('data-product-handle');
				if (handle) {
					handleQuickViewClick(handle)
				}
			}
		});

		// Search input
		DOM.container.addEventListener('input', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('afs-filter-group__search-input')) {
				const searchInput = target as HTMLInputElement;
				const term = searchInput.value.toLowerCase();
				const items = target.closest<HTMLElement>('.afs-filter-group')?.querySelector<FilterItemsElement>('.afs-filter-group__items');
				if (items?._items) {
					items.querySelectorAll<HTMLElement>('.afs-filter-item').forEach((el: HTMLElement, i: number) => {
						const item = items._items?.[i];
						if (item) {
							// Search by label (for display), but filtering still uses value
							const searchText = $.str(typeof item === 'string' ? item : (item.label || item.value || '')).toLowerCase();
							el.style.display = !term || searchText.includes(term) ? '' : 'none';
						}
					});
				}
			}
		});

		// Click outside to close filter overlays in top bar mode
		document.addEventListener('click', (e) => {
			const isTopBarLayout = this.container?.getAttribute('data-afs-layout') === 'top';
			if (!isTopBarLayout) return;
			
			const target = e.target as HTMLElement;
			// Don't close if clicking inside a filter group (including content)
			if (target.closest('.afs-filter-group')) return;
			
			// Close all open filter groups
			const openGroups = this.filtersContainer?.querySelectorAll<HTMLElement>('.afs-filter-group[data-afs-collapsed="false"]');
			openGroups?.forEach(group => {
				group.setAttribute('data-afs-collapsed', 'true');
				const toggle = group.querySelector<HTMLButtonElement>('.afs-filter-group__toggle');
				const icon = group.querySelector<HTMLElement>('.afs-filter-group__icon');
				if (toggle) toggle.setAttribute('aria-expanded', 'false');
				if (icon) icon.innerHTML = Icons.rightArrow || '';
				
				// Update state
				const stateKey = group.getAttribute('data-afs-filter-key');
				if (stateKey) {
					const state = States.get(stateKey) || {};
					state.collapsed = true;
					States.set(stateKey, state);
				}
			});
		});

		// Helper function to handle sort change
		const handleSortChange = (select: HTMLSelectElement): void => {
			const sortValue = select.value;
			if (!sortValue) return;

			Log.info('Sort dropdown changed', { sortValue, currentSort: FilterState.sort });

			// Calculate new sort state
			// New format: "title-ascending", "price-descending", etc.
			let newSort: SortStateType;
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
				newSort = { field, order: (order || 'desc') as 'asc' | 'desc' };
			}

			// Always update state and call API when sort is selected
			// (even if value is same, user explicitly selected it)
			FilterState.sort = newSort;
			FilterState.pagination.page = 1;
			UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
			Log.info('Calling applyProductsOnly after sort change', { sort: FilterState.sort });
			// Show loading skeleton immediately (before debounce) - only products, not filters
			DOM.scrollToProducts();
			DOM.showProductsSkeleton();
			// Only fetch products, not filters (filters haven't changed)
			Filters.applyProductsOnly();
		};

		// Store the previous value to detect changes
		let previousSortValue: string | null = null;

		// Track when select is focused to capture initial value
		DOM.container.addEventListener('focus', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('afs-sort-select')) {
				previousSortValue = (target as HTMLSelectElement).value;
			}
		}, true);

		// Sort dropdown change event (fires when value changes)
		DOM.container.addEventListener('change', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('afs-sort-select')) {
				const select = target as HTMLSelectElement;
				handleSortChange(select);
				previousSortValue = select.value;
			}
		});

		// Also listen for blur event (fires when dropdown closes)
		// This catches cases where user selects the same option (change event doesn't fire)
		DOM.container.addEventListener('blur', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('afs-sort-select')) {
				const select = target as HTMLSelectElement;
				const currentValue = select.value;

				// If value is different from previous, or if change event didn't fire
				// (previousSortValue might be null on first interaction)
				if (currentValue && currentValue !== previousSortValue) {
					// Small delay to ensure change event has a chance to fire first
					// Use requestAnimationFrame for better timing instead of fixed timeout
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							// Double-check: if value still doesn't match state, trigger change
							let currentSortValue: string;
							if ($.isBestSelling(FilterState.sort.field)) {
								currentSortValue = SortFieldType.BEST_SELLING;
							} else {
								// Convert to new format: "field-direction" (e.g., "title-ascending")
								const direction = $.equals(FilterState.sort.order, SortOrderType.ASC) ? SortOrderType.ASCENDING : SortOrderType.DESCENDING;
								currentSortValue = `${FilterState.sort.field}-${direction}`;
							}

							if (currentValue !== currentSortValue) {
								handleSortChange(select);
							}
						});
					});
				}
				previousSortValue = currentValue;
			}
		}, true);

		window.addEventListener('popstate', () => {
			// Sync search input if it exists
			const searchInput = DOM.container?.querySelector<HTMLInputElement>('[data-afs-search-input]');
			if (searchInput && (searchInput as any)._syncSearchInput) {
				(searchInput as any)._syncSearchInput();
			}

			const params = UrlManager.parse();

			// Store old state to detect if filters changed
			const oldFilters = JSON.stringify(FilterState.filters);
			const oldPage = FilterState.pagination.page;
			const oldSort = JSON.stringify(FilterState.sort);

			// Rebuild filters from params (includes standard filters + handles)
			// Support both 'search' and 'q' parameters (Shopify search page uses 'q')
			const searchQuery = String(params.search || params.q || '');
			FilterState.filters = {
				vendor: params.vendor || [],
				productType: params.productType || [],
				tags: params.tags || [],
				collections: params.collections || [],
				search: searchQuery,
				priceRange: params.priceRange || null
			};
			// Add all handle-based filters (everything that's not a standard filter)
			Object.keys(params).forEach(key => {
				if (!['vendor', 'productType', 'tags', 'collections', 'search', 'priceRange', 'page', 'limit', 'sort'].includes(key)) {
					const paramValue = params[key];
					if (Array.isArray(paramValue)) {
						FilterState.filters[key] = paramValue;
					} else if (typeof paramValue === 'string') {
						FilterState.filters[key] = [paramValue];
					}
				}
			});

			// Normalize handle-based price param into FilterState.filters.priceRange for slider UI
			const priceRangeFilterValue = FilterState.priceRangeHandle ? FilterState.filters[FilterState.priceRangeHandle] : null;
			if (
				FilterState.priceRangeHandle &&
				Array.isArray(priceRangeFilterValue) &&
				priceRangeFilterValue.length > 0
			) {
				const raw = String(priceRangeFilterValue[0] || '');
				const parts = raw.split('-');
				if (parts.length === 2) {
					const min = parts[0].trim() ? parseInt(parts[0], 10) : undefined;
					const max = parts[1].trim() ? parseInt(parts[1], 10) : undefined;
					const hasMin = typeof min === 'number' && !isNaN(min) && min >= 0;
					const hasMax = typeof max === 'number' && !isNaN(max) && max >= 0;
					if (hasMin || hasMax) {
						FilterState.filters.priceRange = {
							min: hasMin ? min : undefined,
							max: hasMax ? max : undefined
						};
						delete FilterState.filters[FilterState.priceRangeHandle];
					}
				}
			}

			const newPage = params.page || FilterState.pagination.page;
			if (newPage !== oldPage) {
				FilterState.pagination.page = newPage;
			}

			// Update sort from URL params or default to best-selling
			if (params.sort) {
				const sortValue = typeof params.sort === 'object' ? params.sort.field : params.sort;
				if (typeof sortValue === 'string') {
					const normalized = sortValue.toLowerCase().trim();
					if (normalized === 'best-selling' || normalized === 'bestselling') {
						FilterState.sort = { field: 'best-selling', order: 'asc' };
					} else if (normalized.includes('-')) {
						// New format: "field-direction" (e.g., "title-ascending")
						const [field, direction] = normalized.split('-');
						const order = $.equalsAny(direction, SortOrderType.ASCENDING) ? SortOrderType.ASC : $.equalsAny(direction, SortOrderType.DESCENDING) ? SortOrderType.DESC : SortOrderType.DESC;
						FilterState.sort = { field, order };
					} else {
						// Legacy format: "field:order" (backward compatibility)
						const [field, order] = sortValue.split(':');
						FilterState.sort = { field, order: (order || 'desc') as 'asc' | 'desc' };
					}
				} else if (typeof params.sort === 'object' && params.sort.field) {
					FilterState.sort = { field: params.sort.field, order: params.sort.order || 'desc' };
				}
			} else {
				// Default to best-selling if no sort in URL
				FilterState.sort = { field: 'best-selling', order: 'asc' };
			}

			// Check if filters changed
			const newFilters = JSON.stringify(FilterState.filters);
			const newSort = JSON.stringify(FilterState.sort);
			const filtersChanged = oldFilters !== newFilters;
			const onlySortOrPageChanged = !filtersChanged && (newSort !== oldSort || newPage !== oldPage);

			// Only fetch filters if filters actually changed
			if (onlySortOrPageChanged) {
				Filters.applyProductsOnly();
			} else {
				Filters.apply();
			}
		});
	},

	// Hide filters container (when using fallback mode)
	hideFilters(): void {
		if (this.filtersContainer) {
			this.filtersContainer.style.display = 'none';
			// Remove mobile filter close button when hiding filters
			if (this.mobileFilterClose && this.mobileFilterClose.parentNode) {
				this.mobileFilterClose.remove();
				this.mobileFilterClose = null;
			}
			Log.debug('Filters container hidden');
		}
	},

	// Show filters container
	showFilters(): void {
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

	// Toggle mobile filters drawer
	toggleMobileFilters(): void {
		if (!this.filtersContainer) return;

		const isOpen = this.filtersContainer.classList.contains('afs-filters-container--open');

		if (isOpen) {
			// Close drawer
			this.filtersContainer.classList.remove('afs-filters-container--open');
			document.body.classList.remove('afs-filters-open');

			// Show mobile results button again if on mobile
			if (window.innerWidth <= 767 && this.mobileResultsButton && FilterState.pagination.total > 0) {
				this.mobileResultsButton.classList.add('afs-mobile-results-button--visible');
			}

			// Hide backdrop
			if (this.mobileFilterBackdrop) {
				this.mobileFilterBackdrop.style.display = 'none';
			}

			// Restore scroll position
			const scrollY = document.body.style.top;
			document.body.style.overflow = '';
			document.body.style.position = '';
			document.body.style.width = '';
			document.body.style.height = '';
			document.body.style.top = '';
			document.body.style.removeProperty('overflow');
			document.body.style.removeProperty('position');
			document.body.style.removeProperty('width');
			document.body.style.removeProperty('height');
			document.body.style.removeProperty('top');

			if (scrollY) {
				window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
			}
		} else {
			// Open drawer
			this.filtersContainer.classList.add('afs-filters-container--open');
			document.body.classList.add('afs-filters-open');

			// Hide mobile results button when drawer is open
			if (this.mobileResultsButton) {
				this.mobileResultsButton.classList.remove('afs-mobile-results-button--visible');
			}

			// Show backdrop with smooth animation
			if (this.mobileFilterBackdrop) {
				this.mobileFilterBackdrop.style.display = 'block';
				// Force reflow to trigger transition
				this.mobileFilterBackdrop.offsetHeight;
			}

			// Store current scroll position and prevent body scroll
			const scrollY = window.scrollY;
			document.body.style.position = 'fixed';
			document.body.style.top = `-${scrollY}px`;
			document.body.style.width = '100%';
			document.body.style.maxWidth = '100vw';
			document.body.style.height = '100%';
			document.body.style.overflow = 'hidden';
		}

		Log.debug('Mobile filters drawer toggled', { isOpen: !isOpen });
	},

	// Fastest filter rendering (batched)
	renderFilters(filters: FilterOptionType[]): void {
		if (!this.filtersContainer || !Array.isArray(filters)) return;

		// Hide filters skeleton when rendering real filters
		this.hideFiltersSkeleton();

		// Save States with improved persistence (reuse module-level `States` map)
		States.clear();
		this.filtersContainer.querySelectorAll('.afs-filter-group').forEach(g => {
			const key = g.getAttribute('data-afs-filter-key');
			if (key) {
				const searchInput = g.querySelector<HTMLInputElement>('.afs-filter-group__search-input');
				const collapsed = g.getAttribute('data-afs-collapsed') === 'true';
				const search = searchInput?.value || '';

				// Get existing state to preserve other properties
				const existingState = States.get(key);
				States.set(key, {
					...existingState,
					collapsed,
					search,
					// Add timestamp for state freshness tracking
					lastUpdated: Date.now()
				} as FilterGroupStateType & { lastUpdated?: number });
			}
		});

		// Clear and rebuild in one batch
		$.clear(this.filtersContainer);

		const validFilters = filters.filter(f => {
			if (!f) return false;
			if ($.isPriceRangeOptionType(f.optionType)) {
				return f.range && typeof f.range.min === 'number' && typeof f.range.max === 'number' && f.range.max > f.range.min;
			}
			return f.values && f.values.length > 0;
		});
		Log.debug('Rendering filters', {
			total: filters.length,
			valid: validFilters.length,
			filtersWithSearchable: validFilters.filter(f => f.searchable).length,
			filtersWithCollapsed: validFilters.filter(f => f.collapsed).length
		});

	if (validFilters.length === 0) {
		Log.warn('No valid filters to render');
		// Remove mobile filter close button when no filters
		if (this.mobileFilterClose && this.mobileFilterClose.parentNode) {
			this.mobileFilterClose.remove();
			this.mobileFilterClose = null;
		}
		return;
	}

	// Create mobile filter close button only when there are filters
	if (!this.mobileFilterClose) {
		this.mobileFilterClose = $.el('button', 'afs-mobile-filter-close', {
			type: 'button',
			'data-afs-action': 'close-filters',
			'aria-label': Lang.buttons.closeFilters || 'Close filters'
		}) as HTMLButtonElement;
		// Don't set innerHTML - CSS ::before pseudo-element adds the X
		this.mobileFilterClose.style.display = 'none'; // Hidden on desktop
	}

		const fragment = document.createDocumentFragment();

		validFilters.forEach(filter => {
			// Handle price range filters separately
			if ($.isPriceRangeOptionType(filter.optionType)) {
				const group = this.createPriceRangeGroup(filter, States);
				if (group) fragment.appendChild(group);
				return;
			}

			// For option filters, use filter.handle (option handle like 'ef4gd')
			// For standard filters, use queryKey or key
			// Priority: handle (option handle) > queryKey > key
			let handle: string | undefined;
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
				type: filter.optionType,
				optionType: filter.optionType,
				optionKey: filter.optionKey,
				isOptionFilter: !!(filter.optionType || filter.optionKey)
			});

			const group = $.el('div', 'afs-filter-group', { 'data-afs-filter-type': filter.optionType || '' });
			group.setAttribute('data-afs-filter-handle', handle);

			const stateKey = handle;
			group.setAttribute('data-afs-filter-key', stateKey);

			const saved = States.get(stateKey);
			// Check collapsed state: saved state takes precedence, then filter.collapsed, default to false
			// In top bar layout, force all filters to be collapsed (ignore saved state)
			const isTopBarLayout = this.container?.getAttribute('data-afs-layout') === 'top';
			const defaultCollapsed = isTopBarLayout ? true : (filter.collapsed === true || filter.collapsed === 'true' || filter.collapsed === 1);
			// In top bar mode, always start collapsed (ignore saved state)
			const collapsed = isTopBarLayout ? true : (saved?.collapsed !== undefined ? saved.collapsed : defaultCollapsed);
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
			const toggle = $.el('button', 'afs-filter-group__toggle', {
				type: 'button',
				'aria-expanded': !collapsed ? 'true' : 'false',
				'title': filter.tooltipContent || `Toggle ${filter.label || handle} filter`,
			});
			const icon = $.el('span', 'afs-filter-group__icon');
			// Use inline SVG HTML for better CSS control
			icon.innerHTML = collapsed ? (Icons.rightArrow || '') : (Icons.downArrow || '');
			toggle.appendChild(icon);
			toggle.appendChild($.txt($.el('label', 'afs-filter-group__label', {
				'for': 'afs-filter-group__label'
			}), filter.label || filter.optionType || ''));
			header.appendChild(toggle);

			// Add clear button next to the label (only show if filter has active values)
			const filterValue = FilterState.filters[handle];
			const hasActiveValues = filterValue && (
				Array.isArray(filterValue) ? filterValue.length > 0 :
					typeof filterValue === 'object' && !Array.isArray(filterValue) ? Object.keys(filterValue).length > 0 :
						Boolean(filterValue)
			);
			if (hasActiveValues) {
				const clearBtn = $.el('button', 'afs-filter-group__clear', {
					type: 'button',
					'aria-label': `${Lang.buttons.clear} ${filter.label || handle} filters`,
					'data-afs-filter-handle': handle
				});
				clearBtn.textContent = Lang.buttons.clear;
				clearBtn.title = `${Lang.buttons.clear} ${filter.label || handle} filters`;
				header.appendChild(clearBtn);
			}

			group.appendChild(header);

			// Content
			const content = $.el('div', 'afs-filter-group__content');
			// Check searchable: check for true, any truthy value that indicates searchable
			const isSearchable = filter.searchable === true || (typeof filter.searchable === 'string' && filter.searchable.toLowerCase() === 'true');

			if (isSearchable) {
				const searchContainer = $.el('div', 'afs-filter-group__search');
				const search = $.el('input', 'afs-filter-group__search-input', {
					'type': 'text',
					'placeholder': filter.searchPlaceholder || 'Search...',
					'aria-label': `${Lang.labels.search}${filter.label || handle}`,
					'name': `afs-search-${handle}`
				}) as HTMLInputElement;
				if (saved?.search) search.value = saved.search;
				searchContainer.appendChild(search);
				content.appendChild(searchContainer);
				Log.debug('Search input added', { handle, label: filter.label, searchable: filter.searchable });
			}

			const items = $.el('div', 'afs-filter-group__items', {
				'data-afs-filter-handle': handle,
				'data-afs-filter-multiselect': $.isMultiSelect(filter) ? '1' : '0',
				'data-afs-filter-display-type': $.toLowerCase(filter.displayType || 'CHECKBOX'),
			}) as FilterItemsElement;
			items._items = filter.values; // Store directly, no JSON

			// Create items fragment
			const itemsFragment = document.createDocumentFragment();
			if (filter.values) {
				filter.values.forEach((item, index) => {
					const itemEl = this.createFilterItem(handle, item, filter, index);
					if (itemEl) itemsFragment.appendChild(itemEl);
				});
			}
			items.appendChild(itemsFragment);
			content.appendChild(items);
			group.appendChild(content);

			fragment.appendChild(group);
		});

	if (fragment.children.length > 0) {
		this.filtersContainer.appendChild(fragment);
		
		// Insert mobile filter close button at the beginning of filters container
		// Only insert if it doesn't already have a parent (prevent duplicates)
		if (this.mobileFilterClose) {
			// Remove from current parent if it exists elsewhere
			if (this.mobileFilterClose.parentNode && this.mobileFilterClose.parentNode !== this.filtersContainer) {
				this.mobileFilterClose.parentNode.removeChild(this.mobileFilterClose);
			}
			// Only insert if not already in filters container
			if (!this.mobileFilterClose.parentNode) {
				this.filtersContainer.insertBefore(this.mobileFilterClose, this.filtersContainer.firstChild);
			}
		}
		
		// Show filters container when filters are rendered
		this.showFilters();
		Log.debug('Filters rendered', { count: fragment.children.length });
	} else {
		Log.warn('No filter groups created');
		// Remove mobile filter close button when no filter groups
		if (this.mobileFilterClose && this.mobileFilterClose.parentNode) {
			this.mobileFilterClose.remove();
			this.mobileFilterClose = null;
		}
		// Hide filters container if no filters to show
		this.hideFilters();
		}
	},

	// Minimal filter item creation
	// Displays label for UI, uses value for filtering
	// handle: the filter handle (e.g., 'ef4gd' for Color, 'vendor' for vendor)
	createFilterItem(handle: string, item: FilterValueType | string, config: FilterOptionType, index: number): HTMLElement | null {
		// Get value (for filtering) - always use original value
		const value = $.str(typeof item === 'string' ? item : (item.value || item.key || item.name || ''));
		if (!value || value === '[object Object]') return null;

		// Get label (for display) - use label if available, fallback to value
		let displayLabel = typeof item === 'string'
			? item
			: (item.label || item.value || value);

		// If this is a Collection filter, map collection ID to collection label from FilterState.collections
		// Check both optionType and type to handle different filter configurations
		const isCollectionFilter = ($.isCollectionOptionType(config?.optionType) || $.isCollectionKey(handle));
		if (isCollectionFilter && FilterState.collections && Array.isArray(FilterState.collections)) {
			// Hide CPID's collection from the UI so users cannot toggle it. If the
			// item's value equals the server-provided selectedCollection.id, skip it.
			if (FilterState.selectedCollection?.id && String(value) === String(FilterState.selectedCollection.id)) {
				return null;
			}
			// Collection IDs are already numeric strings, just convert to string for comparison
			const collection = FilterState.collections.find(c => {
				const cId = String(c.id || c.gid || c.collectionId || '');
				return cId && String(cId) === String(value);
			});
			if (collection) {
				// Use title from FilterState.collections for display, keep value (collection ID) unchanged for filtering
				displayLabel = collection.title || collection.label || collection.name || displayLabel;
			} else {
				// If collection not found in FilterState.collections, skip this item (return null)
				return null;
			}
		}

		// Check if this filter is currently active (use handle directly)
		const currentValues = (FilterState.filters[handle] as string[]) || [];
		const isChecked = currentValues.includes(value);
		const inputType = $.inputDisplayType(config);
		const htmlFor = (inputType === 'radio' ? handle : handle + '-' + value.replace(/\s+/g, '-').toLowerCase()) + "_" + (index + 1);

		const label = $.el('label', 'afs-filter-item', {
			'data-afs-filter-handle': handle,
			'data-afs-filter-value': value,
			'for': htmlFor
		});
		if (isChecked) label.classList.add('afs-filter-item--active');

		const cb = $.el('input', 'afs-filter-item__checkbox', { type: inputType }) as HTMLInputElement;
		cb.checked = isChecked;
		cb.setAttribute('data-afs-filter-value', value);
		cb.setAttribute('name', htmlFor);
		cb.setAttribute('id', htmlFor);

		label.appendChild(cb);
		label.appendChild($.txt($.el('span', 'afs-filter-item__label'), displayLabel));
		if (config?.showCount && typeof item === 'object' && item.count) {
			label.appendChild($.txt($.el('span', 'afs-filter-item__count'), `(${item.count})`));
		}

		return label;
	},

	// Create price range filter group with dual-handle slider
	createPriceRangeGroup(filter: FilterOptionType, savedStates: Map<string, FilterGroupStateType> | null = null): HTMLElement | null {
		if (!filter.range || typeof filter.range.min !== 'number' || typeof filter.range.max !== 'number') {
			Log.warn('Invalid price range filter', { filter });
			return null;
		}

	const minRange = formatPrice(filter.range.min);
	const maxRange = formatPrice(filter.range.max);
	const currentRange = FilterState.filters.priceRange || { min: minRange, max: maxRange };
	const currentMin = formatPrice(Math.max(minRange, Math.min(maxRange, typeof currentRange.min === 'number' ? currentRange.min : minRange)));
	const currentMax = formatPrice(Math.max(minRange, Math.min(maxRange, typeof currentRange.max === 'number' ? currentRange.max : maxRange)));

		const group = $.el('div', 'afs-filter-group', {
			'data-afs-filter-type': 'priceRange',
			'data-afs-filter-key': filter.key || 'priceRange'
		});

		const saved = savedStates?.get(filter.key || 'priceRange');
		// In top bar layout, force price range filter to be collapsed
		const isTopBarLayout = this.container?.getAttribute('data-afs-layout') === 'top';
		const collapsed = isTopBarLayout ? true : (saved?.collapsed ?? filter.collapsed === true);
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
	const isPriceRangeActive = FilterState.filters.priceRange && (
		(typeof FilterState.filters.priceRange.min === 'number' && FilterState.filters.priceRange.min !== minRange) ||
		(typeof FilterState.filters.priceRange.max === 'number' && FilterState.filters.priceRange.max !== maxRange)
	);
		if (isPriceRangeActive) {
			const clearBtn = $.el('button', 'afs-filter-group__clear', {
				type: 'button',
				'aria-label': `${Lang.buttons.clear} ${filter.label} filter`,
				'data-afs-filter-handle': 'priceRange'
			});
			clearBtn.textContent = Lang.buttons.clear;
			clearBtn.title = `${Lang.buttons.clear} ${filter.label} filter`;
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
			min: String(minRange),
			max: String(maxRange),
			value: String(currentMin),
			step: '1'
		}) as HTMLInputElement;
		minHandle.setAttribute('data-afs-range-type', 'min');

		const maxHandle = $.el('input', 'afs-price-range-handle afs-price-range-handle--max', {
			type: 'range',
			min: String(minRange),
			max: String(maxRange),
			value: String(currentMax),
			step: '1'
		}) as HTMLInputElement;
		maxHandle.setAttribute('data-afs-range-type', 'max');

		track.appendChild(minHandle);
		track.appendChild(maxHandle);
		sliderContainer.appendChild(track);

		// Value display
		const valueDisplay = $.el('div', 'afs-price-range-values');
	const minDisplay = $.el('span', 'afs-price-range-value afs-price-range-value--min');
	const maxDisplay = $.el('span', 'afs-price-range-value afs-price-range-value--max');
	const formatPriceDisplay = (val: number | string): string => `$${parseFloat(String(val)).toFixed(2)}`;
	minDisplay.textContent = formatPriceDisplay(currentMin);
	maxDisplay.textContent = formatPriceDisplay(currentMax);
		valueDisplay.appendChild(minDisplay);
		valueDisplay.appendChild($.txt($.el('span', 'afs-price-range-separator'), ' - '));
		valueDisplay.appendChild(maxDisplay);
		sliderContainer.appendChild(valueDisplay);

	// Update active track position
	const updateActiveTrack = (): void => {
		const min = formatPrice(parseFloat(minHandle.value));
		const max = formatPrice(parseFloat(maxHandle.value));
		const range = maxRange - minRange;
		const leftPercent = ((min - minRange) / range) * 100;
		const rightPercent = ((maxRange - max) / range) * 100;
		activeTrack.style.left = `${leftPercent}%`;
		activeTrack.style.right = `${rightPercent}%`;
		minDisplay.textContent = String(min);
		maxDisplay.textContent = String(max);
		};

	// Ensure min <= max
	const constrainValues = (): void => {
		const min = formatPrice(parseFloat(minHandle.value));
		const max = formatPrice(parseFloat(maxHandle.value));
			if (min > max) {
				minHandle.value = String(max);
				maxHandle.value = String(min);
			}
			updateActiveTrack();
		};

	// Event handlers
	minHandle.addEventListener('input', () => {
		constrainValues();
		const minVal = formatPrice(parseFloat(minHandle.value));
		const maxVal = formatPrice(parseFloat(maxHandle.value));
		Filters.updatePriceRange(minVal, maxVal);
	});

	maxHandle.addEventListener('input', () => {
		constrainValues();
		const minVal = formatPrice(parseFloat(minHandle.value));
		const maxVal = formatPrice(parseFloat(maxHandle.value));
		Filters.updatePriceRange(minVal, maxVal);
	});

		// Initialize active track
		updateActiveTrack();

		content.appendChild(sliderContainer);
		group.appendChild(content);

		return group;
	},

	// Fastest product rendering (incremental updates)
	renderProducts(products: ProductType[]): void {
		if (!this.productsGrid) return;

		// Remove skeleton cards if present
		const skeletonCards = this.productsGrid.querySelectorAll('.afs-skeleton-card');
		if (skeletonCards.length > 0) {
			skeletonCards.forEach(card => card.remove());
		}

		const existing = new Map<string, HTMLElement>();
		this.productsGrid.querySelectorAll('[data-afs-product-id]').forEach(el => {
			const id = el.getAttribute('data-afs-product-id');
			if (id) existing.set(id, el as HTMLElement);
		});

		const productIds = new Set(products.map(p => $.id(p)).filter((id): id is string => id !== null));
		const fragment = document.createDocumentFragment();

		products.forEach(product => {
			const id = $.id(product);
			if (!id) return;
			const el = existing.get(id);
			if (el) {
				// Update existing
				const title = el.querySelector<HTMLElement>('.afs-product-card__title');
				if (title && title.textContent !== product.title) title.textContent = product.title || '';

				const price = el.querySelector<HTMLElement>('.afs-product-card__price');
				if (price) {
					// price amounts are in dollars, so multiply by 100 to convert to cents
					let minPrice = parseFloat(String(product.minPrice || 0)) * 100;
					let maxPrice = parseFloat(String(product.maxPrice || 0)) * 100;
					const formattedMin = $.formatMoney(minPrice, FilterState.moneyFormat || '{{amount}}', FilterState.currency || '');

					// If prices are equal, show single price, otherwise show "from" prefix
					const priceText = minPrice === maxPrice ? formattedMin : `${Lang.labels.price}from ${formattedMin}`;

					if (price.textContent !== priceText) price.textContent = priceText;
				}
			} else {
				// Create product
				const productEl = this.createProduct(product);
				if (productEl) fragment.appendChild(productEl);
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
	createProduct(p: ProductType): HTMLElement {
		const card = $.el('div', 'afs-product-card', { 'data-afs-product-id': $.id(p) || '' });

		if (p.imageUrl || p.featuredImage) {
			const imgContainer = $.el('div', 'afs-product-card__image');
			const img = $.el('img', '', {
				alt: p.title || '',
				loading: 'lazy',
				decoding: 'async',
				fetchpriority: 'low'
			}) as HTMLImageElement;

			// Get base image URL (first image)
			const baseImageUrl = p.imageUrl || '';

			// Get second image for hover effect (from imagesUrls array)
			let secondImageUrl: string | null = null;
			const imagesArray = (p as any).imagesUrls;
			if (imagesArray && Array.isArray(imagesArray) && imagesArray.length > 1) {
				secondImageUrl = imagesArray[1];
				Log.debug('Second image found for hover', {
					secondImageUrl,
					totalImages: imagesArray.length
				});
			}

			if (baseImageUrl) {
				// Use responsive images with srcset for optimal loading
				if (p.featuredImage && (p.featuredImage.urlSmall || p.featuredImage.urlMedium || p.featuredImage.urlLarge)) {
					// Use pre-optimized URLs from Liquid if available
					const srcset: string[] = [];
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

				// Store original image URL for hover revert
				img.setAttribute('data-original-src', img.src);

				// Add error handling for failed image loads
				img.onerror = function (this: HTMLImageElement) {
					// Fallback to original format if WebP fails
					const fallbackUrl = p.featuredImage?.urlFallback || baseImageUrl;
					if (fallbackUrl && this.src !== fallbackUrl) {
						// Try original format
						this.src = fallbackUrl;
						this.setAttribute('data-original-src', fallbackUrl);
					} else if (this.src.includes('_webp.')) {
						// If WebP failed, try original format
						const originalUrl = baseImageUrl.replace(/_(?:small|medium|large|grande|compact|master|\d+x\d+)_webp\./i, '_300x300.');
						if (originalUrl !== this.src) {
							this.src = originalUrl;
							this.setAttribute('data-original-src', originalUrl);
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

			// Add hover effect for second image if available
			if (secondImageUrl) {
				// Use original second image URL directly (no optimization for hover to avoid issues)
				// Optimization can cause problems if the URL format changes
				const hoverImageUrl = secondImageUrl;

				// Preload second image for smooth hover transition
				const hoverImg = new Image();
				hoverImg.src = hoverImageUrl;

				// Store original src - use the actual current src after image loads
				let originalSrc = img.src || baseImageUrl;

				// Update original src when main image loads (in case srcset changes it)
				const updateOriginalSrc = () => {
					const currentSrc = img.src;
					if (currentSrc && currentSrc !== hoverImageUrl) {
						originalSrc = currentSrc;
					}
				};

				// Capture original src after image loads
				if (img.complete) {
					updateOriginalSrc();
				} else {
					img.addEventListener('load', updateOriginalSrc, { once: true });
				}

				// Add hover event listeners with smooth transition
				imgContainer.addEventListener('mouseenter', () => {
					// Update original src if it changed (e.g., due to srcset)
					updateOriginalSrc();

					// Swap to hover image
					const swapToHover = () => {
						img.style.opacity = '0';
						setTimeout(() => {
							img.src = hoverImageUrl;
							img.style.opacity = '1';
						}, 150);
					};

					if (hoverImg.complete) {
						// Image already loaded, swap immediately
						swapToHover();
					} else {
						// Wait for image to load, then swap
						const loadHandler = () => {
							swapToHover();
						};

						// Check again in case it loaded between checks (race condition)
						if (hoverImg.complete) {
							swapToHover();
						} else {
							hoverImg.addEventListener('load', loadHandler, { once: true });
							// If image fails to load, log error but don't swap
							hoverImg.addEventListener('error', () => {
								Log.debug('Hover image failed to load', {
									url: secondImageUrl,
									hoverImageUrl
								});
							}, { once: true });
						}
					}
				});

				imgContainer.addEventListener('mouseleave', () => {
					// Revert to original image with fade
					img.style.opacity = '0';
					setTimeout(() => {
						img.src = originalSrc;
						img.style.opacity = '1';
					}, 150);
				});
			}

			// Add sold out badge if product is unavailable
			const isSoldOut = parseInt(String(p.totalInventory || 0), 10) <= 0 || (p.variants && !p.variants.some(v => v.availableForSale));
			if (isSoldOut) {
				const soldOutBadge = $.el('div', 'afs-product-card__badge', {
					'class': 'afs-product-card__badge--sold-out'
				});
				soldOutBadge.textContent = Lang.buttons.soldOut || 'Sold out';
				imgContainer.appendChild(soldOutBadge);
			}

			// Add Quick Add button - bottom right corner with + icon
			const quickAddBtn = $.el('button', 'afs-product-card__quick-add', {
				'data-product-handle': p.handle || '',
				'data-product-id': $.id(p) || '',
				'aria-label': Lang.buttons.quickAddToCart,
				'type': 'button'
			});

			// Add + icon
			const plusIcon = $.el('span', 'afs-product-card__quick-add-icon');
			plusIcon.innerHTML = Icons.plus;
			quickAddBtn.appendChild(plusIcon);

			// Add text that shows on hover
			const quickAddText = $.el('span', 'afs-product-card__quick-add-text');
			quickAddText.textContent = Lang.buttons.quickAdd;
			quickAddBtn.appendChild(quickAddText);

			// Disable button if product is not available
			if (parseInt(String(p.totalInventory || 0), 10) <= 0 || (p.variants && !p.variants.some(v => v.availableForSale))) {
				(quickAddBtn as HTMLButtonElement).disabled = true;
				quickAddBtn.classList.add('afs-product-card__quick-add--disabled');
				quickAddBtn.setAttribute('aria-label', Lang.labels.productUnavailable);
			}

			// Add Quick View button - opens product modal
			const quickViewBtn = createQuickViewButton(p);
			if (quickViewBtn) {
				imgContainer.appendChild(quickViewBtn);
			}
			card.appendChild(imgContainer);
		}

		const info = $.el('a', 'afs-product-card__info', { 'href': `/products/${p.handle}` });
		if (info) {
			info.appendChild($.txt($.el('h3', 'afs-product-card__title'), p.title || 'Untitled'));
			if (p.vendor) info.appendChild($.txt($.el('div', 'afs-product-card__vendor'), p.vendor));

			// price amounts are in dollars, so multiply by 100 to convert to cents
			let minPrice = parseFloat(String(p.minPrice || 0)) * 100;
			let maxPrice = parseFloat(String(p.maxPrice || 0)) * 100;
			const formattedMin = $.formatMoney(minPrice, FilterState.moneyFormat || '{{amount}}', FilterState.currency || '');

			// If prices are equal, show single price, otherwise show "from" prefix
			const priceText = minPrice === maxPrice ? formattedMin : `from ${formattedMin}`;

			info.appendChild($.txt($.el('div', 'afs-product-card__price'), priceText));
			card.appendChild(info);
		}
		return card;
	},

	// Update filter active state (optimized)
	updateFilterState(handle: string, value: string, active: boolean): void {
		if (!this.filtersContainer) {
			Log.warn('Cannot update filter state: filtersContainer not found');
			return;
		}

		// Escape special characters in value for CSS selector
		const escapeValue = (val: string): string => String(val).replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
		const escapedValue = escapeValue(value);
		const escapedHandle = escapeValue(handle);

		const selector = `.afs-filter-item[data-afs-filter-handle="${escapedHandle}"][data-afs-filter-value="${escapedValue}"]`;
		const item = this.filtersContainer.querySelector<HTMLElement>(selector);
		if (item) {
			const cb = item.querySelector<HTMLInputElement>('.afs-filter-item__checkbox');
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
	renderInfo(pagination: PaginationStateType, total: number): void {
		if (!this.productsInfo) return;

		// Preserve sort container when clearing
		const sortContainer = this.sortContainer;
		const existingResults = this.productsInfo.querySelector<HTMLElement>('.afs-products-info__results');

		// Remove only the results and page elements, keep sort container
		if (existingResults) existingResults.remove();

		// Create results text
		let resultsEl: HTMLElement;
		if (total === 0) {
			resultsEl = $.txt($.el('div', 'afs-products-info__results'), Lang.messages.noProductsFound);
		} else if (total === 1) {
			resultsEl = $.txt($.el('div', 'afs-products-info__results'), Lang.messages.oneProductFound);
		} else {
			const start = (pagination.page - 1) * pagination.limit + 1;
			const end = Math.min(pagination.page * pagination.limit, total);
			resultsEl = $.txt($.el('div', 'afs-products-info__results'), `${Lang.messages.showingProducts} ${start}-${end} of ${total} ${Lang.messages.productsFound}`);
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

		// Create/update mobile sticky results button
		this.updateMobileResultsButton(total);
	},

	// Create or update mobile sticky results button
	updateMobileResultsButton(total: number): void {
		if (!this.container) return;

		// Only show on mobile devices
		const isMobile = window.innerWidth <= 767;
		if (!isMobile) {
			// Hide button on desktop/tablet
			if (this.mobileResultsButton) {
				this.mobileResultsButton.classList.remove('afs-mobile-results-button--visible');
			}
			return;
		}

		// Create button if it doesn't exist
		if (!this.mobileResultsButton) {
			this.mobileResultsButton = $.el('div', 'afs-mobile-results-button');
			const buttonInner = $.el('button', 'afs-mobile-results-button-inner', {
				type: 'button',
				'aria-label': 'View results'
			});
			this.mobileResultsButton.appendChild(buttonInner);
			
			// Append to container
			if (this.container.parentNode) {
				this.container.parentNode.appendChild(this.mobileResultsButton);
			} else {
				document.body.appendChild(this.mobileResultsButton);
			}

			// Add click handler to scroll to products grid
			buttonInner.addEventListener('click', () => {
				if (this.productsGrid) {
					this.productsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			});

			// Add resize handler to update button visibility
			let resizeTimeout: number | null = null;
			window.addEventListener('resize', () => {
				if (resizeTimeout) {
					clearTimeout(resizeTimeout);
				}
				resizeTimeout = window.setTimeout(() => {
					const isMobileNow = window.innerWidth <= 767;
					if (!isMobileNow && this.mobileResultsButton) {
						this.mobileResultsButton.classList.remove('afs-mobile-results-button--visible');
					} else if (isMobileNow && total > 0 && this.mobileResultsButton && !document.body.classList.contains('afs-filters-open')) {
						this.mobileResultsButton.classList.add('afs-mobile-results-button--visible');
					}
				}, 150);
			});
		}

		// Update button text
		const buttonInner = this.mobileResultsButton.querySelector<HTMLElement>('.afs-mobile-results-button-inner');
		if (buttonInner) {
			if (total === 0) {
				buttonInner.textContent = Lang.messages.noProductsFound || 'No products found';
			} else if (total === 1) {
				buttonInner.textContent = `See ${total} result`;
			} else {
				buttonInner.textContent = `See ${total} results`;
			}
		}

		// Show button with animation (always show when there are results on mobile, unless drawer is open)
		if (total > 0) {
			// Use requestAnimationFrame to ensure smooth animation
			requestAnimationFrame(() => {
				if (this.mobileResultsButton) {
					// Only hide if drawer is open, otherwise always show
					const drawerOpen = document.body.classList.contains('afs-filters-open');
					if (drawerOpen) {
						this.mobileResultsButton.classList.remove('afs-mobile-results-button--visible');
					} else {
						this.mobileResultsButton.classList.add('afs-mobile-results-button--visible');
					}
				}
			});
		} else {
			if (this.mobileResultsButton) {
				this.mobileResultsButton.classList.remove('afs-mobile-results-button--visible');
			}
		}
	},

	// Render pagination controls
	renderPagination(pagination: PaginationStateType): void {
		if (!this.productsGrid || !pagination) return;

		// Remove existing pagination
		const existing = this.productsGrid.parentNode?.querySelector<HTMLElement>('.afs-pagination');
		if (existing) existing.remove();

		if (pagination.totalPages <= 1) return;

		const paginationEl = $.el('div', 'afs-pagination');

		// Previous button
		const prevBtn = $.el('button', 'afs-pagination__button', {
			type: 'button',
			'data-afs-page': String(pagination.page - 1),
			'aria-label': `${Lang.buttons.previous} ${Lang.messages.pageOf.toLowerCase()}`
		}) as HTMLButtonElement;
		prevBtn.textContent = Lang.buttons.previous;
		prevBtn.disabled = pagination.page <= 1;
		paginationEl.appendChild(prevBtn);

		// Page info
		const info = $.el('span', 'afs-pagination__info');
		info.textContent = `${Lang.messages.pageOf} ${pagination.page} of ${pagination.totalPages}`;
		paginationEl.appendChild(info);

		// Next button
		const nextBtn = $.el('button', 'afs-pagination__button', {
			type: 'button',
			'data-afs-page': String(pagination.page + 1),
			'aria-label': `${Lang.buttons.next} ${Lang.messages.pageOf.toLowerCase()}`
		}) as HTMLButtonElement;
		nextBtn.textContent = Lang.buttons.next;
		nextBtn.disabled = pagination.page >= pagination.totalPages;
		paginationEl.appendChild(nextBtn);

		if (this.productsContainer) {
			this.productsContainer.appendChild(paginationEl);
		}
	},

	// Applied filters with clear all
	renderApplied(filters: FiltersStateType): void {
		if (!this.container) return;

		// Remove existing applied filters
		const existing = this.container.querySelector<HTMLElement>('.afs-applied-filters');
		if (existing) existing.remove();

		// Find search bar to position applied filters after it
		const searchBar = this.container.querySelector<HTMLElement>('[data-afs-search-bar]');

		// Count active filters
		// key here is the handle (for option filters) or queryKey (for standard filters)
		const activeFilters: AppliedFilterType[] = [];
		Object.keys(filters).forEach(key => {
			const value = filters[key];
			if ($.equals(key, FilterKeyType.CPID)) {
				// no cpid to render
			}
			else if ($.equals(key, FilterKeyType.SEARCH) && value && typeof value === 'string' && value.trim()) {
				activeFilters.push({ handle: key, label: `${Lang.labels.search}${value}`, value });
			} else if ($.isPriceRangeKey(key) && value && typeof value === 'object' && !Array.isArray(value)) {
				const priceRange = value as PriceRangeType;
			const hasMin = typeof priceRange.min === 'number' && !isNaN(priceRange.min);
			const hasMax = typeof priceRange.max === 'number' && !isNaN(priceRange.max);
			if (hasMin && hasMax) {
				const formattedMin = formatPrice(priceRange.min!);
				const formattedMax = formatPrice(priceRange.max!);
				activeFilters.push({ handle: key, label: `${Lang.labels.price}$${formattedMin} - $${formattedMax}`, value: SpecialValueType.CLEAR });
			} else if (hasMin) {
				const formattedMin = formatPrice(priceRange.min!);
				activeFilters.push({ handle: key, label: `${Lang.labels.price}$${formattedMin}+`, value: SpecialValueType.CLEAR });
			} else if (hasMax) {
				const formattedMax = formatPrice(priceRange.max!);
				activeFilters.push({ handle: key, label: `${Lang.labels.price}Up to $${formattedMax}`, value: SpecialValueType.CLEAR });
			}
			} else if (Array.isArray(value) && value.length > 0) {
				value.forEach(v => {
					const metadata = FilterState.filterMetadata.get(key);
					let label = metadata?.label || key;
					let displayValue = v; // Default to the value itself

					// For collection filters, use collection title from FilterState.collections
					const isCollectionFilter = ($.isCollectionOptionType(metadata?.optionType) || $.isCollectionKey(key));
					if (isCollectionFilter && FilterState.collections && Array.isArray(FilterState.collections)) {
						const collection = FilterState.collections.find(c => {
							const cId = String(c.id || c.gid || c.collectionId || '');
							return cId && String(cId) === String(v);
						});
						if (collection) {
							// Use collection name instead of ID for display
							displayValue = collection.title || collection.label || collection.name || v;
						}
					}

					activeFilters.push({ handle: key, label: `${label}: ${displayValue}`, value: v });
				});
			}
		});

		// CPID is intentionally hidden from the applied-filters UI. It is managed
		// server-side and should not appear as a removable chip in the browser.

		if (activeFilters.length === 0) return;

		const appliedContainer = $.el('div', 'afs-applied-filters');
		const header = $.el('div', 'afs-applied-filters__header');
		header.appendChild($.txt($.el('div', 'afs-applied-filters__label'), Lang.labels.appliedFilters));
		appliedContainer.appendChild(header);

		const list = $.el('div', 'afs-applied-filters__list');
		activeFilters.forEach(filter => {
			const chip = $.el('div', 'afs-applied-filter-chip');
			chip.appendChild($.txt($.el('span', 'afs-applied-filter-chip__label'), filter.label));
			const remove = $.el('button', 'afs-applied-filter-chip__remove', {
				'data-afs-filter-key': filter.handle,
				'data-afs-filter-value': filter.value,
				'aria-label': `${Lang.buttons.clear} filter`,
				type: 'button'
			});
			remove.innerHTML = Icons.close;
			chip.appendChild(remove);
			list.appendChild(chip);
		});

		const clearAll = $.el('button', 'afs-applied-filters__clear-all', {
			'data-afs-action': 'clear-all',
			type: 'button'
		});
		clearAll.textContent = Lang.buttons.clearAll;
		list.appendChild(clearAll);

		appliedContainer.appendChild(list);

		// Insert applied filters after search bar (if exists) or at the beginning
		if (searchBar && searchBar.nextSibling) {
			this.container.insertBefore(appliedContainer, searchBar.nextSibling);
		} else if (searchBar) {
			// Search bar exists but has no next sibling, append after it
			searchBar.insertAdjacentElement('afterend', appliedContainer);
		} else {
			this.container.insertBefore(appliedContainer, this.container.firstChild);
		}
	},

	scrollToProducts(): void {
		if (FilterState.scrollToProductsOnFilter === false) {
			return; // stop on debugging mode
		}
		// Scroll to products section when filters are applied
		const target = this.productsContainer || this.productsGrid || this.productsInfo;
		if (!target) return;

		const rect = target.getBoundingClientRect();
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		const topVisible = rect.top >= 0 && rect.top <= viewportHeight;

		// Only scroll if the top of products is outside the viewport (either above or below)
		if (!topVisible) {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
			Log.debug('Scrolled to products section');
		}
	},

	showLoading(): void {
		this.showProductsSkeleton();
		this.showFiltersSkeleton();
	},

	hideLoading(): void {
		// Remove skeleton cards if they exist
		try {
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
		} catch (error) {

		}

		this.hideFiltersSkeleton();
	},

	showProductsSkeleton(): void {
		if (!this.productsGrid) return;

		// Clear existing products
		$.clear(this.productsGrid);

		// Determine skeleton count
		const pageSize = FilterState.pagination?.limit || Config.PAGE_SIZE || 24;
		const skeletonCount = Math.max(pageSize, 24); // minimum 24

		const skeletonCards: HTMLElement[] = [];
		for (let i = 0; i < skeletonCount; i++) {
			const skeletonCard = $.el('div', 'afs-skeleton-card');
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

		skeletonCards.forEach(card => this.productsGrid!.appendChild(card));

		// Keep reference for removal
		this.loading = skeletonCards;
	},

	showFiltersSkeleton(): void {
		if (!this.filtersContainer) return;
		// Remove existing skeleton if present
		const existingSkeleton = this.filtersContainer.querySelector<HTMLElement>('.afs-filters-skeleton');
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

	hideFiltersSkeleton(): void {
		const skeleton = this.filtersContainer?.querySelector<HTMLElement>('.afs-filters-skeleton');
		if (skeleton) {
			skeleton.remove();
		}
	},

	hideProductsSkeleton(): void {
		const skeleton = this.filtersContainer?.querySelector<HTMLElement>('.afs-filters-skeleton');
		if (skeleton) {
			skeleton.remove();
		}
	},

	showError(message: string): void {
		// Try to find productsContainer if not set, or use container as fallback
		if (!this.productsContainer) {
			// Try to find it in the container
			this.productsContainer = this.container?.querySelector<HTMLElement>('.afs-products-container') || null;

			// If still not found, create it
			if (!this.productsContainer && this.container) {
				const main = this.container.querySelector<HTMLElement>('.afs-main-content');
				if (main) {
					this.productsContainer = $.el('div', 'afs-products-container');
					main.appendChild(this.productsContainer);
				}
			}
		}

		if (!this.productsContainer) {
			Log.error('Cannot show error: productsContainer not found', { message });
			return;
		}

		// Remove loading if present
		this.hideLoading();

		const fallbackProductsTotal = FilterState.fallbackProducts.length ?? 0;

		// Check if we have fallback products to show instead of error
		if (FilterState.fallbackProducts && fallbackProductsTotal > 0) {
			Log.warn('API error occurred, using fallback products from Liquid', {
				error: message,
				fallbackCount: fallbackProductsTotal
			});

			// Use fallback products
			FilterState.products = FilterState.fallbackProducts;
			FilterState.pagination = FallbackMode.getPagination();;

			// Render fallback products
			this.renderProducts(FilterState.products);
			if (FilterState.pagination) {
				this.renderInfo(FilterState.pagination, FilterState.pagination.total);
				this.renderPagination(FilterState.pagination);
			}
			return;
		}

		// No fallback available, show error
		const existingError = this.productsContainer.querySelector<HTMLElement>('.afs-error-message');
		if (existingError) existingError.remove();

		const error = $.el('div', 'afs-error-message');
		error.textContent = message || Lang.messages.failedToLoad;

		// Insert error in products grid or container
		if (this.productsGrid) {
			$.clear(this.productsGrid);
			this.productsGrid.appendChild(error);
		} else {
			this.productsContainer.appendChild(error);
		}

		Log.error('Error displayed', { message });
	},

	setSortSelectValue(): void {
		// Update sort select value (programmatically - won't trigger change event)
		if (DOM.sortSelect) {
			// Handle best-selling sort (no order in value)
			if ($.isBestSelling(FilterState.sort.field)) {
				DOM.sortSelect.value = SortFieldType.BEST_SELLING;
			} else {
				// Convert to new format: "field-direction" (e.g., "title-ascending")
				const direction = $.equals(FilterState.sort.order, SortOrderType.ASC) ? SortOrderType.ASCENDING : SortOrderType.DESCENDING;
				DOM.sortSelect.value = `${FilterState.sort.field}-${direction}`;
			}
			Log.debug('Sort select value updated programmatically', { value: DOM.sortSelect.value, sort: FilterState.sort });
		}
	}
};

// ============================================================================
// FALLBACK MODE HELPER (Page reload for Liquid products)
// ============================================================================

const FallbackMode = {
	// Get pagination info for fallback mode (from URL params and Liquid data)
	getPagination(): PaginationStateType {
		const urlParams = UrlManager.parse();
		const currentPage = urlParams.page || FilterState.fallbackPagination.currentPage || 1;
		const totalPages = FilterState.fallbackPagination.totalPages || 1;
		const totalProducts = FilterState.fallbackPagination.totalProducts || FilterState.fallbackProducts.length || 0;

		return {
			page: currentPage,
			limit: Config.PAGE_SIZE,
			total: totalProducts,
			totalPages: totalPages
		};
	},

	// Reload page with updated URL parameters for sort/pagination
	reloadPage(filters: FiltersStateType, pagination: PaginationStateType, sort: SortStateType): void {
		const url = new URL(window.location.href);
		url.search = '';

		// Add sort parameter
		if (sort && sort.field) {
			if (sort.field === 'best-selling' || sort.field === 'bestselling') {
				url.searchParams.set('sort', 'best-selling');
			} else {
				// Convert to new format: "field-direction" (e.g., "title-ascending")
				const direction = $.equals(sort.order, SortOrderType.ASC) ? SortOrderType.ASCENDING : SortOrderType.DESCENDING;
				url.searchParams.set('sort', `${sort.field}-${direction}`);
			}
		}

		// Add page parameter (always set it, even if page 1, for consistency)
		if (pagination && pagination.page) {
			url.searchParams.set('page', String(pagination.page));
		}

		// Preserve any existing filter parameters (they'll be handled by Liquid)
		Object.keys(filters || {}).forEach(key => {
			const value = filters[key];
			if ($.empty(value)) return;

			if (Array.isArray(value) && value.length > 0) {
				url.searchParams.set(key, value.join(','));
		} else if ($.isPriceRangeKey(key) && value && typeof value === 'object' && !Array.isArray(value)) {
			const priceRange = value as PriceRangeType;
			const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? formatPrice(priceRange.min) : undefined;
			const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? formatPrice(priceRange.max) : undefined;
				if (FilterState.priceRangeHandle) {
					url.searchParams.set(FilterState.priceRangeHandle, `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`);
				} else {
					if (min !== undefined) url.searchParams.set('priceMin', String(min));
					if (max !== undefined) url.searchParams.set('priceMax', String(max));
				}
			} else if ($.equals(key, FilterKeyType.SEARCH) && typeof value === 'string' && value.trim()) {
				url.searchParams.set(key, value.trim());
			}
		});

		Log.info('Reloading page for fallback mode', { url: url.toString(), sort, pagination });
		window.location.href = url.toString();
	}
};

function handleLoadError(e: unknown) {
	DOM.hideLoading();
	Log.error('Load failed', {
		error: e instanceof Error ? e.message : String(e),
		stack: e instanceof Error ? e.stack : undefined,
		shop: FilterState.shop,
		apiBaseURL: API.baseURL
	});
	// Try to use fallback products if available
	if (FilterState.fallbackProducts && FilterState.fallbackProducts.length > 0) {
		Log.warn('Initial load failed, using fallback products from Liquid', {
			error: e instanceof Error ? e.message : String(e),
			fallbackCount: FilterState.fallbackProducts.length
		});

		FilterState.usingFallback = true; // Set fallback flag
		FilterState.products = FilterState.fallbackProducts;
		// Use pagination from URL params and Liquid data
		FilterState.pagination = FallbackMode.getPagination();

		// Hide filters section when using fallback
		FilterState.availableFilters = [];
		DOM.hideFilters();

		// Update sort select value based on URL params or current sort state
		if (DOM.sortSelect) {
			if ($.isBestSelling(FilterState.sort.field)) {
				DOM.sortSelect.value = SortFieldType.BEST_SELLING;
			} else {
				const direction = $.equals(FilterState.sort.order, SortOrderType.ASC) ? SortOrderType.ASCENDING : SortOrderType.DESCENDING;
				DOM.sortSelect.value = `${FilterState.sort.field}-${direction}`;
			}
		}

		DOM.renderProducts(FilterState.products);
		DOM.renderInfo(FilterState.pagination, FilterState.pagination.total);
		DOM.renderPagination(FilterState.pagination);
		DOM.renderApplied(FilterState.filters);

	} else {
		DOM.showError(`${Lang.messages.failedToLoad}: ${e instanceof Error ? e.message : Lang.messages.unknownError}. ${Lang.messages.checkConsole}`);
	}
}

const Products = {
	process: (productsData: ProductsResponseDataType) => {
		Log.info('Products loaded', { count: productsData.products?.length || 0, total: productsData.pagination?.total || 0 });
		const hasProducts = productsData.products && Array.isArray(productsData.products) && productsData.products.length > 0;

		if (!hasProducts && FilterState.fallbackProducts && FilterState.fallbackProducts.length > 0) {
			Log.warn('API returned no products, using fallback products from Liquid', {
				apiProductsCount: productsData.products?.length || 0,
				fallbackCount: FilterState.fallbackProducts.length
			});

			FilterState.usingFallback = true; // Set fallback flag
			FilterState.products = FilterState.fallbackProducts;
			// Use pagination from URL params and Liquid data
			FilterState.pagination = FallbackMode.getPagination();

			// Hide filters section when using fallback
			FilterState.availableFilters = [];
			DOM.hideFilters();
			DOM.hideProductsSkeleton();
		}
		else {
			FilterState.usingFallback = false; // Reset fallback flag on success
			FilterState.products = productsData.products || [];
			FilterState.pagination = productsData.pagination || FilterState.pagination;

			// Show filters section when API is working
			DOM.showFilters();
			DOM.renderProducts(FilterState.products);
		}
		Products.updateUI();
	},

	updateUI: (): void => {
		DOM.renderInfo(FilterState.pagination, FilterState.pagination.total || 0);
		DOM.renderPagination(FilterState.pagination);
		DOM.renderApplied(FilterState.filters);
		DOM.setSortSelectValue();
	}
};

const Filters = {

	process: (filtersData: FiltersResponseDataType) => {
		try {
			FilterState.availableFilters = filtersData.filters || [];
			try {
				FilterState.filterMetadata = Metadata.buildFilterMetadata(FilterState.availableFilters);
			} catch (error) { }
			// Cache range filter handles (so we can write handle-style URL params like other filters)
			const priceFilter = FilterState.availableFilters.find(f => $.isPriceRangeOptionType(f.optionType));
			FilterState.priceRangeHandle = priceFilter?.handle || FilterState.priceRangeHandle || null;
			Log.info('Filters set from URL', { filters: FilterState.filters });
			// If URL used handle-based price param (e.g. pr_xxx=10-100), normalize into FilterState.filters.priceRange
			// so the slider renders correctly. Keep URL updates handle-based via FilterState.priceRangeHandle.
			const priceRangeFilterValue = FilterState.priceRangeHandle ? FilterState.filters[FilterState.priceRangeHandle] : null;
			if (FilterState.priceRangeHandle && Array.isArray(priceRangeFilterValue) && priceRangeFilterValue.length > 0) {
				try {
					const raw = String(priceRangeFilterValue[0] || '');
					const parts = raw.split('-');
					if (parts.length === 2) {
						const min = parts[0].trim() ? parseInt(parts[0], 10) : undefined;
						const max = parts[1].trim() ? parseInt(parts[1], 10) : undefined;
						const hasMin = typeof min === 'number' && !isNaN(min) && min >= 0;
						const hasMax = typeof max === 'number' && !isNaN(max) && max >= 0;
						if (hasMin || hasMax) {
							FilterState.filters.priceRange = {
								min: hasMin ? min : undefined,
								max: hasMax ? max : undefined
							};
							delete FilterState.filters[FilterState.priceRangeHandle];
						}
					}
				} catch (error) {

				}
			}

			DOM.renderFilters(FilterState.availableFilters);
			Log.info('Filters rendered', { count: FilterState.availableFilters.length });

		} catch (error) {
			Log.error("PROCESS FILTER ERROR", { error: error instanceof Error ? error.message : String(error) });
		}
		finally {
			Products.updateUI();
			DOM.hideFiltersSkeleton();
		}

	},

	// Toggle standard filter (vendor, productType, tags, collections) or handle-based filter
	toggle(handle: string, value: string): void {
		const normalized = $.str(value);
		if (!normalized || !handle) {
			Log.warn('Invalid filter toggle', { handle, value });
			return;
		}

		const current = (FilterState.filters[handle] as string[]) || [];
		const isActive = current.includes(normalized);
		const filterValues = isActive
			? current.filter(v => v !== normalized)
			: [...current, normalized];

		if (filterValues.length === 0) {
			delete FilterState.filters[handle];
		} else {
			FilterState.filters[handle] = filterValues;
		}

		FilterState.pagination.page = 1;

		Log.debug('Filter toggled', { handle, value: normalized, wasActive: isActive, isActive: !isActive, filterValues });

		UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
		DOM.updateFilterState(handle, normalized, !isActive);
		// Scroll to top when filter is clicked
		DOM.scrollToProducts();
		// Show loading skeleton immediately (before debounce) - only products, filters will update via Filters.process
		DOM.showProductsSkeleton();

		// Close mobile filters after applying filter (on mobile devices)
		if (window.innerWidth <= 768 && DOM.filtersContainer?.classList.contains('afs-filters-container--open')) {
			DOM.filtersContainer.classList.remove('afs-filters-container--open');
			document.body.classList.remove('afs-filters-open');
			
			// Hide backdrop overlay
			if (DOM.mobileFilterBackdrop) {
				DOM.mobileFilterBackdrop.style.display = 'none';
			}
			
			document.body.style.overflow = '';
			document.body.style.position = '';
			document.body.style.width = '';
			document.body.style.height = '';
			document.body.style.top = '';
			document.body.style.removeProperty('overflow');
			document.body.style.removeProperty('position');
			document.body.style.removeProperty('width');
			document.body.style.removeProperty('height');
			document.body.style.removeProperty('top');
			
			// Restore scroll position
			const scrollY = document.body.style.top;
			if (scrollY) {
				window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
			}
			
			// Show mobile results button again if on mobile
			if (window.innerWidth <= 767 && DOM.mobileResultsButton && FilterState.pagination.total > 0) {
				DOM.mobileResultsButton.classList.add('afs-mobile-results-button--visible');
			}
		}

		this.apply();
	},

updatePriceRange(min: number, max: number): void {
	// Format to 2 decimal places for consistency
	min = formatPrice(min);
	max = formatPrice(max);

	if (typeof min !== 'number' || typeof max !== 'number' || min < 0 || max < min) {
		Log.warn('Invalid price range', { min, max });
		return;
	}

	// Check if range matches the full range (no filter applied)
	const priceFilter = FilterState.availableFilters.find(f => $.isPriceRangeOptionType(f.optionType) || $.equals(f.optionKey, FilterKeyType.PRICE_RANGE));
	if (priceFilter && priceFilter.range) {
		const formattedMinRange = formatPrice(priceFilter.range.min);
		const formattedMaxRange = formatPrice(priceFilter.range.max);
		if (min === formattedMinRange && max === formattedMaxRange) {
				FilterState.filters.priceRange = null;
			} else {
				FilterState.filters.priceRange = { min, max };
			}
		} else {
			FilterState.filters.priceRange = { min, max };
		}

		FilterState.pagination.page = 1;

		Log.debug('Price range updated', { min, max, priceRange: FilterState.filters.priceRange });

		UrlManager.update(FilterState.filters, FilterState.pagination, FilterState.sort);
		// Scroll to top when price range is updated
		DOM.scrollToProducts();
		// Show loading skeleton immediately (before debounce)
		DOM.showProductsSkeleton();
		this.apply();
	},

	// Apply products only (for sort/pagination changes - no filter update needed)
	applyProductsOnly: $.debounce(async (): Promise<void> => {
		Log.info('applyProductsOnly called', { filters: FilterState.filters, pagination: FilterState.pagination, sort: FilterState.sort, usingFallback: FilterState.usingFallback });

		// If in fallback mode, reload page with new URL parameters
		if (FilterState.usingFallback) {
			Log.info('In fallback mode, reloading page with new parameters');
			FallbackMode.reloadPage(FilterState.filters, FilterState.pagination, FilterState.sort);
			return;
		}

		// Scroll to top when products are being fetched
		DOM.scrollToProducts();
		API.products(FilterState.filters, FilterState.pagination, FilterState.sort).then(Products.process);
	}, Config.DEBOUNCE),

	// Apply filters and products (for filter changes - needs to update both)
	apply: $.debounce(async (): Promise<void> => {
		// Scroll to top when products are being fetched
		DOM.scrollToProducts();
		API.products(FilterState.filters, FilterState.pagination, FilterState.sort).then(Products.process).catch(handleLoadError).finally(() => {
			DOM.hideProductsSkeleton();
		});
		API.filters(FilterState.filters).then(Filters.process).catch(handleLoadError).finally(() => {
			DOM.hideFiltersSkeleton();
		});
	}, Config.DEBOUNCE)
};

// ============================================================================
// QUICK ADD FUNCTIONALITY
// ============================================================================
const QuickAdd = {
	async add(handle: string, productId: string | null): Promise<void> {
		try {
			// Fetch product to get first variant
			const productUrl = `/products/${handle}.json`;
			const response = await fetch(productUrl);

			if (!response.ok) {
				throw new Error(Lang.messages.failedToLoadProduct);
			}

			const data = await response.json() as { product: ProductType };
			const product = data.product;

			if (!product || !product.variants || product.variants.length === 0) {
				throw new Error('Product has no variants');
			}

			// Use first available variant
			const variant = product.variants.find(v => v.available) || product.variants[0];

			await this.addVariant(Number(variant.id), 1);
		} catch (error) {
			Log.error('Quick add failed', { error: error instanceof Error ? error.message : String(error), handle });
			DOM.showError('Failed to add product to cart. Please try again.');
		}
	},

	async addFromForm(form: HTMLFormElement, handle: string): Promise<void> {
		try {
			const formData = new FormData(form);
			const variantId = formData.get('id');
			const quantity = parseInt(formData.get('quantity')?.toString() || '1', 10);

			if (!variantId) {
				// If no variant ID, need to find variant based on selected options
				const options: string[] = [];
				for (let i = 1; i <= 3; i++) {
					const option = formData.get(`option${i}`);
					if (option) options.push(option.toString());
				}

				// Fetch product to find matching variant
				const productUrl = `/products/${handle}.json`;
				const response = await fetch(productUrl);
				const data = await response.json() as { product: ProductType };
				const product = data.product;

				const variant = product.variants?.find(v => {
					if (!v.options) return false;
					return v.options.length === options.length &&
						v.options.every((opt, idx) => opt === options[idx]);
				});

				if (variant) {
					await this.addVariant(Number(variant.id), quantity);
				} else {
					throw new Error('Variant not found');
				}
			} else {
				await this.addVariant(Number(variantId), quantity);
			}
		} catch (error) {
			Log.error('Add from form failed', { error: error instanceof Error ? error.message : String(error) });
			DOM.showError('Failed to add product to cart. Please try again.');
		}
	},

	async addVariant(variantId: number, quantity: number): Promise<void> {
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
				const error = await response.json() as { description?: string };
				throw new Error(error.description || Lang.messages.failedToAddToCart);
			}

			await response.json();

			// Trigger cart update event
			document.dispatchEvent(new CustomEvent('cart:updated'));

			// Show success message
			this.showSuccess();

			// Quick view close removed (handled by modal close handlers)
		} catch (error) {
			Log.error('Add variant failed', { error: error instanceof Error ? error.message : String(error), variantId });
			throw error;
		}
	},

	showSuccess(): void {
		// Create or update success toast
		let toast = document.querySelector<HTMLElement>('.afs-cart-toast');
		if (!toast) {
			toast = $.el('div', 'afs-cart-toast');
			
			// Create toast content with icon and message
			const toastContent = $.el('div', 'afs-cart-toast__content');
			
			// Success icon (checkmark circle)
			const icon = $.el('div', 'afs-cart-toast__icon');
			icon.innerHTML = `
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
				</svg>
			`;
			
			// Message text
			const message = $.el('div', 'afs-cart-toast__message');
			message.textContent = Lang.messages.addedToCart || 'Product added to cart!';
			
			// Close button
			const closeBtn = $.el('button', 'afs-cart-toast__close');
			closeBtn.setAttribute('type', 'button');
			closeBtn.setAttribute('aria-label', 'Close');
			closeBtn.innerHTML = `
				<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>
			`;
			
			toastContent.appendChild(icon);
			toastContent.appendChild(message);
			toast.appendChild(toastContent);
			toast.appendChild(closeBtn);
			document.body.appendChild(toast);
			
			// Close button handler
			closeBtn.addEventListener('click', () => {
				toast?.classList.remove('afs-cart-toast--show');
			});
		}

		// Show toast with animation
		toast.classList.add('afs-cart-toast--show');

		// Auto-hide after 4 seconds
		const timeoutId = setTimeout(() => {
			toast?.classList.remove('afs-cart-toast--show');
		}, 4000);

		// Store timeout ID to clear if user manually closes
		(toast as any)._timeoutId = timeoutId;
	}
};

// ============================================================================
// MAIN API (Minimal)
// ============================================================================

const AFS: AFSInterface = {
	init(config: AFSConfigType = {}): void {
		try {
			Log.init(config.debug);
			Log.info('Initializing AFS', config);

			if (config.apiBaseUrl) {
				API.setBaseURL(config.apiBaseUrl);
				Log.info('API base URL set', { url: API.baseURL });
			}

			if (!config.shop) {
				throw new Error('Shop parameter is required in config');
			}

			FilterState.shop = config.shop;
			FilterState.collections = config.collections || [];
			FilterState.selectedCollection = {
				id: config.selectedCollection?.id ?? null,
				sortBy: config.selectedCollection?.sortBy ?? null
			};
			FilterState.scrollToProductsOnFilter = config.scrollToProductsOnFilter !== false;

			// Store search template flag and initial search query
			if ((config as any).isSearchTemplate) {
				(window as any).AFS_Config = { isSearchTemplate: true };
			}
			if ((config as any).initialSearchQuery) {
				// Set initial search query from Liquid
				const urlParams = UrlManager.parse();
				if (!urlParams.search && !urlParams.q) {
					FilterState.filters.search = (config as any).initialSearchQuery;
				}
			}

			// Store money format from Shopify
			if (config.moneyFormat) {
				FilterState.moneyFormat = config.moneyFormat;
			}
			if (config.moneyWithCurrencyFormat) {
				FilterState.moneyWithCurrencyFormat = config.moneyWithCurrencyFormat;
			}
			if (config.currency) {
				FilterState.currency = config.currency;
			}

			// Store fallback products and pagination from Liquid
			if (config.fallbackProducts && Array.isArray(config.fallbackProducts) && config.fallbackProducts.length > 0) {
				FilterState.fallbackProducts = config.fallbackProducts;
				Log.info('Fallback products loaded from Liquid', { count: FilterState.fallbackProducts.length });
			}

			if (config.fallbackPagination) {
				FilterState.fallbackPagination = config.fallbackPagination;
				Log.info('Fallback pagination loaded from Liquid', {
					currentPage: FilterState.fallbackPagination.currentPage,
					totalPages: FilterState.fallbackPagination.totalPages,
					totalProducts: FilterState.fallbackPagination.totalProducts
				});
			}

			// Store price range handle if provided
			if (config.priceRangeHandle !== undefined) {
				FilterState.priceRangeHandle = config.priceRangeHandle;
			}

			Log.info('Shop set', { shop: FilterState.shop });
			Log.info('Collections set', { collections: FilterState.collections });

			// Map config properties to selectors (support both old and new naming)
			const containerSelector = config.containerSelector || (config as any).container || '[data-afs-container]';
			const filtersSelector = config.filtersSelector || (config as any).filtersContainer;
			const productsSelector = config.productsSelector || (config as any).productsContainer;

			DOM.init(containerSelector, filtersSelector, productsSelector);
			Log.info('DOM initialized');

			// Show loading skeleton immediately on initial load (before API calls) - both filters and products
			DOM.showLoading();

			DOM.attachEvents();
			Log.info('DOM events attached');

			this.load();
		} catch (e) {
			Log.error('Initialization failed', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined, config });
			if (DOM.container) {
				DOM.showError(`Initialization failed: ${e instanceof Error ? e.message : String(e)}`);
			}
			throw e;
		}
	},

	async load(): Promise<void> {
		// Loading skeleton is already shown in init(), but ensure it's visible - both filters and products on initial load
		DOM.showLoading();
		try {
			// Parse URL params FIRST before loading filters, so filters endpoint gets the correct filters
			const urlParams = UrlManager.parse();
			Log.debug('Parsed URL params on load', { urlParams });

			// Rebuild filters from url params
			API.buildFiltersFromUrl(urlParams);
			API.setPaginationFromUrl(urlParams);
			API.setSortFromUrl(urlParams);

			Log.info('Loading products & filters...', { shop: FilterState.shop, filters: FilterState.filters });


			API.filters(FilterState.filters).then(Filters.process).catch(handleLoadError).finally(() => {
				DOM.hideFiltersSkeleton();
			});

			API.products(FilterState.filters, FilterState.pagination, FilterState.sort).then(Products.process).catch(handleLoadError).finally(() => {
				DOM.hideFiltersSkeleton();
			});
		} catch (e) {
			handleLoadError(e);
		}
	},

	Logger: Log
};

// ============================================================================
// SLIDER CLASS
// ============================================================================

class AFSSlider {
	private container: HTMLElement;
	private options: Required<Omit<SliderOptionsType, 'maxHeight'>> & { maxHeight: number | null };
	private _currentIndex: number = 0;

	// Public getter for currentIndex to match SliderInstance interface
	get currentIndex(): number {
		return this._currentIndex;
	}
	private images: HTMLImageElement[] = [];
	private thumbnails: HTMLElement[] = [];
	private isInitialized: boolean = false;
	private magnifierEnabled: boolean = false;
	private currentZoom: number = 2; // Active zoom level (2x, 3x, 4x, 5x) - initialized from options, can be changed via slider
	private isTouchDevice: boolean = false;
	private mainContainer: HTMLElement | null = null;
	private thumbnailContainer: HTMLElement | null = null;
	private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

	constructor(container: string | HTMLElement, options: SliderOptionsType = {}) {
		const containerElement = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;

		if (!containerElement) {
			Log.error('AFSSlider: Container not found');
			throw new Error('AFSSlider: Container not found');
		}

		this.container = containerElement;

		this.options = {
			thumbnailsPosition: options.thumbnailsPosition || 'left',
			enableKeyboard: options.enableKeyboard !== false,
			enableAutoHeight: options.enableAutoHeight !== false,
			maxHeight: options.maxHeight || null,
			animationDuration: options.animationDuration || 300,
			enableMagnifier: options.enableMagnifier !== false,
			magnifierZoom: options.magnifierZoom || 3,
			...options
		} as Required<Omit<SliderOptionsType, 'maxHeight'>> & { maxHeight: number | null };

		this.magnifierEnabled = this.options.enableMagnifier;
		this.currentZoom = this.options.magnifierZoom || 3; // Initialize zoom from options (default: 3x)
		this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		this.init();
	}

	private init(): void {
		// Find main image container
		this.mainContainer = this.container.querySelector<HTMLElement>('.afs-slider__main');
		if (!this.mainContainer) {
			Log.error('AFSSlider: Main container (.afs-slider__main) not found');
			return;
		}

		// Find thumbnail container
		this.thumbnailContainer = this.container.querySelector<HTMLElement>('.afs-slider__thumbnails');
		if (!this.thumbnailContainer) {
			Log.error('AFSSlider: Thumbnail container (.afs-slider__thumbnails) not found');
			return;
		}

		// Get all images
		const imageElements = this.mainContainer.querySelectorAll<HTMLImageElement>('.afs-slider__image');
		this.images = Array.from(imageElements);
		if (this.images.length === 0) {
			Log.error('AFSSlider: No images found');
			return;
		}

		// Get all thumbnails - ensure we find them even if they're not yet fully rendered
		const thumbnailElements = this.thumbnailContainer.querySelectorAll<HTMLElement>('.afs-slider__thumbnail');
		this.thumbnails = Array.from(thumbnailElements);

		// If no thumbnails found, log warning but continue (thumbnails might be optional)
		if (this.thumbnails.length === 0) {
			Log.warn('AFSSlider: No thumbnails found, continuing without thumbnails');
		}

		// Set thumbnail position
		this.container.setAttribute('data-thumbnails-position', this.options.thumbnailsPosition);

		// Build slider structure
		try {
			this.buildSlider();
		} catch (e) {
			Log.error('AFSSlider: Error building slider structure', { error: e instanceof Error ? e.message : String(e) });
			return;
		}

		// Setup event listeners
		try {
			this.setupEvents();
		} catch (e) {
			Log.error('AFSSlider: Error setting up events', { error: e instanceof Error ? e.message : String(e) });
			// Continue anyway - basic functionality should still work
		}

		// Setup pan-zoom magnifier if enabled and not touch device
		// Must be called AFTER buildSlider() to ensure viewport exists
		if (this.magnifierEnabled && !this.isTouchDevice) {
			try {
				// Use setTimeout to ensure viewport is fully created
				setTimeout(() => {
					this.setupPanZoom();
				}, 0);
			} catch (e) {
				Log.error('AFSSlider: Error setting up pan-zoom', { error: e instanceof Error ? e.message : String(e) });
				// Continue anyway - magnifier is optional
			}
		}

		// Setup pinch-to-zoom for touch devices
		if (this.isTouchDevice) {
			try {
				this.setupPinchZoom();
			} catch (e) {
				Log.error('AFSSlider: Error setting up pinch-zoom', { error: e instanceof Error ? e.message : String(e) });
				// Continue anyway - zoom is optional
			}
		}

		// Show first image
		try {
			this.goToSlide(0);
		} catch (e) {
			Log.error('AFSSlider: Error showing first slide', { error: e instanceof Error ? e.message : String(e) });
			// Continue anyway
		}

		this.isInitialized = true;
	}

	private buildSlider(): void {
		if (!this.mainContainer) return;

		// Wrap main images in a viewport
		if (!this.mainContainer.querySelector('.afs-slider__viewport')) {
			const viewport = document.createElement('div');
			viewport.className = 'afs-slider__viewport';

			// Move images into viewport
			this.images.forEach(img => {
				viewport.appendChild(img);
			});

			this.mainContainer.appendChild(viewport);

			// Add zoom controls if magnifier is enabled
			if (this.magnifierEnabled && !this.isTouchDevice) {
				this.createZoomControls(viewport);
			}
		}

		// Add navigation buttons if not present
		if (!this.mainContainer.querySelector('.afs-slider__prev')) {
			const prevBtn = document.createElement('button');
			prevBtn.type = 'button';
			prevBtn.className = 'afs-slider__prev';
			prevBtn.setAttribute('aria-label', 'Previous image');
			prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
			this.mainContainer.appendChild(prevBtn);
		}

		if (!this.mainContainer.querySelector('.afs-slider__next')) {
			const nextBtn = document.createElement('button');
			nextBtn.type = 'button';
			nextBtn.className = 'afs-slider__next';
			nextBtn.setAttribute('aria-label', 'Next image');
			nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
			this.mainContainer.appendChild(nextBtn);
		}

		// Setup thumbnail click handlers - re-query thumbnails in case they weren't found initially
		if (this.thumbnails.length === 0 && this.thumbnailContainer) {
			const thumbnailElements = this.thumbnailContainer.querySelectorAll<HTMLElement>('.afs-slider__thumbnail');
			this.thumbnails = Array.from(thumbnailElements);
		}

		this.thumbnails.forEach((thumb, index) => {
			// Remove any existing click handlers to avoid duplicates
			const newThumb = thumb.cloneNode(true) as HTMLElement;
			thumb.parentNode?.replaceChild(newThumb, thumb);
			this.thumbnails[index] = newThumb;

			newThumb.addEventListener('click', () => {
				this.goToSlide(index);
			});
		});

		// Setup navigation buttons
		const prevBtn = this.mainContainer.querySelector<HTMLButtonElement>('.afs-slider__prev');
		const nextBtn = this.mainContainer.querySelector<HTMLButtonElement>('.afs-slider__next');

		if (prevBtn) {
			prevBtn.addEventListener('click', () => this.prevSlide());
		}

		if (nextBtn) {
			nextBtn.addEventListener('click', () => this.nextSlide());
		}
	}

	private setupEvents(): void {
		// Keyboard navigation
		if (this.options.enableKeyboard) {
			this.keyboardHandler = (e: KeyboardEvent) => {
				if (!this.isInitialized) return;

				// Only handle if slider is visible (check if container is in viewport)
				const rect = this.container.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;

				switch (e.key) {
					case 'ArrowLeft':
						e.preventDefault();
						this.prevSlide();
						break;
					case 'ArrowRight':
						e.preventDefault();
						this.nextSlide();
						break;
					case 'Escape':
						// Reset zoom on escape using CSS class
						const activeImage = this.images[this.currentIndex];
						if (activeImage) {
							activeImage.classList.remove('afs-slider__image--zoomed');
							activeImage.classList.add('afs-slider__image--zoom-reset');
							setTimeout(() => {
								activeImage.classList.remove('afs-slider__image--zoom-reset');
							}, 200);
						}
						break;
				}
			};

			document.addEventListener('keydown', this.keyboardHandler);
		}

		// Touch/swipe support for mobile
		this.setupTouchEvents();

		// Auto-adjust height
		if (this.options.enableAutoHeight) {
			this.adjustHeight();
			window.addEventListener('resize', () => this.adjustHeight());
		}
	}

	private setupTouchEvents(): void {
		if (!this.mainContainer) return;

		let startX = 0;
		let startY = 0;
		let isDragging = false;

		const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
		if (!viewport) return;

		viewport.addEventListener('touchstart', (e: TouchEvent) => {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			isDragging = true;
		}, { passive: true });

		viewport.addEventListener('touchmove', (e: TouchEvent) => {
			if (!isDragging) return;
			e.preventDefault();
		}, { passive: false });

		viewport.addEventListener('touchend', (e: TouchEvent) => {
			if (!isDragging) return;
			isDragging = false;

			const endX = e.changedTouches[0].clientX;
			const endY = e.changedTouches[0].clientY;
			const diffX = startX - endX;
			const diffY = startY - endY;

			// Only handle horizontal swipes (ignore if vertical swipe is larger)
			if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
				if (diffX > 0) {
					this.nextSlide();
				} else {
					this.prevSlide();
				}
			}
		}, { passive: true });
	}

	/**
	 * Create zoom control slider (2x, 3x, 4x, 5x)
	 */
	private createZoomControls(viewport: HTMLElement): void {
		const zoomControls = document.createElement('div');
		zoomControls.className = 'afs-slider__zoom-controls';

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.className = 'afs-slider__zoom-slider';
		slider.setAttribute('min', '2');
		slider.setAttribute('max', '5');
		slider.setAttribute('step', '1');
		slider.setAttribute('value', String(this.currentZoom));
		slider.setAttribute('aria-label', 'Zoom level');
		slider.setAttribute('aria-valuemin', '2');
		slider.setAttribute('aria-valuemax', '5');

		// Update zoom level when slider changes
		slider.addEventListener('input', (e) => {
			e.stopPropagation();
			const level = Number((e.target as HTMLInputElement).value);
			this.setZoomLevel(level);
		});

		// Prevent slider from interfering with image pan
		slider.addEventListener('mousedown', (e) => {
			e.stopPropagation();
		});

		zoomControls.appendChild(slider);
		viewport.appendChild(zoomControls);
	}

	/**
	 * Set zoom level and update UI
	 */
	private setZoomLevel(level: number): void {
		this.currentZoom = level;

		// Update slider value
		const viewport = this.mainContainer?.querySelector<HTMLElement>('.afs-slider__viewport');
		if (viewport) {
			const slider = viewport.querySelector<HTMLInputElement>('.afs-slider__zoom-slider');
			if (slider) {
				slider.value = String(level);
				slider.setAttribute('aria-valuenow', String(level));
			}
		}

		// Reset zoom on current image to apply new zoom level
		const activeImage = this.images[this._currentIndex];
		if (activeImage && activeImage.classList.contains('afs-slider__image--zoomed')) {
			// Temporarily reset, then re-apply zoom with new level
			activeImage.style.transform = 'scale(1) translate(0, 0)';
			setTimeout(() => {
				// Zoom will be re-applied on next mouse move
			}, 50);
		}
	}

	private setupPanZoom(): void {
		if (!this.mainContainer) return;

		const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
		if (!viewport) {
			Log.warn('AFSSlider: Viewport not found for pan-zoom, skipping zoom setup');
			return;
		}

		// Add zoom class to viewport for cursor styling
		viewport.classList.add('afs-slider__viewport--zoomable');

		// Mouse move: pan image
		viewport.addEventListener('mousemove', (e: MouseEvent) => {
			const activeImage = this.images[this._currentIndex];
			if (!activeImage) return;

			const rect = viewport.getBoundingClientRect();

			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			const xPercent = x / rect.width;
			const yPercent = y / rect.height;

			// Use currentZoom (can be changed via slider)
			const SCALE = this.currentZoom;

			const translateX = -xPercent * (activeImage.offsetWidth * SCALE - rect.width);
			const translateY = -yPercent * (activeImage.offsetHeight * SCALE - rect.height);

			// Use inline transform for zoom (necessary for dynamic pan-zoom)
			// But use CSS class for transition control
			activeImage.style.transform = `
		scale(${SCALE})
		translate(${translateX / SCALE}px, ${translateY / SCALE}px)
	  `;
			activeImage.classList.add('afs-slider__image--zoomed');
		});

		// Mouse enter: enable smooth transition
		viewport.addEventListener('mouseenter', () => {
			const activeImage = this.images[this._currentIndex];
			if (activeImage) {
				activeImage.classList.add('afs-slider__image--zoomed');
			}
		});

		// Mouse leave: reset zoom
		viewport.addEventListener('mouseleave', () => {
			const activeImage = this.images[this._currentIndex];
			if (activeImage) {
				// Reset transform to scale(1) and remove translate
				activeImage.style.transform = 'scale(1) translate(0, 0)';
				activeImage.classList.remove('afs-slider__image--zoomed');
				activeImage.classList.add('afs-slider__image--zoom-reset');
				// Remove reset class after transition
				setTimeout(() => {
					activeImage.classList.remove('afs-slider__image--zoom-reset');
				}, 200);
			}
		});
	}

	/**
	 * Setup pinch-to-zoom for touch devices
	 */
	private setupPinchZoom(): void {
		if (!this.mainContainer || !this.isTouchDevice) return;

		const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
		if (!viewport) return;

		let initialDistance = 0;
		let currentScale = 1;
		let lastTouchTime = 0;
		let doubleTapTimeout: ReturnType<typeof setTimeout> | null = null;

		viewport.addEventListener('touchstart', (e: TouchEvent) => {
			if (e.touches.length === 2) {
				// Pinch gesture
				e.preventDefault();
				const touch1 = e.touches[0];
				const touch2 = e.touches[1];
				initialDistance = Math.hypot(
					touch2.clientX - touch1.clientX,
					touch2.clientY - touch1.clientY
				);
				const activeImage = this.images[this._currentIndex];
				if (activeImage) {
					// Get current scale from transform
					const transform = activeImage.style.transform || '';
					const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
					currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
				}
			} else if (e.touches.length === 1) {
				// Single touch - check for double tap
				const now = Date.now();
				if (now - lastTouchTime < 300) {
					// Double tap detected
					e.preventDefault();
					if (doubleTapTimeout) clearTimeout(doubleTapTimeout);

					const activeImage = this.images[this._currentIndex];
					if (activeImage) {
						const transform = activeImage.style.transform || '';
						const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
						let currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

						if (currentScale > 1) {
							// Reset zoom
							activeImage.style.transform = 'scale(1) translate(0, 0)';
							currentScale = 1;
						} else {
							// Zoom in
							const rect = viewport.getBoundingClientRect();
							const touch = e.touches[0];
							const x = touch.clientX - rect.left;
							const y = touch.clientY - rect.top;
							const zoomScale = 2.5;

							activeImage.style.transform = `scale(${zoomScale}) translate(${(rect.width / 2 - x) / zoomScale}px, ${(rect.height / 2 - y) / zoomScale}px)`;
							currentScale = zoomScale;
						}
					}
				} else {
					lastTouchTime = now;
				}
			}
		}, { passive: false });

		viewport.addEventListener('touchmove', (e: TouchEvent) => {
			if (e.touches.length === 2) {
				// Pinch gesture
				e.preventDefault();
				const touch1 = e.touches[0];
				const touch2 = e.touches[1];
				const distance = Math.hypot(
					touch2.clientX - touch1.clientX,
					touch2.clientY - touch1.clientY
				);

				const scale = Math.max(1, Math.min(4, currentScale * (distance / initialDistance)));
				const activeImage = this.images[this._currentIndex];

				if (activeImage) {
					const rect = viewport.getBoundingClientRect();
					const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
					const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

					const translateX = (rect.width / 2 - centerX) / scale;
					const translateY = (rect.height / 2 - centerY) / scale;

					activeImage.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
				}
			}
		}, { passive: false });

		viewport.addEventListener('touchend', () => {
			initialDistance = 0;
		});
	}

	goToSlide(index: number): void {
		if (index < 0 || index >= this.images.length) return;

		this._currentIndex = index;

		// Update images visibility - use CSS classes only (inline styles override CSS)
		this.images.forEach((img, i) => {
			if (i === index) {
				img.classList.add('afs-slider__image--active');
				// Removed inline style.display - let CSS handle it via --active class
			} else {
				img.classList.remove('afs-slider__image--active');
				// Removed inline style.display - let CSS handle it via --active class
			}
		});

		// Reset zoom when slide changes using CSS class
		const activeImage = this.images[this._currentIndex];
		if (activeImage) {
			activeImage.classList.remove('afs-slider__image--zoomed');
			activeImage.classList.add('afs-slider__image--zoom-reset');
			setTimeout(() => {
				activeImage.classList.remove('afs-slider__image--zoom-reset');
			}, 200);
		}

		// Update thumbnails
		this.thumbnails.forEach((thumb, i) => {
			thumb.classList.toggle('afs-slider__thumbnail--active', i === index);
		});

		// Adjust height if enabled
		if (this.options.enableAutoHeight) {
			this.adjustHeight();
		}

		// Trigger custom event
		this.container.dispatchEvent(new CustomEvent<SliderSlideChangeEventDetailType>('afs-slider:slide-change', {
			detail: { index, total: this.images.length }
		}));
	}

	prevSlide(): void {
		const newIndex = this._currentIndex > 0
			? this._currentIndex - 1
			: this.images.length - 1;
		this.goToSlide(newIndex);
	}

	nextSlide(): void {
		const newIndex = this._currentIndex < this.images.length - 1
			? this._currentIndex + 1
			: 0;
		this.goToSlide(newIndex);
	}

	private adjustHeight(): void {
		const activeImage = this.images[this._currentIndex];
		if (!activeImage) return;

		// Wait for image to load
		if (activeImage.complete) {
			this.setHeight(activeImage);
		} else {
			activeImage.addEventListener('load', () => {
				this.setHeight(activeImage);
			}, { once: true });
		}
	}

	private setHeight(image: HTMLImageElement): void {
		if (!this.mainContainer) return;

		const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
		if (!viewport) return;

		// If maxHeight is set, use fixed height
		if (this.options.maxHeight) {
			viewport.style.height = `${this.options.maxHeight}px`;
			viewport.style.minHeight = `${this.options.maxHeight}px`;
			viewport.style.maxHeight = `${this.options.maxHeight}px`;
			return;
		}

		const imgHeight = image.naturalHeight || image.offsetHeight;
		const imgWidth = image.naturalWidth || image.offsetWidth;
		const containerWidth = this.mainContainer.offsetWidth;
		// Calculate aspect ratio
		const aspectRatio = imgHeight / imgWidth;
		const calculatedHeight = containerWidth * aspectRatio;

		viewport.style.height = `${calculatedHeight}px`;
		viewport.style.minHeight = `${calculatedHeight}px`;
	}

	/**
	 * Update slider to show variant's image
	 * @param variant - Variant object with image property
	 * @param productImages - Array of product image URLs
	 * @param allVariants - Optional: Array of all product variants for variant_ids optimization
	 * @returns Returns true if image was found and updated, false otherwise
	 */
	updateVariantImage(variant: ProductVariantType, productImages: string[], allVariants?: ProductVariantType[]): boolean {
		if (!variant || !productImages || !Array.isArray(productImages) || productImages.length === 0) {
			return false;
		}

		const currentVariantId = variant.id;

		// OPTIMIZATION: Quick check using variant_ids array if allVariants is provided
		if (allVariants && Array.isArray(allVariants)) {
			// Check if current variant has featured_image with variant_ids
			if (variant.featured_image && typeof variant.featured_image === 'object' && variant.featured_image.variant_ids) {
				const variantImagePosition = variant.featured_image.position;
				if (variantImagePosition !== null && variantImagePosition !== undefined) {
					const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
					if (positionIndex >= 0 && positionIndex < this.images.length && positionIndex < productImages.length) {
						// Check if current slide is different from this variant's image
						if (this._currentIndex !== positionIndex) {
							this.goToSlide(positionIndex);
							return true;
						}
						// Already on correct image
						return true;
					}
				}
			}

			// Variant doesn't have featured_image, but check if any other variant's image is assigned to this variant
			for (const v of allVariants) {
				if (v.featured_image && typeof v.featured_image === 'object' && v.featured_image.variant_ids) {
					// Check if current variant ID is in this image's variant_ids array
					if (v.featured_image.variant_ids.includes(Number(currentVariantId))) {
						const variantImagePosition = v.featured_image.position;
						if (variantImagePosition !== null && variantImagePosition !== undefined) {
							const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
							if (positionIndex >= 0 && positionIndex < this.images.length && positionIndex < productImages.length) {
								// Check if current slide is different from this variant's image
								if (this._currentIndex !== positionIndex) {
									this.goToSlide(positionIndex);
									return true;
								}
								// Already on correct image
								return true;
							}
						}
					}
				}
			}
		}

		// Fallback: Extract variant image URL from various possible structures
		let variantImageUrl: string | null = null;
		let variantImagePosition: number | null = null;

		// Handle featured_image as object (Shopify format: { src: "...", position: 5, ... })
		if (variant.featured_image) {
			if (typeof variant.featured_image === 'object') {
				variantImageUrl = variant.featured_image.src || variant.featured_image.url || null;
				variantImagePosition = variant.featured_image.position ?? null;
			} else if (typeof variant.featured_image === 'string') {
				variantImageUrl = variant.featured_image;
			}
		}

		// Fallback to other image properties
		if (!variantImageUrl) {
			if (typeof variant.image === 'string') {
				variantImageUrl = variant.image;
			} else if (variant.image && typeof variant.image === 'object') {
				variantImageUrl = variant.image.url || variant.image.src || null;
			} else if (variant.imageUrl) {
				variantImageUrl = variant.imageUrl;
			} else if (variant.featuredImage && typeof variant.featuredImage === 'object') {
				variantImageUrl = variant.featuredImage.url || variant.featuredImage.src || null;
			}
		}

		if (!variantImageUrl) {
			return false;
		}

		// Normalize image URL for comparison (remove protocol, query params, etc.)
		const normalizeUrl = (url: string | { url?: string; src?: string } | null | undefined): string => {
			if (!url) return '';
			// Handle both string URLs and object URLs
			const urlString = typeof url === 'string' ? url : (url?.url || url?.src || '');
			// Remove protocol, normalize to https, remove query params
			return urlString
				.replace(/^https?:\/\//, '')
				.replace(/^\/\//, '')
				.split('?')[0]
				.toLowerCase()
				.trim();
		};

		const normalizedVariantImage = normalizeUrl(variantImageUrl);

		// First, try to use position if available (1-based, convert to 0-based index)
		if (variantImagePosition !== null && variantImagePosition !== undefined) {
			const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
			if (positionIndex >= 0 && positionIndex < this.images.length && positionIndex < productImages.length) {
				// Check if current slide is different
				if (this._currentIndex !== positionIndex) {
					this.goToSlide(positionIndex);
					return true;
				}
				return true;
			}
		}

		// Find matching image in product images array by URL
		let variantImageIndex = productImages.findIndex(img => {
			const normalizedImg = normalizeUrl(img);
			// Compare normalized URLs
			return normalizedImg === normalizedVariantImage ||
				normalizedImg.includes(normalizedVariantImage) ||
				normalizedVariantImage.includes(normalizedImg);
		});

		// If exact match not found, try to find by filename
		if (variantImageIndex === -1) {
			const variantImageFilename = normalizedVariantImage.split('/').pop();
			variantImageIndex = productImages.findIndex(img => {
				const imgFilename = normalizeUrl(img).split('/').pop();
				return imgFilename === variantImageFilename;
			});
		}

		if (variantImageIndex !== -1 && variantImageIndex < this.images.length) {
			// Check if current slide is different
			if (this._currentIndex !== variantImageIndex) {
				this.goToSlide(variantImageIndex);
				return true;
			}
			return true;
		}

		return false;
	}

	destroy(): void {
		// Remove keyboard listener
		if (this.keyboardHandler) {
			document.removeEventListener('keydown', this.keyboardHandler);
			this.keyboardHandler = null;
		}

		// Reset zoom state using CSS classes
		this.images.forEach(img => {
			img.classList.remove('afs-slider__image--zoomed');
			img.classList.add('afs-slider__image--zoom-reset');
			setTimeout(() => {
				img.classList.remove('afs-slider__image--zoom-reset');
			}, 200);
		});

		this.isInitialized = false;
	}
}

// Create Product Modal using Ajax API
async function createProductModal(handle: string, modalId: string): Promise<ProductModalElement> {

	const dialog = $.el('dialog', 'afs-product-modal', { 'id': modalId }) as ProductModalElement;

	// Show loading state
	const loadingText = Lang?.labels?.loadingProduct || 'Loading product...';
	dialog.innerHTML = `
	  <div class="afs-product-modal__container">
		<div class="afs-product-modal__close-container">
		  <button class="afs-product-modal__close" type="button">${Icons.close}</button>
		</div>
		<div class="afs-product-modal__content">
		  <div class="afs-product-modal__loading" style="padding: 2rem; text-align: center;">
			${loadingText}
		  </div>
		</div>
	  </div>
	`;

	// Get locale-aware URL using Shopify routes
	const routesRoot = (AFSW.Shopify && AFSW.Shopify.routes && AFSW.Shopify.routes.root) || '/';
	const productUrl = `${routesRoot}products/${handle}.js`;

	try {
		// Fetch product data using Ajax API
		const response = await fetch(productUrl);
		if (!response.ok) {
			const errorText = await response.text().catch(() => '');
			const errorMsg = `Failed to load product: HTTP ${response.status} ${response.statusText}${errorText ? ' - ' + errorText.substring(0, 100) : ''}`;
			Log.error('Product fetch failed', { status: response.status, statusText: response.statusText, url: productUrl, errorText });
			throw new Error(errorMsg);
		}
		const productData = await response.json() as ProductType;

		// Ajax API returns product directly (not wrapped in {product: ...})
		// Verify it has the expected structure
		if (!productData.variants || !Array.isArray(productData.variants)) {
			throw new Error('Invalid product data structure');
		}

		// Find first available variant or first variant
		const selectedVariant = productData.variants.find(v => isVariantAvailable(v)) || productData.variants[0];
		let currentVariantId: number | string | null = selectedVariant ? selectedVariant.id : null;

		// Build variant selector HTML
		const buildVariantSelector = (): string => {
			if (!productData.variants || productData.variants.length === 0) return '';

			// Don't render variant selector if product has only one variant with "Default Title"
			// This is Shopify's default single variant (not a real variant)
			if (productData.variants.length === 1) {
				const firstVariant = productData.variants[0];
				const variantTitle = (firstVariant as { title?: string }).title;
				if (variantTitle && $.equals(variantTitle, SpecialValueType.DEFAULT_TITLE)) {
					return '';
				}
			}

			if (!productData.options || productData.options.length === 0) return '';

			let html = '<div class="afs-product-modal__variant-selector">';
			productData.options.forEach((option, optionIndex) => {
				html += `<div class="afs-product-modal__option-group">`;
				html += `<label class="afs-product-modal__option-label">${option.name}</label>`;
				html += `<div class="afs-product-modal__option-values">`;

				// Get unique values for this option
				const uniqueValues = [...new Set(productData.variants!.map(v => {
					if (optionIndex === 0) return v.option1;
					if (optionIndex === 1) return v.option2;
					return v.option3;
				}).filter(Boolean))];

				// Build selected options array based on selectedVariant for availability checking
				const selectedOptions: (string | null)[] = Array.from({ length: productData.options?.length || 0 }, (_, idx) => {
					if (idx === optionIndex) return null; // Don't include current option being checked
					if (!selectedVariant) return null;
					if (idx === 0) return selectedVariant.option1 || null;
					if (idx === 1) return selectedVariant.option2 || null;
					return selectedVariant.option3 || null;
				});

				uniqueValues.forEach(value => {
					if (!value) return; // Skip undefined/null values

					// Use isOptionValueAvailable to check if this option value is available
					// given the currently selected options from other option groups
					const isAvailable = isOptionValueAvailable(productData, optionIndex, value, selectedOptions);

					// Check if this option value matches the selected variant's option value for this option index
					const isSelected = selectedVariant && (
						(optionIndex === 0 && selectedVariant.option1 === value) ||
						(optionIndex === 1 && selectedVariant.option2 === value) ||
						(optionIndex === 2 && selectedVariant.option3 === value)
					);

					// Find variant for data-variant-id attribute (any variant with this option value)
					const variant = productData.variants!.find(v => {
						if (optionIndex === 0) return v.option1 === value;
						if (optionIndex === 1) return v.option2 === value;
						return v.option3 === value;
					});

					html += `<button 
			  class="afs-product-modal__option-value ${isSelected ? 'afs-product-modal__option-value--selected' : ''} ${!isAvailable ? 'afs-product-modal__option-value--unavailable' : ''}"
			  data-option-index="${optionIndex}"
			  data-option-value="${value}"
			  data-variant-id="${variant ? variant.id : ''}"
			  ${!isAvailable ? 'disabled' : ''}
			  type="button"
			>${value}</button>`;
				});

				html += `</div></div>`;
			});
			html += '</div>';
			return html;
		};

		// Build images HTML using slider structure with full optimization
		const buildImagesHTML = (): { thumbnails: string; mainImages: string } => {
			if (!productData.images || productData.images.length === 0) {
				// Return empty structure if no images
				return {
					thumbnails: '',
					mainImages: '<div class="afs-slider__main"><div style="padding: 2rem; text-align: center;">No images available</div></div>'
				};
			}

			// Build thumbnails with optimized/cropped images and srcset
			let thumbnailsHTML = '<div class="afs-slider__thumbnails">';
			productData.images.forEach((image, index) => {
				const isActive = index === 0 ? 'afs-slider__thumbnail--active' : '';

				// Optimize thumbnail: small square cropped image
				const thumbnailUrl = $.optimizeImageUrl(image, {
					width: 100,
					height: 100,
					crop: 'center',
					format: 'webp',
					quality: 75
				});

				// Build srcset for thumbnails (responsive sizes with crop)
				const thumbnailSizes = [80, 100, 120];
				const thumbnailSrcset = thumbnailSizes.map(size => {
					const optimized = $.optimizeImageUrl(image, {
						width: size,
						height: size,
						crop: 'center',
						format: 'webp',
						quality: 75
					});
					return `${optimized} ${size}w`;
				}).join(', ');

				thumbnailsHTML += `
			<div class="afs-slider__thumbnail ${isActive}" data-slide-index="${index}">
			  <img 
				src="${thumbnailUrl}" 
				srcset="${thumbnailSrcset}"
				sizes="100px"
				alt="${productData.title} - Thumbnail ${index + 1}" 
				loading="lazy"
				width="100"
				height="100"
			  />
			</div>
		  `;
			});
			thumbnailsHTML += '</div>';

			// Build main images with optimized full images (no cropping) and srcset
			let mainImagesHTML = '<div class="afs-slider__main">';
			productData.images.forEach((image, index) => {
				// Optimize main image: larger size, no cropping, maintain aspect ratio
				const mainImageUrl = $.optimizeImageUrl(image, {
					width: 800,
					height: 800, // Max height, will maintain aspect ratio
					format: 'webp',
					quality: 85
					// No crop parameter = maintains aspect ratio
				});

				// Build srcset for main images (responsive sizes for different screen sizes, no crop)
				const mainImageSizes = [400, 600, 800, 1000, 1200];
				const mainImageSrcset = mainImageSizes.map(size => {
					const optimized = $.optimizeImageUrl(image, {
						width: size,
						height: size,
						format: 'webp',
						quality: size <= 600 ? 80 : 85
						// No crop = maintains aspect ratio
					});
					return `${optimized} ${size}w`;
				}).join(', ');

				mainImagesHTML += `
			<img 
			  class="afs-slider__image" 
			  src="${mainImageUrl}" 
			  srcset="${mainImageSrcset}"
			  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 600px"
			  alt="${productData.title} - Image ${index + 1}" 
			  loading="${index === 0 ? 'eager' : 'lazy'}"
			/>
		  `;
			});
			mainImagesHTML += '</div>';

			return {
				thumbnails: thumbnailsHTML,
				mainImages: mainImagesHTML
			};
		};

		const imagesHTML = buildImagesHTML();
		const variantSelectorHTML = buildVariantSelector();

		// Format price
		const formatPrice = (price: number | string): string => {
			return $.formatMoney(price, FilterState.moneyFormat || '{{amount}}', FilterState.currency || '');
		};

		const currentVariant = productData.variants.find(v => v.id === currentVariantId) || selectedVariant;
		const priceHTML = formatPrice(currentVariant.price);
		const comparePriceHTML = currentVariant.compare_at_price && currentVariant.compare_at_price > currentVariant.price
			? `<span class="afs-product-modal__compare-price">${formatPrice(currentVariant.compare_at_price)}</span>`
			: '';

		// Build full modal HTML
		dialog.innerHTML = `
		<div class="afs-product-modal__container">
		  <div class="afs-product-modal__close-container">
			<button class="afs-product-modal__close" type="button">${Icons.close}</button>
		  </div>
		  <div class="afs-product-modal__content">
			<div class="afs-product-modal__layout">
			  <div class="afs-product-modal__media">
				<div class="afs-slider" id="${modalId}-slider">
				  ${imagesHTML.mainImages}
				  ${imagesHTML.thumbnails}
				</div>
			  </div>
			  <div class="afs-product-modal__details">
				<div class="afs-product-modal__header">
				  <div>
					<span class="afs-product-modal__vendor">${productData.vendor || ''}</span>
				  </div>
				  <h1 class="afs-product-modal__title">${productData.title || ''}</h1>
				  <div class="afs-product-modal__price-container">
					<span class="afs-product-modal__price">${priceHTML}</span>
					${comparePriceHTML}
				  </div>
				</div>
				${variantSelectorHTML}
				<div class="afs-product-modal__buttons">
				  <div class="afs-product-modal__add-to-cart">
					<div class="afs-product-modal__incrementor">
					  <button class="afs-product-modal__decrease" type="button">${Icons.minus}</button>
					  <span class="afs-product-modal__count" id="${modalId}-count">1</span>
					  <button class="afs-product-modal__increase" type="button">${Icons.plus}</button>
					</div>
					<button
					  class="afs-product-modal__add-button"
					  id="${modalId}-add-button"
					  data-variant-id="${currentVariantId}"
					  ${!isVariantAvailable(currentVariant) ? 'disabled' : ''}
					  type="button"
					>
					  ${!isVariantAvailable(currentVariant) ? (Lang?.buttons?.soldOut || 'Sold out') : (Lang?.buttons?.addToCart || 'Add to cart')}
					</button>
				  </div>
				  <button
					class="afs-product-modal__buy-button"
					id="${modalId}-buy-button"
					data-variant-id="${currentVariantId}"
					${!isVariantAvailable(currentVariant) ? 'disabled' : ''}
					type="button"
				  >
					${Lang?.buttons?.buyNow || 'Buy it now'}
				  </button>
				</div>
				<div class="afs-product-modal__description">
				  <span class="afs-product-modal__description-text">
					${productData.description || ''}
				  </span>
				</div>
			  </div>
			</div>
		  </div>
		</div>
	  `;

		// Store product data on dialog element
		dialog._productData = productData;
		dialog._currentVariantId = currentVariantId || undefined;

		// Initialize slider after DOM is ready - use proper DOM ready check
		(async () => {
			try {
				// Wait for slider container to be in DOM
				const sliderContainer = await waitForElement(`#${modalId}-slider`, dialog, 3000);

				// Wait for images to be in DOM
				const images = await waitForElements(
					Array.from({ length: 10 }, (_, i) => `.afs-slider__image:nth-child(${i + 1})`),
					sliderContainer,
					2000
				).catch(() => {
					// Fallback: get whatever images exist
					return Array.from(sliderContainer.querySelectorAll<HTMLImageElement>('.afs-slider__image'));
				});

				// Also wait for thumbnails to be in DOM (non-blocking)
				await waitForElement('.afs-slider__thumbnails', sliderContainer, 1000).catch(() => {
					Log.warn('Thumbnails container not found, slider will continue without thumbnails', { modalId });
				});

				if (images.length > 0) {
					dialog._slider = new AFSSlider(sliderContainer, {
						thumbnailsPosition: 'left', // Can be 'top', 'left', 'right', 'bottom'
						enableKeyboard: true,
						enableAutoHeight: false, // Disable auto height to prevent shrinking
						maxHeight: 600, // Fixed max height in pixels
						enableMagnifier: true, // Enable image magnifier on hover
						magnifierZoom: 2, // 2x zoom level for magnifier
					});
				} else {
					Log.warn('No images found for slider', { modalId });
				}
			} catch (error) {

				Log.error('Failed to initialize slider', {
					error: error instanceof Error ? error.message : String(error),
					modalId
				});
			}
		})();

		// Setup event handlers
		setupModalHandlers(dialog, modalId, productData, formatPrice);

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorDetails = error instanceof Error ? { message: errorMessage, stack: error.stack } : { message: errorMessage };
		Log.error('Failed to load product for modal', {
			error: errorDetails,
			handle,
			productUrl,
			responseStatus: error instanceof Error && 'status' in error ? (error as any).status : undefined
		});

		const userMessage = Lang?.messages?.failedToLoadProductModal || 'Failed to load product. Please try again.';
		dialog.innerHTML = `
		<div class="afs-product-modal__container">
		  <div class="afs-product-modal__close-container">
			<button class="afs-product-modal__close" type="button">${Icons.close}</button>
		  </div>
		  <div class="afs-product-modal__content">
			<div style="padding: 2rem; text-align: center;">
			  <p>${userMessage}</p>
			  ${Log.enabled ? `<p style="font-size: 0.875rem; color: #666; margin-top: 0.5rem;">Error: ${errorMessage}</p>` : ''}
			</div>
		  </div>
		</div>
	  `;
		// Setup close handler for error case (use same handler as success case to avoid duplicates)
		const closeBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__close');
		const closeModal = (): void => {
			if (dialog._slider && typeof dialog._slider.destroy === 'function') {
				dialog._slider.destroy();
				dialog._slider = undefined;
			}
			document.body.style.overflow = '';
			document.body.style.removeProperty('overflow');
			if (dialog.close) {
				dialog.close();
			} else {
				dialog.style.display = 'none';
			}
		};
		if (closeBtn) {
			closeBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				closeModal();
			});
		}
		dialog.addEventListener('cancel', closeModal);
		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) {
				closeModal();
			}
		});
	}

	return dialog;
}

function setupModalHandlers(
	dialog: ProductModalElement,
	modalId: string,
	product: ProductType,
	formatPrice: (price: number | string) => string
): void {
	const closeBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__close');

	const closeModal = (): void => {
		// Destroy slider if it exists
		if (dialog._slider && typeof dialog._slider.destroy === 'function') {
			dialog._slider.destroy();
			dialog._slider = undefined;
		}

		document.body.style.overflow = '';
		document.body.style.removeProperty('overflow');
		if (dialog.close) {
			dialog.close();
		} else {
			dialog.style.display = 'none';
		}
	};

	// Close button
	if (closeBtn) {
		closeBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			closeModal();
		});
	}

	// ESC key and backdrop click
	dialog.addEventListener('cancel', (e) => {
		e.preventDefault();
		closeModal();
	});

	dialog.addEventListener('click', (e) => {
		if (e.target === dialog) {
			closeModal();
		}
	});

	// Quantity controls
	const decreaseBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__decrease');
	const increaseBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__increase');
	const countDisplay = dialog.querySelector<HTMLElement>(`#${modalId}-count`);

	if (decreaseBtn && countDisplay) {
		decreaseBtn.addEventListener('click', () => {
			const currentCount = parseInt(countDisplay.textContent || '1', 10) || 1;
			if (currentCount > 1) {
				countDisplay.textContent = String(currentCount - 1);
			}
		});
	}

	if (increaseBtn && countDisplay) {
		increaseBtn.addEventListener('click', () => {
			const currentCount = parseInt(countDisplay.textContent || '1', 10) || 1;
			countDisplay.textContent = String(currentCount + 1);
		});
	}

	// Variant selector
	const variantButtons = dialog.querySelectorAll<HTMLButtonElement>('.afs-product-modal__option-value');
	variantButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			if (btn.disabled) return;

			const optionIndex = Number(btn.dataset.optionIndex);
			const optionValue = btn.dataset.optionValue!;
			const selected = getSelectedOptions(dialog, product.options!.length);

			// Update selected value
			selected[optionIndex] = optionValue;

			// Update UI selection
			dialog.querySelectorAll<HTMLButtonElement>(
				`.afs-product-modal__option-value[data-option-index="${optionIndex}"]`
			).forEach(b => b.classList.remove('afs-product-modal__option-value--selected'));

			btn.classList.add('afs-product-modal__option-value--selected');

			// Recalculate availability for ALL buttons
			dialog.querySelectorAll<HTMLButtonElement>('.afs-product-modal__option-value')
				.forEach(b => {
					const idx = Number(b.dataset.optionIndex);
					const val = b.dataset.optionValue!;
					const available = isOptionValueAvailable(product, idx, val, selected);

					b.disabled = !available;
					b.classList.toggle(
						'afs-product-modal__option-value--unavailable',
						!available
					);
				});

			// Resolve final variant
			const matches = findMatchingVariants(product.variants!, selected);
			const availableVariant = matches.find(v => isVariantAvailable(v));
			// If no available variant found, use first matching variant (will show as sold out)
			const selectedVariant = availableVariant || matches[0];

			if (selectedVariant) {
				// Wait for slider to be ready if it's still initializing
				if (!dialog._slider) {
					// Wait up to 2 seconds for slider to initialize
					const waitForSlider = (attempts = 0): void => {
						if (dialog._slider) {
							updateVariantInModal(dialog, modalId, selectedVariant, formatPrice);
						} else if (attempts < 20) {
							setTimeout(() => waitForSlider(attempts + 1), 100);
						} else {
							Log.warn('Slider not ready for variant update', { modalId });
							// Update price and buttons even if slider isn't ready
							updateVariantInModal(dialog, modalId, selectedVariant, formatPrice);
						}
					};
					waitForSlider();
				} else {
					updateVariantInModal(dialog, modalId, selectedVariant, formatPrice);
				}
			} else {
				Log.warn('No matching variant found for selected options', {
					selected: selected.filter(Boolean) as string[],
					matchesCount: matches.length
				});
			}
		});
	});


	// Add to cart button
	const addButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-add-button`);
	if (addButton && countDisplay) {
		addButton.addEventListener('click', async () => {
			if (addButton.disabled) return;
			const quantity = parseInt(countDisplay.textContent || '1', 10) || 1;
			const variantId = addButton.dataset.variantId;

			try {
				await QuickAdd.addVariant(parseInt(variantId || '0', 10), quantity);
				closeModal();
			} catch (error) {
				Log.error('Failed to add to cart from modal', { error: error instanceof Error ? error.message : String(error) });
				DOM.showError(Lang?.messages?.failedToAddToCart || 'Failed to add product to cart. Please try again.');
			}
		});
	}

	// Buy now button
	const buyButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-buy-button`);
	if (buyButton && countDisplay) {
		buyButton.addEventListener('click', async () => {
			if (buyButton.disabled) return;
			const quantity = parseInt(countDisplay.textContent || '1', 10) || 1;
			const variantId = buyButton.dataset.variantId;

			try {
				const routesRoot = (AFSW.Shopify && AFSW.Shopify.routes && AFSW.Shopify.routes.root) || '/';
				// Redirect to checkout
				window.location.href = `${routesRoot}cart/${variantId}:${quantity}?checkout`;
			} catch (error) {
				Log.error('Failed to buy now', { error: error instanceof Error ? error.message : String(error) });
				DOM.showError(Lang?.messages?.failedToProceedToCheckout || 'Failed to proceed to checkout. Please try again.');
			}
		});
	}
}

// Update variant in modal (price, images, availability)
function updateVariantInModal(
	dialog: ProductModalElement,
	modalId: string,
	variant: ProductVariantType,
	formatPrice: (price: number | string) => string
): void {
	dialog._currentVariantId = variant.id;

	// Update price
	const priceContainer = dialog.querySelector<HTMLElement>('.afs-product-modal__price-container');
	if (priceContainer) {
		const priceHTML = formatPrice(variant.price);
		const comparePriceHTML = variant.compare_at_price && variant.compare_at_price > variant.price
			? `<span class="afs-product-modal__compare-price">${formatPrice(variant.compare_at_price)}</span>`
			: '';
		priceContainer.innerHTML = `
        <span class="afs-product-modal__price">${priceHTML}</span>
        ${comparePriceHTML}
      `;
	}

	// Update add to cart button
	const addButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-add-button`);
	if (addButton) {
		const variantAvailable = isVariantAvailable(variant);
		addButton.dataset.variantId = String(variant.id);
		addButton.disabled = !variantAvailable;
		addButton.innerHTML = !variantAvailable
			? (Lang?.buttons?.soldOut || 'Sold out')
			: (Lang?.buttons?.addToCart || 'Add to cart');
	}

	// Update buy now button
	const buyButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-buy-button`);
	if (buyButton) {
		const variantAvailable = isVariantAvailable(variant);
		buyButton.dataset.variantId = String(variant.id);
		buyButton.disabled = !variantAvailable;
	}

	// Update images if variant has specific image
	// Use slider's updateVariantImage method if available, otherwise fall back to manual matching
	const product = dialog._productData;
	if (product && product.images && product.variants) {
		// If slider is not ready yet, skip image update (price and buttons already updated above)
		if (!dialog._slider) {
			Log.debug('Slider not ready, skipping image update', { variantId: variant.id });
			return;
		}
		// Find which image is assigned to this variant by checking variant_ids
		const currentVariantId = variant.id;
		let targetImageIndex: number | null = null;

		// Check if current variant has featured_image with variant_ids
		if (variant.featured_image && typeof variant.featured_image === 'object' && variant.featured_image.variant_ids) {
			// This variant is assigned to an image - check if it's different from current
			const variantImagePosition = variant.featured_image.position;
			if (variantImagePosition !== null && variantImagePosition !== undefined) {
				const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
				if (positionIndex >= 0 && positionIndex < product.images.length) {
					// Check if current slide is different from this variant's image
					const currentSlideIndex = dialog._slider.currentIndex || 0;
					if (currentSlideIndex !== positionIndex) {
						targetImageIndex = positionIndex;
					}
				}
			}
		} else {
			// Variant doesn't have featured_image, but check if any other variant's image is assigned to this variant
			// Iterate through all variants to find which image has this variant in its variant_ids
			for (const v of product.variants) {
				if (v.featured_image && typeof v.featured_image === 'object' && v.featured_image.variant_ids) {
					// Check if current variant ID is in this image's variant_ids array
					if (v.featured_image.variant_ids.includes(Number(currentVariantId))) {
						const variantImagePosition = v.featured_image.position;
						if (variantImagePosition !== null && variantImagePosition !== undefined) {
							const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
							if (positionIndex >= 0 && positionIndex < product.images.length) {
								const currentSlideIndex = dialog._slider.currentIndex || 0;
								if (currentSlideIndex !== positionIndex) {
									targetImageIndex = positionIndex;
									break; // Found the image, exit loop
								}
							}
						}
					}
				}
			}
		}

		// If we found a target image index using variant_ids, use it
		if (targetImageIndex !== null && dialog._slider.goToSlide) {
			dialog._slider.goToSlide(targetImageIndex);
			return; // Successfully updated using variant_ids optimization
		}

		// Try using the slider's built-in method (fallback, pass variants for optimization)
		if (dialog._slider.updateVariantImage && product.images) {
			const updated = dialog._slider.updateVariantImage(variant, product.images, product.variants);
			if (updated) return; // Successfully updated, exit early
		}

		// Fallback: manual image matching (for backwards compatibility)
		// Extract variant image URL from various possible structures
		let variantImageUrl: string | null = null;
		let variantImagePosition: number | null = null;

		// Handle featured_image as object (Shopify format: { src: "...", position: 5, ... })
		if (variant.featured_image) {
			if (typeof variant.featured_image === 'object') {
				variantImageUrl = variant.featured_image.src || variant.featured_image.url || null;
				variantImagePosition = variant.featured_image.position || null;
			} else if (typeof variant.featured_image === 'string') {
				variantImageUrl = variant.featured_image;
			}
		}

		// Fallback to other image properties
		if (!variantImageUrl) {
			variantImageUrl = (typeof variant.image === 'string' ? variant.image : null) ||
				variant.imageUrl ||
				(variant.image && typeof variant.image === 'object' ? variant.image.url || variant.image.src || null : null) ||
				(variant.featuredImage && typeof variant.featuredImage === 'object' ? variant.featuredImage.url || variant.featuredImage.src || null : null);
		}

		if (variantImageUrl && product.images && dialog._slider.goToSlide) {
			// Normalize image URL for comparison (remove protocol, query params, etc.)
			const normalizeUrl = (url: string | { url?: string; src?: string } | null | undefined): string => {
				if (!url) return '';
				// Handle both string URLs and object URLs
				const urlString = typeof url === 'string' ? url : (url && typeof url === 'object' ? (url.url || url.src || '') : '');
				// Remove protocol, normalize to https, remove query params
				return urlString
					.replace(/^https?:\/\//, '')
					.replace(/^\/\//, '')
					.split('?')[0]
					.toLowerCase()
					.trim();
			};

			// First, try to use position if available (1-based, convert to 0-based index)
			if (variantImagePosition !== null && variantImagePosition !== undefined) {
				const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
				if (positionIndex >= 0 && positionIndex < product.images.length) {
					dialog._slider.goToSlide(positionIndex);
					return;
				}
			}

			const normalizedVariantImage = normalizeUrl(variantImageUrl);

			// Find matching image in product images array
			const variantImageIndex = product.images.findIndex(img => {
				const normalizedImg = normalizeUrl(img);
				// Compare normalized URLs
				return normalizedImg === normalizedVariantImage ||
					normalizedImg.includes(normalizedVariantImage) ||
					normalizedVariantImage.includes(normalizedImg);
			});

			if (variantImageIndex !== -1) {
				// Use slider's goToSlide method to change to variant's image
				dialog._slider.goToSlide(variantImageIndex);
			} else {
				// If exact match not found, try to find by filename
				const variantImageFilename = normalizedVariantImage.split('/').pop();
				if (variantImageFilename) {
					const filenameMatchIndex = product.images.findIndex(img => {
						const imgFilename = normalizeUrl(img).split('/').pop();
						return imgFilename === variantImageFilename;
					});

					if (filenameMatchIndex !== -1 && dialog._slider.goToSlide) {
						dialog._slider.goToSlide(filenameMatchIndex);
					}
				}
			}
		}
	}
}

// Setup close handler only
function setupCloseHandler(dialog: ProductModalElement): void {
	const closeBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__close');
	const closeModal = (): void => {
		// Destroy slider if it exists
		if (dialog._slider && typeof dialog._slider.destroy === 'function') {
			dialog._slider.destroy();
			dialog._slider = undefined;
		}

		document.body.style.overflow = '';
		document.body.style.removeProperty('overflow');
		if (dialog.close) {
			dialog.close();
		} else {
			dialog.style.display = 'none';
		}
	};

	if (closeBtn) {
		closeBtn.addEventListener('click', closeModal);
	}
	dialog.addEventListener('cancel', closeModal);
	dialog.addEventListener('click', (e) => {
		if (e.target === dialog) closeModal();
	});
}

function createQuickViewButton(product: ProductType): HTMLElement | null {
	if (!product.handle) return null;

	// Safety check: ensure Lang.buttons exists before accessing quickView
	const ariaLabel = (Lang?.buttons?.quickView) || 'Quick view';

	const quickViewBtn = $.el('button', 'afs-product-card__quick-view', {
		'data-product-handle': product.handle,
		'data-product-id': String(product.id || product.productId || product.gid || ''),
		'aria-label': ariaLabel,
		'type': 'button'
	});
	const quickViewIcon = $.el('span', 'afs-product-card__quick-view-icon');
	quickViewIcon.innerHTML = Icons.eye;
	quickViewBtn.appendChild(quickViewIcon);
	return quickViewBtn;
}

function handleQuickViewClick(handle: string): void {
	if (!handle) return;

	// Open product modal using Ajax API
	const modalId = `product-modal-${handle}`;
	let modal = document.getElementById(modalId) as ProductModalElement | null;

	const openModal = async (): Promise<void> => {
		if (!modal) {
			// Create modal (async - fetches product data)
			modal = await createProductModal(handle, modalId);
			document.body.appendChild(modal);
		}

		// Show modal
		if (modal.showModal) {
			document.body.style.overflow = 'hidden';
			modal.showModal();
		} else {
			document.body.style.overflow = 'hidden';
			modal.style.display = 'block';
		}

		// Ensure overflow is restored when modal closes
		const restoreScroll = (): void => {
			document.body.style.overflow = '';
			document.body.style.removeProperty('overflow');
		};

		modal.addEventListener('close', restoreScroll, { once: true });

		const observer = new MutationObserver(() => {
			if (modal && !modal.open && !modal.hasAttribute('open')) {
				restoreScroll();
				observer.disconnect();
			}
		});
		if (modal) {
			observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
		}
	};

	openModal().catch(error => {
		const errorMessage = error instanceof Error ? error.message : String(error);
		Log.error('Failed to open product modal', { error: errorMessage, handle, stack: error instanceof Error ? error.stack : undefined });
		const userMessage = Lang?.messages?.failedToLoadProductModal || 'Failed to load product. Please try again.';
		if (DOM && typeof DOM.showError === 'function') {
			DOM.showError(userMessage);
		} else {
			// Fallback if DOM.showError is not available
			alert(userMessage);
		}
	});
}

// Export to window
const AFSW = window as ShopifyWindow;

// Export
if (typeof window !== 'undefined') {
	AFSW.AFS = AFS;
	AFSW.AFS_State = FilterState; // Export FilterState for search module to access
} else if (typeof global !== 'undefined') {
	(global as typeof globalThis & { AFS?: AFSInterfaceType }).AFS = AFS;
}
