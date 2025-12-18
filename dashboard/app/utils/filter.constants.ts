/**
 * Filter Constants
 * Default values, mappings, and configuration constants for filters
 */

import {
  DisplayType,
  SelectionType,
  SortOrder,
  FilterOptionStatus,
  FilterStatus,
  PaginationType,
  TextTransform,
  TargetScope,
  FilterOrientation,
  DefaultView,
} from "./filter.enums";

/**
 * StorefrontFilterData interface (matches FacetAggregations structure from products.type.ts)
 * Used to extract available base option types from aggregations
 */
export interface StorefrontFilterData {
  vendors?: Array<{ value: string; count: number }>;
  productTypes?: Array<{ value: string; count: number }>;
  tags?: Array<{ value: string; count: number }>;
  collections?: Array<{ value: string; count: number }>;
  options?: Record<string, Array<{ value: string; count: number }>>;
  price?: {
    min: number;
    max: number;
  };
}

/**
 * Default filter option values
 */
export const DEFAULT_FILTER_OPTION = {
  displayType: DisplayType.CHECKBOX,
  selectionType: SelectionType.MULTIPLE,
  status: FilterOptionStatus.PUBLISHED,
  sortBy: SortOrder.COUNT,
  textTransform: TextTransform.NONE,
  paginationType: PaginationType.PAGES,
  groupBySimilarValues: false,
  collapsed: false,
  searchable: true,
  showTooltip: false,
  showCount: true,
  showMenu: false,
  tooltipContent: "",
  allowedOptions: [] as string[],
  groups: [] as string[],
  removePrefix: [] as string[],
  removeSuffix: [] as string[],
  replaceText: [] as Array<{ from: string; to: string }>,
  filterByPrefix: [] as string[],
  manualSortedValues: [] as string[],
  valueNormalization: {} as Record<string, string>,
  menus: [] as string[],
};

/**
 * Default filter values
 */
export const DEFAULT_FILTER = {
  status: FilterStatus.PUBLISHED,
  targetScope: TargetScope.ALL,
  filterOrientation: FilterOrientation.VERTICAL,
  defaultView: DefaultView.GRID,
  showFilterCount: true,
  showActiveFilters: true,
  gridColumns: 3,
  showProductCount: true,
  showSortOptions: true,
} as const;

/**
 * Price-specific filter option defaults
 */
export const PRICE_FILTER_DEFAULTS = {
  displayType: DisplayType.RANGE,
  selectionType: SelectionType.RANGE,
  optionType: "Price",
  baseOptionType: "PRICE", // Matches GraphQL BaseOptionType enum
} as const;

/**
 * Selection type mappings by option type
 */
export const SELECTION_TYPE_MAPPINGS: Record<string, SelectionType[]> = {
  all: [SelectionType.MULTIPLE, SelectionType.SINGLE],
  price: [SelectionType.RANGE],
} as const;

/**
 * Display type mappings by option type
 */
export const DISPLAY_TYPE_MAPPINGS: Record<string, DisplayType[]> = {
  list: [
    DisplayType.LIST,
    DisplayType.CHECKBOX,
    DisplayType.RADIO,
    // DisplayType.SWATCH,
    // DisplayType.COLOR_SWATCH,
    // DisplayType.GRID
  ],
  price: [DisplayType.RANGE],
} as const;
/**
 * Display type mappings by option type
 */

export const SORT_TYPES_MAPPINGS: Record<string, string>[] = [
  {
    label: "Count",
    value: SortOrder.COUNT,
  },
  {
    label: "Ascending (A-Z)",
    value: SortOrder.ASCENDING,
  },
  {
    label: "Descending (Z-A)",
    value: SortOrder.DESCENDING,
  }
] as const;

/**
 * Available option types
 */
export const OPTION_TYPES = [
  "Price",
  "Vendor",
  "ProductType",
  "Tags",
  "Collection",
  "Metafield",
] as const;

/**
 * Available target scopes
 * @deprecated Use TargetScope enum instead
 */
export const TARGET_SCOPES = Object.values(TargetScope) as readonly string[];

/**
 * Available filter orientations
 * @deprecated Use FilterOrientation enum instead
 */
export const FILTER_ORIENTATIONS = Object.values(FilterOrientation) as readonly string[];

/**
 * Available default views
 * @deprecated Use DefaultView enum instead
 */
export const DEFAULT_VIEWS = Object.values(DefaultView) as readonly string[];

/**
 * Standard base option types that correspond to FacetAggregations fields
 * These match the structure in products.type.ts FacetAggregations interface:
 * - price -> "PRICE"
 * - vendors -> "VENDOR"
 * - productTypes -> "PRODUCT_TYPE"
 * - tags -> "TAGS"
 * - collections -> "COLLECTION"
 * - optionPairs -> "OPTION" (for all variant options like Color, Size, etc.)
 * 
 * IMPORTANT: Values match GraphQL BaseOptionType enum exactly
 */
export const STANDARD_BASE_OPTION_TYPES = [
  "PRICE",        // price
  "VENDOR",       // vendors
  "PRODUCT_TYPE", // productTypes
  "TAGS",         // tags
  "COLLECTION",   // collections
  "OPTION",       // optionPairs (variant options like Color, Size, etc.)
] as const;

/**
 * Get all available base option types from storefront filters
 * Uses FacetAggregations structure to determine what base option types are available
 * 
 * IMPORTANT: Returns values matching GraphQL BaseOptionType enum exactly
 * 
 * @param storefrontFilters - The storefront filter data (matches FacetAggregations structure)
 * @returns Array of available base option types matching GraphQL BaseOptionType enum
 */
export function getAvailableBaseOptionTypes(
  storefrontFilters: StorefrontFilterData | null
): string[] {
  const baseTypes: string[] = [];
  
  // Always include standard base types that are available in FacetAggregations
  // These correspond to the fields in products.type.ts FacetAggregations interface
  // Returns values matching GraphQL BaseOptionType enum exactly
  if (storefrontFilters?.price) {
    baseTypes.push("PRICE");
  }
  if (storefrontFilters?.vendors && storefrontFilters.vendors.length > 0) {
    baseTypes.push("VENDOR");
  }
  if (storefrontFilters?.productTypes && storefrontFilters.productTypes.length > 0) {
    baseTypes.push("PRODUCT_TYPE");
  }
  if (storefrontFilters?.tags && storefrontFilters.tags.length > 0) {
    baseTypes.push("TAGS");
  }
  if (storefrontFilters?.collections && storefrontFilters.collections.length > 0) {
    baseTypes.push("COLLECTION");
  }
  
  // Option is always available for variant options (optionPairs)
  // Variant options are dynamic and come from product data
  if (storefrontFilters?.options && Object.keys(storefrontFilters.options).length > 0) {
    baseTypes.push("OPTION");
  }
  
  // If no filters provided, return all standard types
  if (baseTypes.length === 0) {
    return [...STANDARD_BASE_OPTION_TYPES];
  }
  
  return baseTypes;
}

/**
 * Get base option type from option type
 * 
 * Standard option types (Price, Vendor, ProductType, Tags, Collection) 
 * use their own name as the base type.
 * 
 * All other option types are variant options (Color, Size, Material, Style, etc.) 
 * and use "Option" as the base type. Variant options are fully dynamic and come 
 * from product data (optionPairs in FacetAggregations), so we cannot predict or hardcode them.
 * 
 * This function maps optionType to baseOptionType based on FacetAggregations structure:
 * - priceRange -> "PRICE"
 * - vendors -> "VENDOR"
 * - productTypes -> "PRODUCT_TYPE"
 * - tags -> "TAGS"
 * - collections -> "COLLECTION"
 * - optionPairs -> "OPTION" (for all variant options)
 * 
 * IMPORTANT: Returns values matching the GraphQL BaseOptionType enum exactly:
 * PRICE, VENDOR, PRODUCT_TYPE, TAGS, COLLECTION, OPTION
 * 
 * @param optionType - The option type to get the base type for
 * @returns The base option type matching GraphQL BaseOptionType enum ("PRICE", "VENDOR", "PRODUCT_TYPE", "TAGS", "COLLECTION", or "OPTION")
 */
export function getBaseOptionType(optionType: string): string {
  if (!optionType) {
    return "OPTION";
  }
  
  // Normalize the option type for comparison (case-insensitive, trim whitespace)
  const normalizedType = optionType.trim().toLowerCase();
  
  // Standard/base option types that use their own name as base type
  // These correspond to FacetAggregations fields in products.type.ts
  // Returns values matching GraphQL BaseOptionType enum exactly
  if (normalizedType === "price" || normalizedType === "pricerange" || normalizedType === "price-range") {
    return "PRICE";
  }
  if (normalizedType === "vendor" || normalizedType === "vendors") {
    return "VENDOR";
  }
  if (normalizedType === "product type" || normalizedType === "producttype" || normalizedType === "product_type") {
    return "PRODUCT_TYPE";
  }
  if (normalizedType === "tags" || normalizedType === "tag") {
    return "TAGS";
  }
  if (normalizedType === "collection" || normalizedType === "collections") {
    return "COLLECTION";
  }
  
  // Everything else is a variant option (Color, Size, Material, Style, etc.)
  // These come from optionPairs in FacetAggregations and are fully dynamic
  // We cannot predict or hardcode them, so any unknown type is treated as "OPTION"
  return "OPTION";
}

export function getOptionType(optionType: string): string {
  if (!optionType) {
    return "Unknown"
  }
  
  // Normalize the option type for comparison (case-insensitive, trim whitespace)
  const normalizedType = optionType.trim().toLowerCase();
  
  // Standard/base option types that use their own name as base type
  // These correspond to FacetAggregations fields in products.type.ts
  if (normalizedType === "price" || normalizedType === "pricerange" || normalizedType === "price range") {
    return "Price";
  }
  if (normalizedType === "vendor" || normalizedType === "vendors") {
    return "Vendor";
  }
  if (normalizedType === "product type" || normalizedType === "producttype" || normalizedType === "product_type") {
    return "ProductType";
  }
  if (normalizedType === "tags" || normalizedType === "tag") {
    return "Tags";
  }
  if (normalizedType === "collection" || normalizedType === "collections") {
    return "Collection";
  }
  
  // Everything else is a variant option (Color, Size, Material, Style, etc.)
  // These come from optionPairs in FacetAggregations and are fully dynamic
  // We cannot predict or hardcode them, so any unknown type is treated as "Option"
  return optionType;
}

/**
 * Get available selection types for an option type
 */
export function getAvailableSelectionTypes(optionType: string): SelectionType[] {
  if (optionType === "Price") {
    return SELECTION_TYPE_MAPPINGS.price;
  }
  return SELECTION_TYPE_MAPPINGS.all;
}

/**
 * Get available display types for an option type
 */
export function getAvailableDisplayTypes(optionType: string): DisplayType[] {
  if (optionType === "Price") {
    return DISPLAY_TYPE_MAPPINGS.price;
  }
  return DISPLAY_TYPE_MAPPINGS.list;
}

