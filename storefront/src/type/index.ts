// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

import { Icons } from "../components/Icons";
import { API, DOM, Log, QuickAdd } from "../digitalcoo-filter";
import type { AFSInterface } from "../digitalcoo-filter";
import { $ } from "../utils/$.utils";

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

export interface ImageOptimizationOptionsType {
	width?: number;
	height?: number;
	quality?: number;
	format?: string;
	crop?: string | null;
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
	variants?: ProductVariantType[];
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
}

export interface AFSConfigType {
	apiBaseUrl?: string;
	shop?: string;
	containerSelector?: string;
	filtersSelector?: string;
	productsSelector?: string;
	collections?: CollectionType[];
	selectedCollection?: {
		id?: string | null;
		sortBy?: string | null;
	};
	fallbackProducts?: ProductType[];
	fallbackPagination?: FallbackPaginationType;
	moneyFormat?: string;
	moneyWithCurrencyFormat?: string;
	currency?: string;
	scrollToProductsOnFilter?: boolean;
	priceRangeHandle?: string | null;
	debug?: boolean;
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

export interface ShopifyWindow extends Window {
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
	}) => SliderInstanceType;
	AFS?: AFSInterface;
	DOM?: typeof DOM;
	AFS_State?: FilterStateType;
	AFS_API?: typeof API;
	AFS_LOG?: typeof Log;
	AFSQuickView?: {
		createQuickViewButton: (product: ProductType) => HTMLElement | null;
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
	init(config?: AFSConfigType): void;
	load(): Promise<void>;
	Logger: typeof Log;
}


// ============================================================================
// TYPES FOR SEARCH MODULES
// ============================================================================

export interface SearchConfigtype {
	apiBaseUrl?: string;
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