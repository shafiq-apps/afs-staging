/**
 * Advanced Filter Search
 * 
 * Describe hardcoded values and their means and functionality
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Constants {
  readonly DEBOUNCE: number;
  readonly TIMEOUT: number;
  readonly CACHE_TTL: number;
  readonly PAGE_SIZE: number;
}

interface Icons {
  readonly rightArrow: string;
  readonly downArrow: string;
  readonly eye: string;
  readonly minus: string;
  readonly plus: string;
  readonly close: string;
}

interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: string;
  crop?: string | null;
}

interface PriceRange {
  min?: number;
  max?: number;
}

interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface FallbackPagination {
  currentPage: number;
  totalPages: number;
  totalProducts: number;
}

interface SelectedCollection {
  id: string | null;
  sortBy: string | null;
}

interface FilterMetadata {
  label: string;
  queryKey?: string;
  optionKey?: string;
  optionType?: string;
}

interface FilterValue {
  value?: string;
  key?: string;
  name?: string;
  label?: string;
  count?: number;
}

interface FilterOption {
  handle?: string;
  label?: string;
  queryKey?: string;
  optionKey?: string;
  optionType?: string;
  displayType?: string;
  selectionType?: string;
  searchable?: boolean | string;
  searchPlaceholder?: string;
  tooltipContent?: string;
  collapsed?: boolean | string | number;
  showCount?: boolean;
  values?: FilterValue[];
  range?: {
    min: number;
    max: number;
  };
  key?: string;
}

interface ProductImage {
  url?: string;
  urlSmall?: string;
  urlMedium?: string;
  urlLarge?: string;
  urlFallback?: string;
}

interface ProductVariant {
  id: number | string;
  available?: boolean;
  availableForSale?: boolean;
  price: number | string;
  compare_at_price?: number | string;
  option1?: string;
  option2?: string;
  option3?: string;
  options?: string[];
  featured_image?: {
    src?: string;
    url?: string;
    position?: number;
    variant_ids?: number[];
  } | string;
  image?: string | {
    url?: string;
    src?: string;
  };
  imageUrl?: string;
  featuredImage?: {
    url?: string;
    src?: string;
  };
}

interface Product {
  id?: string | number;
  productId?: string | number;
  gid?: string | number;
  handle?: string;
  title?: string;
  vendor?: string;
  imageUrl?: string;
  featuredImage?: ProductImage;
  minPrice?: string | number;
  maxPrice?: string | number;
  totalInventory?: string | number;
  variants?: ProductVariant[];
  description?: string;
  images?: string[];
  options?: Array<{
    name: string;
    values: string[];
  }>;
}

interface Collection {
  id?: string | number;
  gid?: string | number;
  collectionId?: string | number;
  title?: string;
  label?: string;
  name?: string;
}

interface FiltersState {
  [key: string]: string[] | string | PriceRange | null;
  vendor: string[];
  productType: string[];
  tags: string[];
  collections: string[];
  search: string;
  priceRange: PriceRange | null;
}

interface FilterGroupState {
  collapsed?: boolean;
  search?: string;
  lastUpdated?: number;
}

interface APIResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface ProductsResponseData {
  products?: Product[];
  pagination?: PaginationState;
  filters?: FilterOption[];
}

interface FiltersResponseData {
  filters?: FilterOption[];
}

interface ParsedUrlParams {
  vendor?: string[];
  productType?: string[];
  tags?: string[];
  collections?: string[];
  search?: string;
  priceRange?: PriceRange;
  page?: number;
  limit?: number;
  sort?: SortState;
  [key: string]: string[] | string | PriceRange | SortState | number | undefined;
}

interface AppliedFilter {
  handle: string;
  label: string;
  value: string | typeof SpecialValue.CLEAR;
}

interface AppState {
  shop: string | null;
  filters: FiltersState;
  products: Product[];
  collections: Collection[];
  selectedCollection: SelectedCollection;
  pagination: PaginationState;
  sort: SortState;
  loading: boolean;
  availableFilters: FilterOption[];
  filterMetadata: Map<string, FilterMetadata>;
  keep: string[] | typeof SpecialValue.ALL | string | null;
  fallbackProducts: Product[];
  fallbackPagination: FallbackPagination;
  usingFallback: boolean;
  moneyFormat: string | null;
  moneyWithCurrencyFormat: string | null;
  currency: string | null;
  scrollToProductsOnFilter: boolean;
  priceRangeHandle: string | null;
}

interface AFSConfig {
  apiBaseUrl?: string;
  shop?: string;
  containerSelector?: string;
  filtersSelector?: string;
  productsSelector?: string;
  collections?: Collection[];
  selectedCollection?: {
    id?: string | null;
    sortBy?: string | null;
  };
  fallbackProducts?: Product[];
  fallbackPagination?: FallbackPagination;
  moneyFormat?: string;
  moneyWithCurrencyFormat?: string;
  currency?: string;
  scrollToProductsOnFilter?: boolean;
  priceRangeHandle?: string | null;
  debug?: boolean;
  keep?: string[] | typeof SpecialValue.ALL | string | null;
}

interface SliderInstance {
  destroy?: () => void;
  goToSlide?: (index: number) => void;
  updateVariantImage?: (variant: ProductVariant, images: string[], variants: ProductVariant[]) => boolean;
  currentIndex?: number;
}

interface ProductModalElement extends HTMLDialogElement {
  _productData?: Product;
  _currentVariantId?: number | string;
  _slider?: SliderInstance;
}

interface FilterItemsElement extends HTMLElement {
  _items?: FilterValue[];
}

interface ShopifyWindow extends Window {
  Shopify?: {
    routes?: {
      root?: string;
    };
  };
  AFSSlider?: new (container: HTMLElement, options: {
    thumbnailsPosition?: string;
    enableKeyboard?: boolean;
    enableAutoHeight?: boolean;
    maxHeight?: number;
    enableMagnifier?: boolean;
    magnifierZoom?: number;
  }) => SliderInstance;
  AFS?: AFSInterface;
  DOM?: typeof DOM;
  AFS_State?: AppState;
  AFS_API?: typeof API;
  AFS_LOG?: typeof Log;
  AFSQuickView?: {
    createQuickViewButton: (product: Product) => HTMLElement | null;
    handleQuickViewClick: (handle: string) => void;
    createProductModal: (handle: string, modalId: string) => Promise<ProductModalElement>;
  };
  QuickAdd?: typeof QuickAdd;
  $?: typeof $;
  Icons?: typeof Icons;
}

// Type for loggable data (any JSON-serializable value)
// Using a more permissive type for logging that allows complex objects
// This is safe because console.log/error/etc. accept any value
// We use a type that allows any object structure for logging purposes
// Note: This intentionally allows any object structure since logging needs flexibility
// We explicitly include all our custom types plus allow objects with index signatures
type LoggableData = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined 
  | Error
  | FiltersState
  | SortState
  | PaginationState
  | FilterOption
  | FilterOption[]
  | Collection
  | Collection[]
  | PriceRange
  | AFSConfig
  | ParsedUrlParams
  | APIResponse<ProductsResponseData | FiltersResponseData>
  | ProductsResponseData
  | FiltersResponseData
  | { [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] | FiltersState | SortState | PaginationState | FilterOption | FilterOption[] | Collection | Collection[] | PriceRange | AFSConfig | ParsedUrlParams | APIResponse<ProductsResponseData | FiltersResponseData> | ProductsResponseData | FiltersResponseData | { [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] } }
  | (string | number | boolean | null | undefined | FiltersState | SortState | PaginationState | FilterOption | FilterOption[] | Collection | Collection[] | PriceRange | AFSConfig | ParsedUrlParams | APIResponse<ProductsResponseData | FiltersResponseData> | ProductsResponseData | FiltersResponseData | { [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] })[];

// ============================================================================
// ENUMS
// ============================================================================

enum FilterKey {
  VENDOR = 'vendor',
  VENDORS = 'vendors',
  PRODUCT_TYPE = 'productType',
  PRODUCT_TYPES = 'productTypes',
  TAG = 'tag',
  TAGS = 'tags',
  COLLECTION = 'collection',
  COLLECTIONS = 'collections',
  SEARCH = 'search',
  PRICE_RANGE = 'priceRange',
  PRICE = 'price',
  PRICE_MIN = 'priceMin',
  PRICE_MAX = 'priceMax',
  PAGE = 'page',
  LIMIT = 'limit',
  SORT = 'sort',
  SIZE = 'size',
  CPID = 'cpid',
  KEEP = 'keep',
  SHOP = 'shop',
  SHOP_DOMAIN = 'shop_domain'
}

enum SortField {
  BEST_SELLING = 'best-selling',
  BESTSELLING = 'bestselling',
  TITLE = 'title',
  PRICE = 'price',
  CREATED = 'created'
}

enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
  ASCENDING = 'ascending',
  DESCENDING = 'descending'
}

enum OptionType {
  COLLECTION = 'Collection',
  PRICE_RANGE = 'priceRange'
}

enum DisplayType {
  RADIO = 'radio',
  CHECKBOX = 'checkbox'
}

enum SelectionType {
  MULTIPLE = 'multiple',
  MULTIPLE_UPPER = 'MULTIPLE'
}

enum SpecialValue {
  ALL = '__all__',
  CLEAR = '__clear__',
  DEFAULT_TITLE = 'Default Title'
}

// ============================================================================
// MINIMAL CONSTANTS
// ============================================================================

const C: Constants = {
  DEBOUNCE: 200,
  TIMEOUT: 10000,
  CACHE_TTL: 300000,
  PAGE_SIZE: 24
};

// Store SVG HTML content for inline use (allows CSS color control)
const Icons: Icons = {
  rightArrow: '<svg xmlns="http://www.w3.org/2000/svg" width="34px" height="34px" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.39862 4.32752C9.69152 4.03463 10.1664 4.03463 10.4593 4.32752L16.8232 10.6915C17.5067 11.3749 17.5067 12.4829 16.8232 13.1664L10.4593 19.5303C10.1664 19.8232 9.69152 19.8232 9.39863 19.5303C9.10573 19.2374 9.10573 18.7625 9.39863 18.4697L15.7626 12.1057C15.8602 12.0081 15.8602 11.8498 15.7626 11.7521L9.39863 5.38818C9.10573 5.09529 9.10573 4.62041 9.39862 4.32752Z" fill="currentColor"/></svg>',
  downArrow: '<svg xmlns="http://www.w3.org/2000/svg" width="34px" height="34px" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.46938 9.39966C4.76227 9.10677 5.23715 9.10677 5.53004 9.39966L11.894 15.7636C11.9916 15.8613 12.1499 15.8613 12.2476 15.7636L18.6115 9.39966C18.9044 9.10677 19.3793 9.10677 19.6722 9.39966C19.9651 9.69256 19.9651 10.1674 19.6722 10.4603L13.3082 16.8243C12.6248 17.5077 11.5168 17.5077 10.8333 16.8243L4.46938 10.4603C4.17649 10.1674 4.17649 9.69256 4.46938 9.39966Z" fill="currentColor"/></svg>',
  eye: '<svg xmlns="http://www.w3.org/2000/svg" width="34px" height="34px" viewBox="0 0 32 32" fill="currentColor"><path d="M16.108 10.044c-3.313 0-6 2.687-6 6s2.687 6 6 6 6-2.686 6-6-2.686-6-6-6zM16.108 20.044c-2.206 0-4.046-1.838-4.046-4.044s1.794-4 4-4c2.206 0 4 1.794 4 4s-1.748 4.044-3.954 4.044zM31.99 15.768c-0.012-0.050-0.006-0.104-0.021-0.153-0.006-0.021-0.020-0.033-0.027-0.051-0.011-0.028-0.008-0.062-0.023-0.089-2.909-6.66-9.177-10.492-15.857-10.492s-13.074 3.826-15.984 10.486c-0.012 0.028-0.010 0.057-0.021 0.089-0.007 0.020-0.021 0.030-0.028 0.049-0.015 0.050-0.009 0.103-0.019 0.154-0.018 0.090-0.035 0.178-0.035 0.269s0.017 0.177 0.035 0.268c0.010 0.050 0.003 0.105 0.019 0.152 0.006 0.023 0.021 0.032 0.028 0.052 0.010 0.027 0.008 0.061 0.021 0.089 2.91 6.658 9.242 10.428 15.922 10.428s13.011-3.762 15.92-10.422c0.015-0.029 0.012-0.058 0.023-0.090 0.007-0.017 0.020-0.030 0.026-0.050 0.015-0.049 0.011-0.102 0.021-0.154 0.018-0.090 0.034-0.177 0.034-0.27 0-0.088-0.017-0.175-0.035-0.266zM16 25.019c-5.665 0-11.242-2.986-13.982-8.99 2.714-5.983 8.365-9.047 14.044-9.047 5.678 0 11.203 3.067 13.918 9.053-2.713 5.982-8.301 8.984-13.981 8.984z"/></svg>',
  minus: '<svg xmlns="http://www.w3.org/2000/svg" width="34px" height="34px" viewBox="0 0 20 20" fill="none"><path fill="currentColor" fill-rule="evenodd" d="M18 10a1 1 0 01-1 1H3a1 1 0 110-2h14a1 1 0 011 1z"/></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="34px" height="34px" viewBox="0 0 20 20" fill="none"><path fill="currentColor" fill-rule="evenodd" d="M9 17a1 1 0 102 0v-6h6a1 1 0 100-2h-6V3a1 1 0 10-2 0v6H3a1 1 0 000 2h6v6z"/></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="34px" height="34px" viewBox="0 0 24 24" fill="currentColor"><path d="M19 5L4.99998 19M5.00001 5L19 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

// Excluded query parameter keys (not processed as filters)
// Note: keep is excluded from filter processing but will be parsed separately
const EXCLUDED_QUERY_PARAMS = new Set<string>([FilterKey.SHOP, FilterKey.SHOP_DOMAIN, FilterKey.KEEP, FilterKey.CPID]);

// ============================================================================
// LANGUAGE/TEXT CONSTANTS
// ============================================================================

interface LanguageTexts {
  readonly buttons: {
    readonly quickAdd: string;
    readonly quickAddToCart: string;
    readonly quickView: string;
    readonly addToCart: string;
    readonly buyNow: string;
    readonly clear: string;
    readonly clearAll: string;
    readonly close: string;
    readonly closeFilters: string;
    readonly toggleFilters: string;
    readonly filters: string;
    readonly previous: string;
    readonly next: string;
    readonly apply: string;
  };
  readonly labels: {
    readonly sortBy: string;
    readonly appliedFilters: string;
    readonly search: string;
    readonly price: string;
    readonly collection: string;
    readonly productUnavailable: string;
    readonly loading: string;
    readonly loadingProduct: string;
  };
  readonly sortOptions: {
    readonly bestSelling: string;
    readonly titleAsc: string;
    readonly titleDesc: string;
    readonly priceAsc: string;
    readonly priceDesc: string;
    readonly createdAsc: string;
    readonly createdDesc: string;
  };
  readonly messages: {
    readonly noProductsFound: string;
    readonly oneProductFound: string;
    readonly productsFound: string;
    readonly showingProducts: string;
    readonly pageOf: string;
    readonly addedToCart: string;
    readonly failedToLoad: string;
    readonly failedToLoadProducts: string;
    readonly failedToLoadProduct: string;
    readonly failedToAddToCart: string;
    readonly failedToProceedToCheckout: string;
    readonly failedToLoadProductModal: string;
    readonly failedToLoadFilters: string;
    readonly initializationFailed: string;
    readonly loadFailed: string;
    readonly unknownError: string;
    readonly checkConsole: string;
  };
  readonly placeholders: {
    readonly searchProducts: string;
    readonly searchFilter: string;
  };
}

const Lang: LanguageTexts = {
  buttons: {
    quickAdd: 'Quick Add',
    quickAddToCart: 'Quick add to cart',
    quickView: 'Quick view',
    addToCart: 'Add to cart',
    buyNow: 'Buy it now',
    clear: 'Clear',
    clearAll: 'Clear All',
    close: '✕',
    closeFilters: 'Close filters',
    toggleFilters: 'Filters',
    filters: 'Filters',
    previous: 'Previous',
    next: 'Next',
    apply: 'Apply'
  },
  labels: {
    sortBy: 'Sort by: ',
    appliedFilters: 'Applied Filters:',
    search: 'Search: ',
    price: 'Price: ',
    collection: 'Collection: ',
    productUnavailable: 'Product unavailable',
    loading: 'Loading...',
    loadingProduct: 'Loading product...'
  },
  sortOptions: {
    bestSelling: 'Best Selling',
    titleAsc: 'Title (A-Z)',
    titleDesc: 'Title (Z-A)',
    priceAsc: 'Price (Low to High)',
    priceDesc: 'Price (High to Low)',
    createdAsc: 'Oldest First',
    createdDesc: 'Newest First'
  },
  messages: {
    noProductsFound: 'No products found',
    oneProductFound: '1 product found',
    productsFound: 'products found',
    showingProducts: 'Showing',
    pageOf: 'Page',
    addedToCart: 'Added to cart!',
    failedToLoad: 'Failed to load',
    failedToLoadProducts: 'Failed to load products',
    failedToLoadProduct: 'Failed to load product',
    failedToAddToCart: 'Failed to add product to cart. Please try again.',
    failedToProceedToCheckout: 'Failed to proceed to checkout. Please try again.',
    failedToLoadProductModal: 'Failed to load product. Please try again.',
    failedToLoadFilters: 'Failed to load filters, continuing with empty filters',
    initializationFailed: 'Initialization failed',
    loadFailed: 'Load failed',
    unknownError: 'Unknown error',
    checkConsole: 'Check console for details.'
  },
  placeholders: {
    searchProducts: 'Search products...',
    searchFilter: 'Search'
  }
};

// ============================================================================
// TINY REUSABLE UTILITIES (Smallest possible functions)
// ============================================================================

const $ = {
  // Fastest debounce
  debounce: <T extends (...args: never[]) => void>(fn: T, ms: number): ((...args: Parameters<T>) => void) => {
    let t: ReturnType<typeof setTimeout> | undefined;
    return (...a: Parameters<T>) => {
      if (t !== undefined) clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  },

  toLowerCase: (s: string | number | null | undefined): string => String(s || '').toLowerCase(),

  inputDisplayType: (option: { displayType?: string } | undefined): 'radio' | 'checkbox' => {
    return $.equalsAny($.toLowerCase(option?.displayType), DisplayType.RADIO) ? 'radio' : 'checkbox';
  },

  isMultiSelect: (option: { selectionType?: string } | undefined): boolean => {
    return $.equalsAny($.toLowerCase(option?.selectionType), SelectionType.MULTIPLE) || $.equalsAny(option?.selectionType, SelectionType.MULTIPLE_UPPER);
  },

  // Fast array split
  split: (v: string | string[] | null | undefined): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
  },

  // Fast ID getter
  id: (p: { productId?: string | number; id?: string | number; gid?: string | number } | undefined | null): string | null => {
    if (!p) return null;
    const id = p.productId || p.id || p.gid;
    if (!id) return null;
    return String(id).split('/').pop() || null;
  },

  // Fast string check
  str: (v: string | number | null | undefined): string => String(v || '').trim(),

  // Fast empty check
  empty: (v: string | string[] | number | boolean | Record<string, string | string[] | number | boolean | null | undefined | PriceRange> | PriceRange | null | undefined): boolean => {
    if (!v) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  },

  // Fast element creator
  el: (tag: string, cls: string, attrs: Record<string, string> = {}): HTMLElement => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  },

  // Fast text setter
  txt: (el: HTMLElement, text: string): HTMLElement => {
    el.textContent = text;
    return el;
  },

  // Fast clear (replaces innerHTML)
  clear: (el: HTMLElement): void => {
    while (el.firstChild) {
      const child = el.firstChild;
      if (child) el.removeChild(child);
    }
  },

  // Fast fragment append
  frag: <T>(items: T[], fn: (item: T) => Node): DocumentFragment => {
    const f = document.createDocumentFragment();
    items.forEach(item => f.appendChild(fn(item)));
    return f;
  },

  // Optimize Shopify image URL with transformations
  optimizeImageUrl: (url: string | null | undefined, options: ImageOptimizationOptions = {}): string => {
    if (!url || typeof url !== "string") return "";

    const {
      width = 500,
      height = width,
      quality = 80,
      format = "webp",
      crop = null
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
      params.set("width", String(width));
      params.set("height", String(height));

      if (crop) params.set("crop", crop);
      if (quality !== 100) params.set("quality", String(quality));

      // Avoid format for GIF (Shopify does not convert animated GIFs)
      const isGif = urlObj.pathname.toLowerCase().endsWith(".gif");
      if (!isGif && format) params.set("format", format);

      return `${urlObj.origin}${urlObj.pathname}?${params.toString()}`;
    } catch (err) {
      return url;
    }
  },

  // Build responsive srcset for Shopify images
  buildImageSrcset: (baseUrl: string | null | undefined, sizes: number[] = [200, 300, 500]): string => {
    if (!baseUrl) return '';

    return sizes.map(size => {
      const optimized = $.optimizeImageUrl(baseUrl, { width: size, format: 'webp', quality: size <= 200 ? 75 : size <= 300 ? 80 : 85 });
      return `${optimized} ${size}w`;
    }).join(', ');
  },

  // Format money using Shopify money format
  formatMoney: (cents: string | number | null | undefined, moneyFormat: string | null | undefined, currency: string = ''): string => {
    if (isNaN(Number(cents))) return '';

    // Convert cents to dollars
    const amount = parseFloat(String(cents)) / 100;

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
  },

  // Reusable comparison functions
  // Compare two values (string, number, boolean, array, or object) with case-insensitive and trimmed string comparison
  equals: (a: string | number | boolean | string[] | null | undefined, b: string | number | boolean | string[] | null | undefined): boolean => {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    
    // For arrays, convert to string representation
    if (Array.isArray(a)) {
      a = a.join(',');
    }
    if (Array.isArray(b)) {
      b = b.join(',');
    }
    
    // For strings, compare case-insensitively and trimmed
    if (typeof a === 'string' && typeof b === 'string') {
      return a.trim().toLowerCase() === b.trim().toLowerCase();
    }
    
    // For numbers, compare directly
    if (typeof a === 'number' && typeof b === 'number') {
      return a === b;
    }
    
    // For booleans, compare directly
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return a === b;
    }
    
    // Mixed types: convert both to strings and compare
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  },

  // Check if value equals any of the provided enum/constant values (case-insensitive, trimmed)
  equalsAny: (value: string | number | boolean | string[] | null | undefined, ...values: (string | number | boolean)[]): boolean => {
    if (value === null || value === undefined) return false;
    return values.some(v => $.equals(value, v));
  },

  // Check if a filter key matches vendor (handles 'vendor' or 'vendors')
  isVendorKey: (key: string | null | undefined): boolean => {
    return $.equalsAny(key, FilterKey.VENDOR, FilterKey.VENDORS);
  },

  // Check if a filter key matches productType (handles 'productType' or 'productTypes')
  isProductTypeKey: (key: string | null | undefined): boolean => {
    return $.equalsAny(key, FilterKey.PRODUCT_TYPE, FilterKey.PRODUCT_TYPES);
  },

  // Check if a filter key matches tags (handles 'tag' or 'tags')
  isTagKey: (key: string | null | undefined): boolean => {
    return $.equalsAny(key, FilterKey.TAG, FilterKey.TAGS);
  },

  // Check if a filter key matches collections (handles 'collection' or 'collections')
  isCollectionKey: (key: string | null | undefined): boolean => {
    return $.equalsAny(key, FilterKey.COLLECTION, FilterKey.COLLECTIONS);
  },

  // Check if a filter key matches priceRange (handles 'priceRange' or 'price')
  isPriceRangeKey: (key: string | null | undefined): boolean => {
    return $.equalsAny(key, FilterKey.PRICE_RANGE, FilterKey.PRICE);
  },

  // Check if sort field is best-selling (handles 'best-selling' or 'bestselling')
  isBestSelling: (field: string | null | undefined): boolean => {
    return $.equalsAny(field, SortField.BEST_SELLING, SortField.BESTSELLING);
  },

  // Check if option type is Collection
  isCollectionOptionType: (optionType: string | null | undefined): boolean => {
    return $.equals(optionType, OptionType.COLLECTION);
  },

  // Check if option type is priceRange
  isPriceRangeOptionType: (optionType: string | null | undefined): boolean => {
    return $.equals(optionType, OptionType.PRICE_RANGE);
  }
};

// ============================================================================
// METADATA BUILDERS (For display only, not for state management)
// ============================================================================

const Metadata = {
  // Build metadata map from filters array (for display labels, types, etc.)
  buildFilterMetadata: (filters: FilterOption[]): Map<string, FilterMetadata> => {
    const m = new Map<string, FilterMetadata>();
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

const State: AppState = {
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
  filterMetadata: new Map<string, FilterMetadata>(), // handle -> { label, type, queryKey, optionKey }
  // Keep filter keys for maintaining filter aggregations
  keep: null, // null, array of strings, or SpecialValue.ALL
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
// LOGGER (Minimal, production-safe)
// ============================================================================

const Log = {
  enabled: true, // Always enabled for debugging
  error: (msg: string, data?: LoggableData): void => {
    if (Log.enabled) console.error('[AFS]', msg, data || '');
  },
  warn: (msg: string, data?: LoggableData): void => {
    if (Log.enabled) console.warn('[AFS]', msg, data || '');
  },
  info: (msg: string, data?: LoggableData): void => {
    if (Log.enabled) console.info('[AFS]', msg, data || '');
  },
  debug: (msg: string, data?: LoggableData): void => {
    if (Log.enabled) console.debug('[AFS]', msg, data || '');
  },
  log: (msg: string, ...args: LoggableData[]): void => {
    if (Log.enabled) console.log(msg, ...args);
  },
  init: (enabled?: boolean): void => {
    Log.enabled = enabled !== false;
    Log.log(
      "%c" + "Advanced Filter & Search initialized",
      "color: #00c853;" +
      "font-size: 20px;" +
      "font-weight: bold;" +
      "background: #0b1e13;" +
      "padding: 10px 15px;" +
      "border-radius: 6px;" +
      "font-family: Arial, sans-serif;"
    );
  }
};

// ============================================================================
// URL PARSER (Optimized with lookup maps)
// ============================================================================

const UrlManager = {
  parse(): ParsedUrlParams {
    const url = new URL(window.location.href);
    const params: ParsedUrlParams = {};
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
      else if ($.equals(key, FilterKey.SEARCH)) params.search = value;
      // Server-supported price range params
      else if ($.equals(key, FilterKey.PRICE_MIN)) {
        const v = parseFloat(value);
        if (!isNaN(v) && v >= 0) parsedPriceMin = v;
      }
      else if ($.equals(key, FilterKey.PRICE_MAX)) {
        const v = parseFloat(value);
        if (!isNaN(v) && v >= 0) parsedPriceMax = v;
      }
      // Legacy price range params: "min-max"
      else if ($.isPriceRangeKey(key)) {
        const parts = value.split('-');
        if (parts.length === 2) {
          const min = parseFloat(parts[0]);
          const max = parseFloat(parts[1]);
          if (!isNaN(min) && min >= 0) parsedPriceMin = min;
          if (!isNaN(max) && max >= 0) parsedPriceMax = max;
        }
      }
      else if ($.equals(key, FilterKey.PAGE)) params.page = parseInt(value, 10) || 1;
      else if ($.equals(key, FilterKey.LIMIT)) params.limit = parseInt(value, 10) || C.PAGE_SIZE;
      else if ($.equals(key, FilterKey.SORT)) {
        // Handle sort parameter - can be "best-selling", "title-ascending", "price:asc", etc.
        const sortValue = value.toLowerCase().trim();
        if ($.isBestSelling(sortValue)) {
          params.sort = { field: SortField.BEST_SELLING, order: SortOrder.ASC };
        } else if (sortValue.includes('-')) {
          // New format: "field-direction" (e.g., "title-ascending")
          const [field, direction] = sortValue.split('-');
          const order = $.equalsAny(direction, SortOrder.ASCENDING) ? SortOrder.ASC : $.equalsAny(direction, SortOrder.DESCENDING) ? SortOrder.DESC : SortOrder.DESC;
          params.sort = { field, order };
        } else {
          // Legacy format: "field:order" (backward compatibility)
          const [field, order] = value.split(':');
          params.sort = { field, order: ($.equalsAny(order, SortOrder.ASC) ? SortOrder.ASC : SortOrder.DESC) as 'asc' | 'desc' };
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

  update(filters: FiltersState, pagination: PaginationState, sort: SortState): void {
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
          const priceRange = value as PriceRange;
          const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? priceRange.min : undefined;
          const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? priceRange.max : undefined;
          if (State.priceRangeHandle) {
            // Handle-style: {handle}=min-max
            const handleValue = `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`;
            url.searchParams.set(State.priceRangeHandle, handleValue);
            Log.debug('Price range URL handle param set', { handle: State.priceRangeHandle, value: handleValue });
          } else {
            // Backward compatibility
            if (min !== undefined) url.searchParams.set('priceMin', String(min));
            if (max !== undefined) url.searchParams.set('priceMax', String(max));
            Log.debug('Price range URL params set', { priceMin: min, priceMax: max });
          }
        }
        else if ($.equals(key, FilterKey.SEARCH) && typeof value === 'string' && value.trim()) {
          url.searchParams.set(key, value.trim());
          Log.debug('Search URL param set', { key, value: value.trim() });
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
        const direction = $.equals(sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
        url.searchParams.set('sort', `${sort.field}-${direction}`);
      }
      Log.debug('Sort URL param set', { field: sort.field, order: sort.order });
    }

    // Update keep parameter
    if (State.keep !== null && State.keep !== undefined) {
      if ($.equals(State.keep, SpecialValue.ALL)) {
        url.searchParams.set('keep', SpecialValue.ALL);
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
  baseURL: 'https://fstaging.digitalcoo.com',
  __v: 'v2.0.1',
  __id: '31-12-2025',
  cache: new Map<string, ProductsResponseData>(),
  timestamps: new Map<string, number>(),
  pending: new Map<string, Promise<ProductsResponseData>>(),

  key(filters: FiltersState, pagination: PaginationState, sort: SortState): string {
    return `${pagination.page}-${pagination.limit}-${sort.field}-${sort.order}-${JSON.stringify(filters)}`;
  },

  get(key: string): ProductsResponseData | null {
    const ts = this.timestamps.get(key);
    if (!ts || Date.now() - ts > C.CACHE_TTL) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  },

  set(key: string, value: ProductsResponseData): void {
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
  },

  async fetch(url: string, timeout: number = C.TIMEOUT): Promise<APIResponse<ProductsResponseData | FiltersResponseData>> {
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
      const data = await res.json() as APIResponse<ProductsResponseData | FiltersResponseData>;
      Log.debug('Fetch success', { url, hasData: !!data });
      return data;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timeout');
      Log.error('Fetch failed', { url, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  /**
   * Check if cpid should be sent to API
   * Since clearCpidIfFiltersPresent() already clears cpid when filters are present,
   * we only need to check if cpid exists and if it's not already in collection filter handle
   */
  shouldSendCpid(filters: FiltersState): boolean {
    return State.selectedCollection && State.selectedCollection.id?true:false;

    if (!State.selectedCollection?.id) {
      return false; // No cpid to send
    }

    // Check if cpid collection ID is already in collection filter handle
    const hasCollectionFilterWithCpid = Object.keys(filters || {}).some(key => {
      const metadata = State.filterMetadata.get(key);
      const isCollectionFilter = ($.isCollectionOptionType(metadata?.optionType) || $.isCollectionKey(key));
      if (isCollectionFilter && Array.isArray(filters[key]) && filters[key].length > 0) {
        // Check if cpid collection ID is in the collection filter values
        return (filters[key] as string[]).some(v => String(v) === String(State.selectedCollection.id));
      }
      return false;
    });

    // Don't send cpid if it's already in collection filter
    // If cpid exists and filters are present, clearCpidIfFiltersPresent() would have cleared it
    // So if we reach here and cpid exists, it means no filters are present (clean page)
    return !hasCollectionFilterWithCpid;
  },

  async products(filters: FiltersState, pagination: PaginationState, sort: SortState): Promise<ProductsResponseData> {
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
      return this.pending.get(key)!;
    }

    const params = new URLSearchParams();
    params.set('shop', State.shop);

    // Only send cpid if conditions are met (clean page or only sort/page/limit, and not in collection filter)
    if (this.shouldSendCpid(filters)) {
      params.set('cpid', State.selectedCollection.id!);
      Log.debug('cpid sent to products API', { cpid: State.selectedCollection.id, filters });
    } else {
      Log.debug('cpid not sent to products API', {
        hasCpid: !!State.selectedCollection?.id,
        filters,
        reason: 'filters present or cpid already in collection filter'
      });
    }
    // Send ALL filters as direct query parameters using handles as keys
    // URL format: ?handle1=value1&handle2=value2
    // API format: ?handle1=value1&handle2=value2 (same as URL)
    Object.keys(filters).forEach(k => {
      const v = filters[k];
      if ($.empty(v)) return;

      // Direct params (search, price range)
      if ($.isPriceRangeKey(k) && v && typeof v === 'object' && !Array.isArray(v)) {
        const priceRange = v as PriceRange;
        const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? priceRange.min : undefined;
        const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? priceRange.max : undefined;
        if (State.priceRangeHandle) {
          params.set(State.priceRangeHandle, `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`);
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
    params.set('page', String(pagination.page));
    params.set('limit', String(pagination.limit));
    if (sort.field) {
      // Handle best-selling sort (no order needed, server handles it)
      if ($.isBestSelling(sort.field)) {
        params.set('sort', SortField.BEST_SELLING);
      } else {
        // Convert to new format: "field-direction" (e.g., "title-ascending")
        const direction = $.equals(sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
        params.set('sort', `${sort.field}-${direction}`);
      }
    }

    // Add keep parameter if set
    if (State.keep !== null && State.keep !== undefined) {
      if ($.equals(State.keep, SpecialValue.ALL)) {
        params.set('keep', SpecialValue.ALL);
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
        throw new Error(`Invalid products response: ${res.message || Lang.messages.unknownError}`);
      }
      const data = res.data as ProductsResponseData;
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

    this.pending.set(key, promise);
    return promise;
  },

  async filters(filters: FiltersState): Promise<FiltersResponseData> {
    if (!this.baseURL) throw new Error('API baseURL not set. Call AFS.init({ apiBaseUrl: "..." })');
    if (!State.shop) throw new Error('Shop not set');

    const params = new URLSearchParams();
    params.set('shop', State.shop);

    // Only send cpid if conditions are met (clean page or only sort/page/limit, and not in collection filter)
    if (this.shouldSendCpid(filters)) {
      params.set('cpid', State.selectedCollection.id!);
      Log.debug('cpid sent to filters API', { cpid: State.selectedCollection.id, filters });
    } else {
      Log.debug('cpid not sent to filters API', {
        hasCpid: !!State.selectedCollection?.id,
        filters,
        reason: 'filters present or cpid already in collection filter'
      });
    }

    // Build filters for aggregation - exclude the filter in keep
    // When calculating aggregations for a specific filter, that filter should be excluded
    // from the query so we get all possible values based on other active filters
    const filtersForAggregation: FiltersState = { ...filters };
    let keepHandle: string | null = null;

    if (State.keep !== null && State.keep !== undefined) {
      if ($.equals(State.keep, SpecialValue.ALL)) {
        // If '__all__', exclude all filters from aggregation query
        Object.keys(filtersForAggregation).forEach(key => {
          delete filtersForAggregation[key];
        });
        params.set('keep', SpecialValue.ALL);
        Log.debug(`Keep filters: ${SpecialValue.ALL} - excluded all filters from aggregation query`);
      } else {
        // keep can be an array of handles or a single string handle
        // Get the handle to exclude (use first one if array)
        if (Array.isArray(State.keep) && State.keep.length > 0) {
          keepHandle = State.keep[0];
          // Add keep parameter with all handles joined
          params.set('keep', State.keep.join(','));
          Log.debug('Keep parameter set (array)', { keep: State.keep.join(','), keepHandle });
        } else if (State.keep !== null && !$.equals(State.keep, SpecialValue.ALL) && typeof State.keep === 'string') {
          // At this point, State.keep must be a string (not array, not null, not '__all__')
          const trimmed = State.keep.trim();
          if (trimmed) {
            keepHandle = trimmed;
            // Add keep parameter with the single handle
            params.set('keep', keepHandle);
            Log.debug('Keep parameter set (string)', { keep: keepHandle, keepHandle });
          }
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
      if ($.empty(v)) return;
      if (Array.isArray(v)) {
        params.set(k, v.join(','));
      } else if (k === 'search' && typeof v === 'string' && v.trim()) {
        params.set('search', v.trim());
      } else if (k === 'priceRange' && v && typeof v === 'object' && !Array.isArray(v)) {
        const priceRange = v as PriceRange;
        const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? priceRange.min : undefined;
        const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? priceRange.max : undefined;
        if (State.priceRangeHandle) {
          params.set(State.priceRangeHandle, `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`);
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
      throw new Error(`Invalid filters response: ${res.message || Lang.messages.unknownError}`);
    }

    // Validate response structure
    const data = res.data as FiltersResponseData;
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
  }
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

    const main = this.container.querySelector<HTMLElement>('.afs-main-content') || $.el('div', 'afs-main-content');
    if (!main.parentNode) this.container.appendChild(main);

    // Only querySelector if selector is provided and not empty
    this.filtersContainer = (filtersSel && filtersSel.trim() !== '') 
      ? document.querySelector<HTMLElement>(filtersSel) || null
      : null;
    
    if (!this.filtersContainer) {
      this.filtersContainer = $.el('div', 'afs-filters-container');
    }
    
    if (!this.filtersContainer.parentNode && main) main.appendChild(this.filtersContainer);

    // Ensure filters are closed by default on mobile
    if (window.innerWidth <= 767) {
      this.filtersContainer.classList.remove('afs-filters-container--open');
    }

    // Mobile filter close button (inside filters container)
    this.mobileFilterClose = $.el('button', 'afs-mobile-filter-close', {
      type: 'button',
      'data-afs-action': 'close-filters',
      'aria-label': Lang.buttons.closeFilters
    }) as HTMLButtonElement;
    this.mobileFilterClose.innerHTML = Lang.buttons.close;
    this.mobileFilterClose.style.display = 'none'; // Hidden on desktop

    // Insert close button at the beginning of filters container
    if (this.mobileFilterClose && !this.mobileFilterClose.parentNode) {
      this.filtersContainer.insertBefore(this.mobileFilterClose, this.filtersContainer.firstChild);
    }

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
        <option value="${SortField.BEST_SELLING}">${Lang.sortOptions.bestSelling}</option>
        <option value="title-${SortOrder.ASCENDING}">${Lang.sortOptions.titleAsc}</option>
        <option value="title-${SortOrder.DESCENDING}">${Lang.sortOptions.titleDesc}</option>
        <option value="price-${SortOrder.ASCENDING}">${Lang.sortOptions.priceAsc}</option>
        <option value="price-${SortOrder.DESCENDING}">${Lang.sortOptions.priceDesc}</option>
        <option value="created-${SortOrder.ASCENDING}">${Lang.sortOptions.createdAsc}</option>
        <option value="created-${SortOrder.DESCENDING}">${Lang.sortOptions.createdDesc}</option>
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

  // Hide filters container (when using fallback mode)
  hideFilters(): void {
    if (this.filtersContainer) {
      this.filtersContainer.style.display = 'none';
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

      // Show backdrop
      if (this.mobileFilterBackdrop) {
        this.mobileFilterBackdrop.style.display = 'block';
      }

      // Store current scroll position and prevent body scroll
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }

    Log.debug('Mobile filters drawer toggled', { isOpen: !isOpen });
  },

  // Fastest filter rendering (batched)
  renderFilters(filters: FilterOption[]): void {
    if (!this.filtersContainer || !Array.isArray(filters)) return;

    // Hide filters skeleton when rendering real filters
    this.hideFiltersSkeleton();

    // Save states with improved persistence
    const states = new Map<string, FilterGroupState>();
    this.filtersContainer.querySelectorAll('.afs-filter-group').forEach(g => {
      const key = g.getAttribute('data-afs-filter-key');
      if (key) {
        const searchInput = g.querySelector<HTMLInputElement>('.afs-filter-group__search-input');
        const collapsed = g.getAttribute('data-afs-collapsed') === 'true';
        const search = searchInput?.value || '';
        
        // Get existing state to preserve other properties
        const existingState = states.get(key);
        states.set(key, {
          ...existingState,
          collapsed,
          search,
          // Add timestamp for state freshness tracking
          lastUpdated: Date.now()
        } as FilterGroupState & { lastUpdated?: number });
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
      return;
    }

    const fragment = document.createDocumentFragment();

    validFilters.forEach(filter => {
      // Handle price range filters separately
      if ($.isPriceRangeOptionType(filter.optionType)) {
        const group = this.createPriceRangeGroup(filter, states);
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
      const filterValue = State.filters[handle];
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
  createFilterItem(handle: string, item: FilterValue | string, config: FilterOption, index: number): HTMLElement | null {
    // Get value (for filtering) - always use original value
    const value = $.str(typeof item === 'string' ? item : (item.value || item.key || item.name || ''));
    if (!value || value === '[object Object]') return null;

    // Get label (for display) - use label if available, fallback to value
    let displayLabel = typeof item === 'string'
      ? item
      : (item.label || item.value || value);

    // If this is a Collection filter, map collection ID to collection label from State.collections
    // Check both optionType and type to handle different filter configurations
    const isCollectionFilter = ($.isCollectionOptionType(config?.optionType) || $.isCollectionKey(handle));
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
    const currentValues = (State.filters[handle] as string[]) || [];
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
  createPriceRangeGroup(filter: FilterOption, savedStates: Map<string, FilterGroupState> | null = null): HTMLElement | null {
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
    const formatPrice = (val: number | string): string => `$${parseFloat(String(val)).toFixed(0)}`;
    minDisplay.textContent = formatPrice(currentMin);
    maxDisplay.textContent = formatPrice(currentMax);
    valueDisplay.appendChild(minDisplay);
    valueDisplay.appendChild($.txt($.el('span', 'afs-price-range-separator'), ' - '));
    valueDisplay.appendChild(maxDisplay);
    sliderContainer.appendChild(valueDisplay);

    // Update active track position
    const updateActiveTrack = (): void => {
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
    const constrainValues = (): void => {
      const min = parseFloat(minHandle.value);
      const max = parseFloat(maxHandle.value);
      if (min > max) {
        minHandle.value = String(max);
        maxHandle.value = String(min);
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
  renderProducts(products: Product[]): void {
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
          const formattedMin = $.formatMoney(minPrice, State.moneyFormat || '{{amount}}', State.currency || '');

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
  createProduct(p: Product): HTMLElement {
    const card = $.el('div', 'afs-product-card', { 'data-afs-product-id': $.id(p) || '' });

    if (p.imageUrl || p.featuredImage) {
      const imgContainer = $.el('div', 'afs-product-card__image');
      const img = $.el('img', '', {
        alt: p.title || '',
        loading: 'lazy',
        decoding: 'async',
        fetchpriority: 'low'
      }) as HTMLImageElement;

      // Get base image URL
      const baseImageUrl = p.featuredImage?.url || p.featuredImage?.urlFallback || p.imageUrl || '';

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

        // Add error handling for failed image loads
        img.onerror = function (this: HTMLImageElement) {
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
      const shopifyWindow = window as ShopifyWindow;
      const quickViewBtn = shopifyWindow.AFSQuickView?.createQuickViewButton(p);
      if (quickViewBtn) {
        imgContainer.appendChild(quickViewBtn);
      }
      card.appendChild(imgContainer);
    }

    const info = $.el('div', 'afs-product-card__info');
    if (info) {
      info.appendChild($.txt($.el('h3', 'afs-product-card__title'), p.title || 'Untitled'));
      if (p.vendor) info.appendChild($.txt($.el('div', 'afs-product-card__vendor'), p.vendor));

      // price amounts are in dollars, so multiply by 100 to convert to cents
      let minPrice = parseFloat(String(p.minPrice || 0)) * 100;
      let maxPrice = parseFloat(String(p.maxPrice || 0)) * 100;
      const formattedMin = $.formatMoney(minPrice, State.moneyFormat || '{{amount}}', State.currency || '');

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
  renderInfo(pagination: PaginationState, total: number): void {
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
  },

  // Render pagination controls
  renderPagination(pagination: PaginationState): void {
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
  renderApplied(filters: FiltersState): void {
    if (!this.container) return;

    // Remove existing applied filters
    const existing = this.container.querySelector<HTMLElement>('.afs-applied-filters');
    if (existing) existing.remove();

    // Count active filters
    // key here is the handle (for option filters) or queryKey (for standard filters)
    const activeFilters: AppliedFilter[] = [];
    Object.keys(filters).forEach(key => {
      const value = filters[key];
      if ($.equals(key, FilterKey.SEARCH) && value && typeof value === 'string' && value.trim()) {
        activeFilters.push({ handle: key, label: `${Lang.labels.search}${value}`, value });
      } else if ($.isPriceRangeKey(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        const priceRange = value as PriceRange;
        const hasMin = typeof priceRange.min === 'number' && !isNaN(priceRange.min);
        const hasMax = typeof priceRange.max === 'number' && !isNaN(priceRange.max);
        if (hasMin && hasMax) {
          activeFilters.push({ handle: key, label: `${Lang.labels.price}$${priceRange.min} - $${priceRange.max}`, value: SpecialValue.CLEAR });
        } else if (hasMin) {
          activeFilters.push({ handle: key, label: `${Lang.labels.price}$${priceRange.min}+`, value: SpecialValue.CLEAR });
        } else if (hasMax) {
          activeFilters.push({ handle: key, label: `${Lang.labels.price}Up to $${priceRange.max}`, value: SpecialValue.CLEAR });
        }
      } else if (Array.isArray(value) && value.length > 0) {
        value.forEach(v => {
          const metadata = State.filterMetadata.get(key);
          let label = metadata?.label || key;
          let displayValue = v; // Default to the value itself

          // For collection filters, use collection title from State.collections
          const isCollectionFilter = ($.isCollectionOptionType(metadata?.optionType) || $.isCollectionKey(key));
          if (isCollectionFilter && State.collections && Array.isArray(State.collections)) {
            const collection = State.collections.find(c => {
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

    // Also show cpid if it exists and collection filter is not in filters
    if (State.selectedCollection?.id) {
      const hasCollectionFilter = Object.keys(filters).some(key => {
        const metadata = State.filterMetadata.get(key);
        return ($.isCollectionOptionType(metadata?.optionType) || $.isCollectionKey(key)) &&
          Array.isArray(filters[key]) &&
          (filters[key] as string[]).includes(String(State.selectedCollection.id));
      });

      if (!hasCollectionFilter) {
        // Find collection name from State.collections
        const collection = State.collections?.find(c => {
          const cId = String(c.id || c.gid || c.collectionId || '');
          return cId && String(cId) === String(State.selectedCollection.id);
        });
        const collectionName = collection?.title || collection?.label || collection?.name || 'Collection';
        activeFilters.push({
          handle: FilterKey.CPID,
          label: `${Lang.labels.collection}${collectionName}`,
          value: String(State.selectedCollection.id)
        });
      }
    }

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
    this.container.insertBefore(appliedContainer, this.container.firstChild);
  },

  scrollToProducts(): void {
    if (State.scrollToProductsOnFilter === false) {
      return; // stop on debugging mode
    }
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

  showLoading(): void {
    // Show products skeleton
    if (this.productsGrid) {
      // Clear existing products
      $.clear(this.productsGrid);

      // Get page size from State or use minimum of 24
      const pageSize = State.pagination?.limit || C.PAGE_SIZE || 24;
      const skeletonCount = Math.max(pageSize, 24); // At least 24 skeleton cards

      // Create skeleton product cards directly in the grid
      const skeletonCards: HTMLElement[] = [];
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
      skeletonCards.forEach(card => this.productsGrid!.appendChild(card));

      // Store reference to skeleton cards for easy removal
      this.loading = skeletonCards;
    }

    // Show filters skeleton if filters container exists and is visible
    if (this.filtersContainer && this.filtersContainer.style.display !== 'none') {
      this.showFiltersSkeleton();
    }
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

  hideLoading(): void {
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
      // Last resort: log to console
      Log.error('Cannot show error: productsContainer not found', { message });
      console.error('[AFS Error]', message);
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
  }
};

// ============================================================================
// FALLBACK MODE HELPER (Page reload for Liquid products)
// ============================================================================

const FallbackMode = {
  // Get pagination info for fallback mode (from URL params and Liquid data)
  getPagination(): PaginationState {
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
  reloadPage(filters: FiltersState, pagination: PaginationState, sort: SortState): void {
    const url = new URL(window.location.href);
    url.search = '';

    // Add sort parameter
    if (sort && sort.field) {
      if (sort.field === 'best-selling' || sort.field === 'bestselling') {
        url.searchParams.set('sort', 'best-selling');
      } else {
        // Convert to new format: "field-direction" (e.g., "title-ascending")
        const direction = $.equals(sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
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
        const priceRange = value as PriceRange;
        const min = typeof priceRange.min === 'number' && !isNaN(priceRange.min) ? priceRange.min : undefined;
        const max = typeof priceRange.max === 'number' && !isNaN(priceRange.max) ? priceRange.max : undefined;
        if (State.priceRangeHandle) {
          url.searchParams.set(State.priceRangeHandle, `${min !== undefined ? min : ''}-${max !== undefined ? max : ''}`);
        } else {
          if (min !== undefined) url.searchParams.set('priceMin', String(min));
          if (max !== undefined) url.searchParams.set('priceMax', String(max));
        }
      } else if ($.equals(key, FilterKey.SEARCH) && typeof value === 'string' && value.trim()) {
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

/**
 * Check if filters are present (other than page, sort, size, limit)
 * If filters are present, clear cpid so it won't be sent automatically
 */
const clearCpidIfFiltersPresent = (filters: FiltersState): void => {
  if (!State.selectedCollection?.id) {
    return; // No cpid to clear
  }

  // Check if there are any filters other than page, sort, size, limit
  const hasFilters = Object.keys(filters || {}).some(key => {
    const value = filters[key];
    // Skip empty values
    if ($.empty(value)) return false;
    // Skip pagination/sort params (these don't count as filters)
    if ($.equalsAny(key, FilterKey.PAGE, FilterKey.LIMIT, FilterKey.SORT, FilterKey.SIZE)) return false;
    // Skip priceRange if it's null or empty
    if ($.isPriceRangeKey(key)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const priceRange = value as PriceRange;
      const hasMin = typeof priceRange.min === 'number' && !isNaN(priceRange.min);
      const hasMax = typeof priceRange.max === 'number' && !isNaN(priceRange.max);
      if (!hasMin && !hasMax) return false;
    }
    // Skip search if empty
    if ($.equals(key, FilterKey.SEARCH) && (!value || typeof value !== 'string' || !value.trim())) return false;
    // All other keys are considered filters
    return true;
  });

  if (hasFilters) {
    // State.selectedCollection.id = null;
    Log.debug('Filters present, cleared cpid', { filters });
  }
};

const Filters = {
  // Toggle standard filter (vendor, productType, tags, collections) or handle-based filter
  toggle(handle: string, value: string): void {
    const normalized = $.str(value);
    if (!normalized || !handle) {
      Log.warn('Invalid filter toggle', { handle, value });
      return;
    }

    const current = (State.filters[handle] as string[]) || [];
    const isActive = current.includes(normalized);
    const filterValues = isActive
      ? current.filter(v => v !== normalized)
      : [...current, normalized];

    // Check if this is a collection filter and if cpid should be cleared
    const metadata = State.filterMetadata.get(handle);
    const isCollectionFilter = (metadata?.optionType === 'Collection' || handle === 'collections');

    if (isCollectionFilter && State.selectedCollection?.id) {
      // Store original cpid value before any modifications
      const originalCpid = State.selectedCollection.id;

      // If unchecking (removing) and the value matches cpid, clear cpid
      if (isActive && String(normalized) === String(originalCpid)) {
        // State.selectedCollection.id = null;
        Log.debug('Collection filter unchecked (was cpid), cleared cpid', {
          handle,
          value: normalized,
          cpid: originalCpid
        });
      }
      // Also check if cpid is no longer in the filter values after toggle
      else if (!filterValues.some(v => String(v) === String(originalCpid))) {
        // State.selectedCollection.id = null;
        Log.debug('Collection filter toggled, cpid no longer in values, cleared cpid', {
          handle,
          value: normalized,
          filterValues,
          wasCpid: String(normalized) === String(originalCpid),
          originalCpid
        });
      }
    }

    if (filterValues.length === 0) {
      delete State.filters[handle];
    } else {
      State.filters[handle] = filterValues;
    }

    // Clear cpid if filters are present (other than page, sort, size, limit)
    // clearCpidIfFiltersPresent(State.filters);

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
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    }

    this.apply();
  },

  updatePriceRange(min: number, max: number): void {
    if (typeof min !== 'number' || typeof max !== 'number' || min < 0 || max < min) {
      Log.warn('Invalid price range', { min, max });
      return;
    }

    // Check if range matches the full range (no filter applied)
    const priceFilter = State.availableFilters.find(f => $.isPriceRangeOptionType(f.optionType) || $.equals(f.optionKey, FilterKey.PRICE_RANGE));
    if (priceFilter && priceFilter.range) {
      if (min === priceFilter.range.min && max === priceFilter.range.max) {
        State.filters.priceRange = null;
      } else {
        State.filters.priceRange = { min, max };
      }
    } else {
      State.filters.priceRange = { min, max };
    }

    // Clear cpid if filters are present (other than page, sort, size, limit)
    // clearCpidIfFiltersPresent(State.filters);

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
  applyProductsOnly: $.debounce(async (): Promise<void> => {
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
      Log.error('Failed to load products', { error: e instanceof Error ? e.message : String(e) });

      // Try to use fallback products if available
      if (State.fallbackProducts && State.fallbackProducts.length > 0) {
        Log.warn('Products API failed, using fallback products from Liquid', {
          error: e instanceof Error ? e.message : String(e),
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
          if ($.isBestSelling(State.sort.field)) {
            DOM.sortSelect.value = SortField.BEST_SELLING;
          } else {
            const direction = $.equals(State.sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
            DOM.sortSelect.value = `${State.sort.field}-${direction}`;
          }
        }

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);

      } else {
        DOM.showError(`${Lang.messages.failedToLoadProducts}: ${e instanceof Error ? e.message : Lang.messages.unknownError}`);
      }
    }
  }, C.DEBOUNCE),

  // Apply filters and products (for filter changes - needs to update both)
  apply: $.debounce(async (): Promise<void> => {
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

          // Refresh range filter handles (in case config changed)
          const priceFilter = State.availableFilters.find(f => $.isPriceRangeOptionType(f.optionType));
          State.priceRangeHandle = priceFilter?.handle || State.priceRangeHandle;

          // Convert cpid to collection filter handle if collection filter exists and cpid is not already in filters
          if (State.selectedCollection?.id) {
            // Find collection filter handle from available filters
            const collectionFilter = State.availableFilters.find(f =>
              f.optionType === 'Collection' ||
              $.isCollectionKey(f.queryKey) ||
              $.isCollectionKey(f.handle)
            );

            if (collectionFilter) {
              const collectionHandle = collectionFilter.handle || collectionFilter.queryKey || 'collections';
              // Check if collection filter already has this ID
              const existingCollectionValues = (State.filters[collectionHandle] as string[]) || [];
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
        Log.warn('Failed to fetch updated filters', { error: e instanceof Error ? e.message : String(e) });
        // Continue with existing filters if update fails
      }

      DOM.renderProducts(State.products);
      DOM.renderInfo(State.pagination, State.pagination.total || 0);
      DOM.renderPagination(State.pagination);
      DOM.renderApplied(State.filters);
      DOM.hideLoading();
    } catch (e) {
      DOM.hideLoading();
      Log.error('Failed to apply filters', { error: e instanceof Error ? e.message : String(e) });

      // Try to use fallback products if available
      if (State.fallbackProducts && State.fallbackProducts.length > 0) {
        Log.warn('Filters API failed, using fallback products from Liquid', {
          error: e instanceof Error ? e.message : String(e),
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
          if ($.isBestSelling(State.sort.field)) {
            DOM.sortSelect.value = SortField.BEST_SELLING;
          } else {
            const direction = $.equals(State.sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
            DOM.sortSelect.value = `${State.sort.field}-${direction}`;
          }
        }

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);

      } else {
        DOM.showError(`${Lang.messages.failedToLoadProducts}: ${e instanceof Error ? e.message : Lang.messages.unknownError}`);
      }
    }
  }, C.DEBOUNCE)
};

// ============================================================================
// PRODUCT MODAL FUNCTIONS
// ============================================================================
// NOTE: Product modal functions have been moved to afs-quickview.ts
// The functions are available via window.AFSQuickView

// Type definition for backward compatibility
async function createProductModal(handle: string, modalId: string): Promise<ProductModalElement> {
  const shopifyWindow = window as ShopifyWindow;
  if (shopifyWindow.AFSQuickView?.createProductModal) {
    return shopifyWindow.AFSQuickView.createProductModal(handle, modalId);
  }
  throw new Error('AFSQuickView module not loaded');
}

// Legacy function stubs for backward compatibility
function setupModalHandlers(dialog: ProductModalElement, modalId: string, product: Product, formatPrice: (price: number | string) => string): void {
  // Handled by AFSQuickView module
}

function updateVariantInModal(dialog: ProductModalElement, modalId: string, variant: ProductVariant, formatPrice: (price: number | string) => string): void {
  // Handled by AFSQuickView module
}

function setupCloseHandler(dialog: ProductModalElement): void {
  // Handled by AFSQuickView module
}

// NOTE: Modal handler implementations moved to afs-quickview.ts

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

      const data = await response.json() as { product: Product };
      const product = data.product;

      if (!product || !product.variants || product.variants.length === 0) {
        throw new Error('Product has no variants');
      }

      // Use first available variant
      const variant = product.variants.find(v => v.available) || product.variants[0];

      await this.addVariant(Number(variant.id), 1);
    } catch (error) {
      Log.error('Quick add failed', { error: error instanceof Error ? error.message : String(error), handle });
      alert('Failed to add product to cart. Please try again.');
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
        const data = await response.json() as { product: Product };
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
      alert('Failed to add product to cart. Please try again.');
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
    // Create or update success message
    let message = document.querySelector<HTMLElement>('.afs-quick-add-success');
    if (!message) {
      message = $.el('div', 'afs-quick-add-success');
      document.body.appendChild(message);
    }

    message.textContent = Lang.messages.addedToCart;
    message.classList.add('afs-quick-add-success--show');

    // Use CSS animation end event instead of fixed timeout
    const handleAnimationEnd = () => {
      message.classList.remove('afs-quick-add-success--show');
      message.removeEventListener('animationend', handleAnimationEnd);
    };
    
    // Fallback timeout if animation doesn't fire
    const timeoutId = setTimeout(() => {
      message.classList.remove('afs-quick-add-success--show');
      message.removeEventListener('animationend', handleAnimationEnd);
    }, 3000);
    
    message.addEventListener('animationend', () => {
      clearTimeout(timeoutId);
      handleAnimationEnd();
    }, { once: true });
  }
};

// ============================================================================
// EVENT HANDLERS (Single delegated handler)
// ============================================================================

const Events = {
  attach(): void {
    if (!DOM.container) return;

    DOM.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest<HTMLElement>('[data-afs-action]')?.dataset.afsAction;
      const item = target.closest<HTMLElement>('.afs-filter-item');
      const checkbox = (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) ? target : item?.querySelector<HTMLInputElement>('.afs-filter-item__checkbox');
      const pagination = target.closest<HTMLButtonElement>('.afs-pagination__button');

      if (action === 'clear-all') {
        // Reset to initial state (standard filters only, handles will be removed dynamically)
        State.filters = { vendor: [], productType: [], tags: [], collections: [], search: '', priceRange: null };
        // Clear cpid when clearing all filters
        if (State.selectedCollection?.id) {
          // State.selectedCollection.id = null;
          Log.debug('Clear All: cleared cpid');
        }
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

        // Special-case: applied chips for non-toggle filters
        if ($.equals(key, FilterKey.CPID)) {
          if (State.selectedCollection?.id) {
            // State.selectedCollection.id = null;
            Log.debug('cpid removed, cleared selectedCollection');
          }
          UrlManager.update(State.filters, State.pagination, State.sort);
          DOM.scrollToProducts();
          DOM.showLoading();
          Filters.apply();
          return;
        }

        if ($.equals(key, FilterKey.SEARCH)) {
          State.filters.search = '';
          State.pagination.page = 1;
          UrlManager.update(State.filters, State.pagination, State.sort);
          DOM.scrollToProducts();
          DOM.showLoading();
          Filters.apply();
          return;
        }

        if ($.isPriceRangeKey(key)) {
          State.filters.priceRange = null;
          State.pagination.page = 1;
          UrlManager.update(State.filters, State.pagination, State.sort);
          DOM.scrollToProducts();
          DOM.showLoading();
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
          State.filters[handle] = [];
        }
        Filters.toggle(handle, value);
      }
      else if (pagination && !pagination.disabled) {
        const page = parseInt(pagination.getAttribute('data-afs-page') || '0', 10);
        if (page && page > 0) {
          // In fallback mode, read current page from URL to ensure accuracy
          if (State.usingFallback) {
            const urlParams = UrlManager.parse();
            const currentPage = urlParams.page || State.pagination.page || 1;
            // Calculate the correct next/previous page
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
      else if (target.closest<HTMLElement>('.afs-filter-group__clear')) {
        e.preventDefault();
        e.stopPropagation();
        const clearBtn = target.closest<HTMLElement>('.afs-filter-group__clear');
        if (!clearBtn) return;

        const handle = clearBtn.getAttribute('data-afs-filter-handle');
        if (!handle) return;

        // Check if this is a collection filter and if cpid should be cleared
        const metadata = State.filterMetadata.get(handle);
        const isCollectionFilter = ($.isCollectionOptionType(metadata?.optionType) || $.isCollectionKey(handle));

        // Remove the filter from State.filters
        if (State.filters[handle]) {
          // If clearing collection filter and cpid exists, check if cpid was in the filter values
          if (isCollectionFilter && State.selectedCollection?.id) {
            const filterValues = State.filters[handle];
            const originalCpid = State.selectedCollection.id;
            const cpidInValues = Array.isArray(filterValues) &&
              filterValues.some(v => String(v) === String(originalCpid));
            if (cpidInValues) {
              // State.selectedCollection.id = null;
              Log.debug('Collection filter cleared (contained cpid), cleared cpid', {
                handle,
                cpid: originalCpid
              });
            }
          }

          delete State.filters[handle];
          Log.debug('Filter cleared', { handle, isCollectionFilter });

          // Update URL
          UrlManager.update(State.filters, State.pagination, State.sort);

          // Scroll to top and show loading
          DOM.scrollToProducts();
          DOM.showLoading();

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

        // Persist collapse state in states Map with improved error handling
        const stateKey = group.getAttribute('data-afs-filter-key');
        if (stateKey) {
          try {
            // Get or create state
            const state = states.get(stateKey) || {};
            state.collapsed = collapsedState;
            state.lastUpdated = Date.now();
            states.set(stateKey, state);
            
            // Also persist to sessionStorage for page refresh persistence
            try {
              const stateKey = `afs_filter_state_${group.getAttribute('data-afs-filter-handle')}`;
              sessionStorage.setItem(stateKey, JSON.stringify({ collapsed: collapsedState }));
            } catch (e) {
              // SessionStorage might be disabled, ignore
              Log.debug('Could not persist to sessionStorage', { error: e });
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
          // Use quick view module
          const shopifyWindow = window as ShopifyWindow;
          if (shopifyWindow.AFSQuickView?.handleQuickViewClick) {
            shopifyWindow.AFSQuickView.handleQuickViewClick(handle);
          } else {
            Log.error('AFSQuickView module not loaded');
          }
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
          items.querySelectorAll<HTMLElement>('.afs-filter-item').forEach((el, i) => {
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

    // Helper function to handle sort change
    const handleSortChange = (select: HTMLSelectElement): void => {
      const sortValue = select.value;
      if (!sortValue) return;

      Log.info('Sort dropdown changed', { sortValue, currentSort: State.sort });

      // Calculate new sort state
      // New format: "title-ascending", "price-descending", etc.
      let newSort: SortState;
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
              if ($.isBestSelling(State.sort.field)) {
                currentSortValue = SortField.BEST_SELLING;
              } else {
                // Convert to new format: "field-direction" (e.g., "title-ascending")
                const direction = $.equals(State.sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
                currentSortValue = `${State.sort.field}-${direction}`;
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
      const params = UrlManager.parse();

      // Store old state to detect if filters changed
      const oldFilters = JSON.stringify(State.filters);
      const oldPage = State.pagination.page;
      const oldSort = JSON.stringify(State.sort);

      // Set keep from URL params
      if (params.keep !== undefined) {
        if (params.keep === SpecialValue.ALL || (typeof params.keep === 'string' && $.equals(params.keep, SpecialValue.ALL))) {
          State.keep = SpecialValue.ALL;
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
          const paramValue = params[key];
          if (Array.isArray(paramValue)) {
            State.filters[key] = paramValue;
          } else if (typeof paramValue === 'string') {
            State.filters[key] = [paramValue];
          }
        }
      });

      // Normalize handle-based price param into State.filters.priceRange for slider UI
      const priceRangeFilterValue = State.priceRangeHandle ? State.filters[State.priceRangeHandle] : null;
      if (
        State.priceRangeHandle &&
        Array.isArray(priceRangeFilterValue) &&
        priceRangeFilterValue.length > 0
      ) {
        const raw = String(priceRangeFilterValue[0] || '');
        const parts = raw.split('-');
        if (parts.length === 2) {
          const min = parts[0].trim() ? parseFloat(parts[0]) : undefined;
          const max = parts[1].trim() ? parseFloat(parts[1]) : undefined;
          const hasMin = typeof min === 'number' && !isNaN(min) && min >= 0;
          const hasMax = typeof max === 'number' && !isNaN(max) && max >= 0;
          if (hasMin || hasMax) {
            State.filters.priceRange = {
              min: hasMin ? min : undefined,
              max: hasMax ? max : undefined
            };
            delete State.filters[State.priceRangeHandle];
          }
        }
      }

      const newPage = params.page || State.pagination.page;
      if (newPage !== oldPage) {
        State.pagination.page = newPage;
      }

      // Update sort from URL params or default to best-selling
      if (params.sort) {
        const sortValue = typeof params.sort === 'object' ? params.sort.field : params.sort;
        if (typeof sortValue === 'string') {
          const normalized = sortValue.toLowerCase().trim();
          if (normalized === 'best-selling' || normalized === 'bestselling') {
            State.sort = { field: 'best-selling', order: 'asc' };
          } else if (normalized.includes('-')) {
            // New format: "field-direction" (e.g., "title-ascending")
            const [field, direction] = normalized.split('-');
            const order = $.equalsAny(direction, SortOrder.ASCENDING) ? SortOrder.ASC : $.equalsAny(direction, SortOrder.DESCENDING) ? SortOrder.DESC : SortOrder.DESC;
            State.sort = { field, order };
          } else {
            // Legacy format: "field:order" (backward compatibility)
            const [field, order] = sortValue.split(':');
            State.sort = { field, order: (order || 'desc') as 'asc' | 'desc' };
          }
        } else if (typeof params.sort === 'object' && params.sort.field) {
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

interface AFSInterface {
  init(config?: AFSConfig): void;
  load(): Promise<void>;
  Logger: typeof Log;
}

const AFS: AFSInterface = {
  init(config: AFSConfig = {}): void {
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

      State.shop = config.shop;
      State.collections = config.collections || [];
      State.selectedCollection = {
        id: config.selectedCollection?.id ?? null,
        sortBy: config.selectedCollection?.sortBy ?? null
      };
      State.scrollToProductsOnFilter = config.scrollToProductsOnFilter !== false;

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
        if ($.equalsAny(config.keep, SpecialValue.ALL, '__ALL__')) {
          State.keep = SpecialValue.ALL;
        } else if (Array.isArray(config.keep) && config.keep.length > 0) {
          State.keep = config.keep;
        } else if (typeof config.keep === 'string' && config.keep.trim()) {
          State.keep = $.split(config.keep);
        } else {
          State.keep = null;
        }
        Log.info('Keep filters set from config', { keep: State.keep });
      }

      // Store price range handle if provided
      if (config.priceRangeHandle !== undefined) {
        State.priceRangeHandle = config.priceRangeHandle;
      }

      Log.info('Shop set', { shop: State.shop });
      Log.info('Collections set', { collections: State.collections });

      // Map config properties to selectors (support both old and new naming)
      const containerSelector = config.containerSelector || (config as any).container || '[data-afs-container]';
      const filtersSelector = config.filtersSelector || (config as any).filtersContainer;
      const productsSelector = config.productsSelector || (config as any).productsContainer;
      
      DOM.init(containerSelector, filtersSelector, productsSelector);
      Log.info('DOM initialized');

      // Show loading skeleton immediately on initial load (before API calls)
      DOM.showLoading();

      Events.attach();
      Log.info('Events attached');

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
    // Loading skeleton is already shown in init(), but ensure it's visible
    DOM.showLoading();
    try {
      // Parse URL params FIRST before loading filters, so filters endpoint gets the correct filters
      const urlParams = UrlManager.parse();
      Log.debug('Parsed URL params on load', { urlParams });

      // Rebuild filters from URL params BEFORE calling API.filters()
      // This ensures filters endpoint receives the correct filters from URL
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
          const paramValue = urlParams[key];
          if (Array.isArray(paramValue)) {
            State.filters[key] = paramValue;
          } else if (typeof paramValue === 'string') {
            State.filters[key] = [paramValue];
          }
        }
      });

      // Clear cpid if filters are present (other than page, sort, size, limit)
      // clearCpidIfFiltersPresent(State.filters);

      Log.info('Loading filters...', { shop: State.shop, filters: State.filters });
      let filtersData: FiltersResponseData;
      try {
        filtersData = await API.filters(State.filters);
        Log.info('Filters loaded', { filtersCount: filtersData.filters?.length || 0 });
      } catch (filterError) {
        Log.warn('Failed to load filters, continuing with empty filters', { error: filterError instanceof Error ? filterError.message : String(filterError) });
        filtersData = { filters: [] };
      }
      // Validate filters is an array
      if (!Array.isArray(filtersData.filters)) {
        Log.error('Invalid filters response: filters is not an array', { filters: filtersData.filters });
        filtersData.filters = [];
      }

      State.availableFilters = filtersData.filters || [];
      State.filterMetadata = Metadata.buildFilterMetadata(State.availableFilters);

      // Cache range filter handles (so we can write handle-style URL params like other filters)
      const priceFilter = State.availableFilters.find(f => $.isPriceRangeOptionType(f.optionType));
      State.priceRangeHandle = priceFilter?.handle || State.priceRangeHandle || null;

      // If URL used handle-based price param (e.g. pr_xxx=10-100), normalize into State.filters.priceRange
      // so the slider renders correctly. Keep URL updates handle-based via State.priceRangeHandle.
      const priceRangeFilterValue = State.priceRangeHandle ? State.filters[State.priceRangeHandle] : null;
      if (
        State.priceRangeHandle &&
        Array.isArray(priceRangeFilterValue) &&
        priceRangeFilterValue.length > 0
      ) {
        const raw = String(priceRangeFilterValue[0] || '');
        const parts = raw.split('-');
        if (parts.length === 2) {
          const min = parts[0].trim() ? parseFloat(parts[0]) : undefined;
          const max = parts[1].trim() ? parseFloat(parts[1]) : undefined;
          const hasMin = typeof min === 'number' && !isNaN(min) && min >= 0;
          const hasMax = typeof max === 'number' && !isNaN(max) && max >= 0;
          if (hasMin || hasMax) {
            State.filters.priceRange = {
              min: hasMin ? min : undefined,
              max: hasMax ? max : undefined
            };
            delete State.filters[State.priceRangeHandle];
          }
        }
      }

      // After filters are loaded, update State.filters with cpid conversion if needed
      // Convert cpid to collection filter handle if collection filter exists
      if (State.selectedCollection?.id) {
        const collectionFilter = State.availableFilters.find(f =>
          f.optionType === 'Collection' ||
          $.isCollectionKey(f.queryKey) ||
          $.isCollectionKey(f.handle)
        );

        if (collectionFilter) {
          const collectionHandle = collectionFilter.handle || collectionFilter.queryKey || 'collections';
          // Check if collection filter already has this ID in State.filters
          const existingCollectionValues = (State.filters[collectionHandle] as string[]) || [];
          if (!existingCollectionValues.includes(String(State.selectedCollection.id))) {
            // Add cpid as collection filter
            if (!State.filters[collectionHandle]) {
              State.filters[collectionHandle] = [];
            }
            (State.filters[collectionHandle] as string[]).push(String(State.selectedCollection.id));
            Log.debug('Converted cpid to collection filter', {
              cpid: State.selectedCollection.id,
              handle: collectionHandle
            });
          }
        }
      }

      // Set keep from URL params
      if (urlParams.keep !== undefined) {
        if (urlParams.keep === SpecialValue.ALL || (typeof urlParams.keep === 'string' && $.equals(urlParams.keep, SpecialValue.ALL))) {
          State.keep = SpecialValue.ALL;
        } else if (Array.isArray(urlParams.keep) && urlParams.keep.length > 0) {
          State.keep = urlParams.keep;
        } else {
          State.keep = null;
        }
        Log.debug('Keep filters set from URL', { keep: State.keep });
      } else {
        State.keep = null;
      }

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
        const sortValue = typeof urlParams.sort === 'object' ? urlParams.sort.field : urlParams.sort;
        if (typeof sortValue === 'string') {
          const normalized = sortValue.toLowerCase().trim();
          if (normalized === 'best-selling' || normalized === 'bestselling') {
            State.sort = { field: 'best-selling', order: 'asc' };
          } else if (normalized.includes('-')) {
            // New format: "field-direction" (e.g., "title-ascending")
            const [field, direction] = normalized.split('-');
            const order = $.equalsAny(direction, SortOrder.ASCENDING) ? SortOrder.ASC : $.equalsAny(direction, SortOrder.DESCENDING) ? SortOrder.DESC : SortOrder.DESC;
            State.sort = { field, order };
          } else {
            // Legacy format: "field:order" (backward compatibility)
            const [field, order] = sortValue.split(':');
            State.sort = { field, order: (order || 'desc') as 'asc' | 'desc' };
          }
        } else if (typeof urlParams.sort === 'object' && urlParams.sort.field) {
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
          if ($.isBestSelling(State.sort.field)) {
            DOM.sortSelect.value = SortField.BEST_SELLING;
          } else {
            // Convert to new format: "field-direction" (e.g., "title-ascending")
            const direction = $.equals(State.sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
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
      Log.error('Load failed', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined, shop: State.shop, apiBaseURL: API.baseURL });

      // Try to use fallback products if available
      if (State.fallbackProducts && State.fallbackProducts.length > 0) {
        Log.warn('Initial load failed, using fallback products from Liquid', {
          error: e instanceof Error ? e.message : String(e),
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
          if ($.isBestSelling(State.sort.field)) {
            DOM.sortSelect.value = SortField.BEST_SELLING;
          } else {
            const direction = $.equals(State.sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
            DOM.sortSelect.value = `${State.sort.field}-${direction}`;
          }
        }

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);

      } else {
        DOM.showError(`${Lang.messages.failedToLoad}: ${e instanceof Error ? e.message : Lang.messages.unknownError}. ${Lang.messages.checkConsole}`);
      }
    }
  },

  Logger: Log
};

// Export to window
const shopifyWindow = window as ShopifyWindow;
shopifyWindow.DOM = DOM;
shopifyWindow.AFS_State = State;
shopifyWindow.AFS_API = API;
shopifyWindow.AFS_LOG = Log;
shopifyWindow.QuickAdd = QuickAdd;
shopifyWindow.$ = $;
shopifyWindow.Icons = Icons;
(shopifyWindow as typeof shopifyWindow & { Lang?: typeof Lang }).Lang = Lang;
(shopifyWindow as typeof shopifyWindow & { SpecialValue?: typeof SpecialValue }).SpecialValue = SpecialValue;

// Export
if (typeof window !== 'undefined') {
  shopifyWindow.AFS = AFS;
} else if (typeof global !== 'undefined') {
  (global as typeof globalThis & { AFS?: AFSInterface }).AFS = AFS;
}
