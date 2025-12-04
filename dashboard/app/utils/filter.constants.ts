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
  targetScope: "all",
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
  targetScope: "all",
  filterOrientation: "vertical",
  defaultView: "grid",
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
 */
export const TARGET_SCOPES = ["all", "entitled"] as const;

/**
 * Available filter orientations
 */
export const FILTER_ORIENTATIONS = ["vertical", "horizontal"] as const;

/**
 * Available default views
 */
export const DEFAULT_VIEWS = ["grid", "list"] as const;

/**
 * Get base option type from option type
 */
export function getBaseOptionType(optionType: string): string {
  // For variant options (Color, Size, etc.), use "Option" as base type
  const variantOptionTypes = ["Color", "Size", "Material", "Style"];
  if (variantOptionTypes.includes(optionType)) {
    return "Option";
  }
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

