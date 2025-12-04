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
 * Default filter option values
 */
export const DEFAULT_FILTER_OPTION = {
  displayType: DisplayType.LIST,
  selectionType: SelectionType.MULTIPLE,
  status: FilterOptionStatus.PUBLISHED,
  sortBy: SortOrder.ASCENDING,
  textTransform: TextTransform.NONE,
  paginationType: PaginationType.SCROLL,
  groupBySimilarValues: false,
  collapsed: false,
  searchable: false,
  showTooltip: false,
  showCount: true,
  showMenu: false,
  targetScope: TargetScope.ALL,
  tooltipContent: "",
  selectedValues: [] as string[],
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
  baseOptionType: "Price",
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
  list: [DisplayType.LIST, DisplayType.DROPDOWN, DisplayType.GRID],
  price: [DisplayType.RANGE],
} as const;

/**
 * Available option types
 */
export const OPTION_TYPES = [
  "Price",
  "Vendor",
  "Product Type",
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
 * Get base option type from option type
 * 
 * Standard option types (Price, Vendor, Product Type, Tags, Collection, Metafield) 
 * use their own name as the base type.
 * 
 * All other option types are variant options (Color, Size, Material, Style, etc.) 
 * and use "Option" as the base type. Variant options are fully dynamic and come 
 * from product data, so we cannot predict or hardcode them.
 * 
 * @param optionType - The option type to get the base type for
 * @returns The base option type ("Price", "Vendor", "Product Type", "Tags", "Collection", "Metafield", or "Option")
 */
export function getBaseOptionType(optionType: string): string {
  if (!optionType) {
    return "Option";
  }
  
  // Normalize the option type for comparison (case-insensitive, trim whitespace)
  const normalizedType = optionType.trim().toLowerCase();
  
  // Standard/base option types that use their own name as base type
  // These are the known standard types - everything else is a variant option
  if (normalizedType === "price") return "Price";
  if (normalizedType === "category") return "Category";
  if (normalizedType === "vendor") return "Vendor";
  if (normalizedType === "product type" || normalizedType === "producttype") return "ProductType";
  if (normalizedType === "tags" || normalizedType === "tag") return "Tags";
  if (normalizedType === "collection" || normalizedType === "collections") return "Collection";
  if (normalizedType === "metafield" || normalizedType === "metafields") return "Metafield";
  
  // Everything else is a variant option (Color, Size, Material, Style, etc.)
  // These are fully dynamic and come from product variant options
  // We cannot predict or hardcode them, so any unknown type is treated as "Option"
  return "Option";
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

