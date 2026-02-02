// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ConstantsType {
	readonly DEBOUNCE: number;
	readonly TIMEOUT: number;
	readonly CACHE_TTL: number;
	readonly PAGE_SIZE: number;
}

export interface ConfigType {
	readonly DEBOUNCE: number;
	readonly TIMEOUT: number;
	readonly CACHE_TTL: number;
	readonly PAGE_SIZE: number;
}

export interface IconsType {
	readonly rightArrow: string;
	readonly downArrow: string;
	readonly eye: string;
	readonly minus: string;
	readonly plus: string;
	readonly close: string;
}

export type ShopifyCrop =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

export type ShopifyFormat = "webp" | "jpg" | "jpeg" | "pjpg" | "png";

export type buildImageUrlType = {
  width?: number | null;
  height?: number | null;
  quality?: number | null;
  format?: ShopifyFormat | null;
  crop?: ShopifyCrop | null;
};

export interface ImageAttributesType {
	src: string;
	srcset?: string;
	sizes?: string;
	width?: number;
	height?: number;
	alt: string;
	loading?: 'lazy' | 'eager';
	decoding?: 'async' | 'sync' | 'auto';
	fetchpriority?: 'high' | 'low' | 'auto';
	fallbackUrl?: string;
}

export interface PriceRangeType {
	min?: number;
	max?: number;
}

export interface SortStateType {
	field: string;
	order: 'asc' | 'desc';
}

export interface PaginationStateType {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

export interface FallbackPaginationType {
	currentPage: number;
	totalPages: number;
	totalProducts: number;
}

export interface SelectedCollectionType {
	id: string | null;
	sortBy: string | null;
}

export interface FilterMetadataType {
	label: string;
	queryKey?: string;
	optionKey?: string;
	optionType?: string;
}

export interface FilterValueType {
	value?: string;
	key?: string;
	name?: string;
	label?: string;
	count?: number;
}

export interface FilterOptionType {
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
	values?: FilterValueType[];
	range?: {
		min: number;
		max: number;
	};
	key?: string;
}

export interface ProductImageType {
	url?: string;
	urlSmall?: string;
	urlMedium?: string;
	urlLarge?: string;
	urlFallback?: string;
}

export interface ProductVariantType {
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

export interface ProductType {
	id?: string | number;
	productId?: string | number;
	gid?: string | number;
	handle?: string;
	title?: string;
	vendor?: string;
	imageUrl?: string;
	featuredImage?: ProductImageType;
	minPrice?: string | number;
	maxPrice?: string | number;
	totalInventory?: string | number;
	variants: ProductVariantType[];
	description?: string;
	images?: string[];
	options?: Array<{
		name: string;
		values: string[];
	}>;
}

export interface CollectionType {
	id?: string | number;
	gid?: string | number;
	collectionId?: string | number;
	title?: string;
	label?: string;
	name?: string;
}

export interface FiltersStateType {
	[key: string]: string[] | string | PriceRangeType | null;
	vendor: string[];
	productType: string[];
	tags: string[];
	collections: string[];
	search: string;
	priceRange: PriceRangeType | null;
}

export interface FilterGroupStateType {
	collapsed?: boolean;
	search?: string;
	lastUpdated?: number;
}

export interface APIResponse<T> {
	success: boolean;
	data?: T;
	message?: string;
}

export interface ProductsResponseDataType {
	products?: ProductType[];
	pagination?: PaginationStateType;
	filters?: FilterOptionType[];
}

export interface FiltersResponseDataType {
	filters?: FilterOptionType[];
}

export interface ParsedUrlParamsType {
	vendor?: string[];
	productType?: string[];
	tags?: string[];
	collections?: string[];
	search?: string;
	priceRange?: PriceRangeType;
	page?: number;
	limit?: number;
	sort?: SortStateType;
	[key: string]: string[] | string | PriceRangeType | SortStateType | number | undefined;
}

export interface AppliedFilterType {
	handle: string;
	label: string;
	value: string | typeof SpecialValueType.CLEAR;
}

export interface FilterStateType {
	set: (config: AFSConfigType) => void,
	shop: string | null;
	filters: FiltersStateType;
	products: ProductType[];
	collections: CollectionType[];
	selectedCollection: SelectedCollectionType;
	pagination: PaginationStateType;
	sort: SortStateType;
	loading: boolean;
	availableFilters: FilterOptionType[];
	filterMetadata: Map<string, FilterMetadataType>;
	fallbackProducts: ProductType[];
	fallbackPagination: FallbackPaginationType;
	usingFallback: boolean;
	moneyFormat: string | null;
	moneyWithCurrencyFormat: string | null;
	currency: string | null;
	scrollToProductsOnFilter: boolean;
	priceRangeHandle: string | null;
	routesRoot: string;
	isSearchTemplate: boolean;
	settings: FilterSettingsType;
}

export interface AFSConfigType {
	apiBaseUrl?: string;
	shop?: string;
	containerSelector?: string;
	filtersSelector?: string;
	productsSelector?: string;
	collections?: CollectionType[];
	selectedCollection?: {
		id: string | null;
		sortBy?: string | null;
	};
	fallbackProducts?: ProductType[];
	fallbackPagination?: FallbackPaginationType;
	moneyFormat?: string;
	moneyWithCurrencyFormat?: string;
	currency?: string;
	scrollToProductsOnFilter?: boolean;
	priceRangeHandle?: string | null;
	isSearchTemplate?: boolean;
	debug?: boolean;
	shopLocale?: {
		locale: string;
		primary: boolean;
	};
	settings?: FilterSettingsType;
	searchTerms?: string;
}

export interface SliderInstanceType {
	destroy?: () => void;
	goToSlide?: (index: number) => void;
	updateVariantImage?: (variant: ProductVariantType, images: string[], variants: ProductVariantType[]) => boolean;
	currentIndex?: number;
}

export interface ProductModalElement extends HTMLDialogElement {
	_productData?: ProductType;
	_currentVariantId?: number | string;
	_slider?: SliderInstanceType;
}

export interface FilterItemsElement extends HTMLElement {
	_items?: FilterValueType[];
}

// Type for loggable data (any JSON-serializable value)
// Using a more permissive type for logging that allows complex objects
// We use a type that allows any object structure for logging purposes
// Note: This intentionally allows any object structure since logging needs flexibility
// We explicitly include all our custom types plus allow objects with index signatures
export type LoggableData =
	| string
	| number
	| boolean
	| null
	| undefined
	| Error
	| FiltersStateType
	| SortStateType
	| PaginationStateType
	| FilterOptionType
	| FilterOptionType[]
	| CollectionType
	| CollectionType[]
	| PriceRangeType
	| AFSConfigType
	| ParsedUrlParamsType
	| APIResponse<ProductsResponseDataType | FiltersResponseDataType>
	| ProductsResponseDataType
	| FiltersResponseDataType
	| { [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] | FiltersStateType | SortStateType | PaginationStateType | FilterOptionType | FilterOptionType[] | CollectionType | CollectionType[] | PriceRangeType | AFSConfigType | ParsedUrlParamsType | APIResponse<ProductsResponseDataType | FiltersResponseDataType> | ProductsResponseDataType | FiltersResponseDataType | { [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] } }

	| (string | number | boolean | null | undefined | FiltersStateType | SortStateType | PaginationStateType | FilterOptionType | FilterOptionType[] | CollectionType | CollectionType[] | PriceRangeType | AFSConfigType | ParsedUrlParamsType | APIResponse<ProductsResponseDataType | FiltersResponseDataType> | ProductsResponseDataType | FiltersResponseDataType | { [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] })[];

// ============================================================================
// ENUMS
// ============================================================================

export enum FilterKeyType {
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
	SHOP = 'shop',
	SHOP_DOMAIN = 'shop_domain'
}

export enum SortFieldType {
	BEST_SELLING = 'best-selling',
	BESTSELLING = 'bestselling',
	TITLE = 'title',
	PRICE = 'price',
	CREATED = 'created'
}

export enum SortOrderType {
	ASC = 'asc',
	DESC = 'desc',
	ASCENDING = 'ascending',
	DESCENDING = 'descending'
}

export enum OptionType {
	COLLECTION = 'Collection',
	PRICE_RANGE = 'priceRange'
}

export enum DisplayType {
	RADIO = 'radio',
	CHECKBOX = 'checkbox'
}

export enum SelectionType {
	MULTIPLE = 'multiple',
	MULTIPLE_UPPER = 'MULTIPLE'
}

export enum SpecialValueType {
	ALL = '__all__',
	CLEAR = '__clear__',
	DEFAULT_TITLE = 'Default Title'
}

export interface LanguageTextsType {
	readonly buttons: {
		readonly quickAdd: string;
		readonly quickAddToCart: string;
		readonly quickView: string;
		readonly addToCart: string;
		readonly inStock: string;
		readonly soldOut: string;
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
		readonly readMore: string;
		readonly readLess: string;
	};
	readonly labels: {
		readonly sortBy: string;
		readonly appliedFilters: string;
		readonly search: string;
		readonly price: string;
		readonly priceFrom: string;
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
	readonly general: {
		readonly selected: string;
		readonly of: string;
	}
}

export interface SliderOptionsType {
	thumbnailsPosition?: 'top' | 'left' | 'right' | 'bottom';
	enableKeyboard?: boolean;
	enableAutoHeight?: boolean;
	maxHeight?: number | null;
	animationDuration?: number;
	enableMagnifier?: boolean;
	magnifierZoom?: number;
}

export interface SliderSlideChangeEventDetailType {
	index: number;
	total: number;
}

export interface AFSInterfaceType {
	load: () => Promise<void>;
}

// ============================================================================
// TYPES FOR SEARCH MODULES
// ============================================================================

export interface SearchConfigtype {
	apiBaseUrl?: string;
	__v?: string,
	__lastEdit?: string,
	shop: string | null;
	moneyFormat: string | null;
	moneyWithCurrencyFormat: string | null;
	currency: string | null;
	searchInputSelector?: string;
	minQueryLength?: number;
	debounceMs?: number;
	maxSuggestions?: number;
	maxProducts?: number;
	showSuggestions?: boolean;
	showProducts?: boolean;
	enableKeyboardNav?: boolean;
	debug?: boolean,
}

export interface SearchResultType {
	products: ProductType[];
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

export interface SearchAPIResponseType {
	success: boolean;
	data: SearchResultType;
	message?: string;
}


export interface AFSInterface extends AFSInterfaceType {
	initialize: () => void;
}

export interface MetadataType {
	buildFilterMetadata: (
		filters: FilterOptionType[]
	) => Map<string, FilterMetadataType>;
};

type BadgeLocation = 'none' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
type DiscountLocation = BadgeLocation | 'next-to-price';

type ProductHtmlFactories = {
	title: (content: string | HTMLElement) => HTMLElement;
	vendor: (content: string | HTMLElement) => HTMLElement;
	price: (content: string | HTMLElement) => HTMLElement;
};

export interface FilterSettingsType {
	hoverImage: boolean;
	showVendor: boolean;
	showPrice: boolean;
	showComparePrice: boolean;
	showDiscount: DiscountLocation;
	soldOutBadgeLocation: BadgeLocation;
	inStockBadgeLocation: BadgeLocation;
	quickViewLocation: BadgeLocation;
	addToCartButtonLocation: 'none' | 'inside-image' | 'outside-image';
	html: ProductHtmlFactories
}

export interface QuickAddOptionsType {
	product: ProductType;
	isSoldOut: boolean;
	label?: string;
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export interface APIType {
	baseURL: string;
	__v: string;
	__id: string;
	requestId: string | null;
	cache: Map<string, ProductsResponseDataType>;
	timestamps: Map<string, number>;
	pending: Map<string, Promise<ProductsResponseDataType>>;

	key(filters: FiltersStateType, pagination: PaginationStateType, sort: SortStateType): string;
	get(key: string): ProductsResponseDataType | null;
	set(key: string, value: ProductsResponseDataType): void;
	fetch(
		url: string,
		timeout?: number
	): Promise<APIResponse<ProductsResponseDataType | FiltersResponseDataType>>;
	products(
		filters: FiltersStateType,
		pagination: PaginationStateType,
		sort: SortStateType
	): Promise<ProductsResponseDataType>;
	filters(filters: FiltersStateType): Promise<FiltersResponseDataType>;

	setBaseURL(url: string): void;
	buildFiltersFromUrl(urlParams: Record<string, any>): void;
	setPaginationFromUrl(urlParams: Record<string, any>): void;
	setSortFromUrl(urlParams: Record<string, any>): void;
};
