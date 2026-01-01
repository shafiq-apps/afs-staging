/**
 * Filter Enums
 * Enum values matching the GraphQL schema in app/modules/graphql/schema/filters.schema.ts
 */

import { StorefrontFilterData } from "./filter.constants";

export enum DisplayType {
  LIST = "LIST",
  DROPDOWN = "DROPDOWN",
  GRID = "GRID",
  RANGE = "RANGE",
  SWATCH = "SWATCH",
  COLOR_SWATCH = "COLOR_SWATCH",
  CHECKBOX = "CHECKBOX",
  RADIO = "RADIO",
  SQUARE = "SQUARE",
}

export enum SelectionType {
  SINGLE = "SINGLE",
  MULTIPLE = "MULTIPLE",
  RANGE = "RANGE",
}

export enum SortOrder {
  COUNT = "COUNT",
  ASCENDING = "ASCENDING",
  DESCENDING = "DESCENDING",
  MANUAL = "MANUAL",
}

export enum FilterOptionStatus {
  PUBLISHED = "PUBLISHED",
  UNPUBLISHED = "UNPUBLISHED",
}

export enum FilterStatus {
  PUBLISHED = "PUBLISHED",
  UNPUBLISHED = "UNPUBLISHED",
}

export enum PaginationType {
  SCROLL = "SCROLL",
  LOAD_MORE = "LOAD_MORE",
  PAGES = "PAGES",
  INFINITE_SCROLL = "INFINITE_SCROLL",
}

export enum TextTransform {
  NONE = "NONE",
  UPPERCASE = "UPPERCASE",
  LOWERCASE = "LOWERCASE",
  CAPITALIZE = "CAPITALIZE",
}

export enum DeploymentChannel {
  APP = "APP",
  THEME = "THEME",
  ADMIN = "ADMIN",
}

export enum TargetScope {
  ALL = "all",
  ENTITLED = "entitled",
}

export enum FilterType {
  CUSTOM = "custom",
  DEFAULT = "default",
}

export enum FilterOrientation {
  VERTICAL = "vertical",
  HORIZONTAL = "horizontal",
}

export enum DefaultView {
  GRID = "grid",
  LIST = "list",
}

export enum PageMode {
  CREATE = "CREATE",
  EDIT = "EDIT",
}

export interface FilterOption {
  // Identification
  handle: string;
  position: number;
  
  // Basic Configuration
  label: string;
  optionType: string;
  status: string;
  
  // Display Configuration
  displayType: string;
  selectionType: string;
  
  // Value Selection & Filtering
  baseOptionType?: string;
  allowedOptions: string[];
  filterByPrefix: string[];
  removePrefix: string[];
  removeSuffix: string[];
  replaceText: Array<{ from: string; to: string }>;
  
  // Value Grouping & Normalization
  groupBySimilarValues: boolean;
  valueNormalization: Record<string, string>;
  
  // Display Options
  collapsed: boolean;
  searchable: boolean;
  showTooltip: boolean;
  tooltipContent: string;
  showCount: boolean;
  
  // Sorting
  sortBy: string;
  manualSortedValues: string[];
  
  // Advanced
  textTransform: string;
  paginationType: string;
  groups: string[];
  menus: string[];
  showMenu: boolean;
  
  // Price-specific
  minPrice?: number;
  maxPrice?: number;
  
  // Performance Optimization: Pre-computed variant option keys
  variantOptionKey?: string;
}

export interface CollectionReference {
  label: string;
  value: string;
  id: string;
  gid: string;
}

export interface MenuTreeNode {
  id: string;
  label: string;
  children?: MenuTreeNode[];
}


export interface FilterFormHandle {
  save: () => Promise<void>;
}

// Combined filter state type - all filter-related state in one object
export interface FilterState {
  title: string;
  description: string;
  status: FilterStatus;
  filterType: string;
  targetScope: TargetScope;
  allowedCollections: CollectionReference[];
  filterOptions: FilterOption[];
  deploymentChannel: DeploymentChannel;
  tags: string[];
  filterOrientation: FilterOrientation;
  defaultView: DefaultView;
  showFilterCount: boolean;
  showActiveFilters: boolean;
  gridColumns: number;
  showProductCount: boolean;
  showSortOptions: boolean;
  displayQuickView: boolean;
  displayItemsCount: boolean;
  displayVariantInsteadOfProduct: boolean;
  displayCollectionImage: boolean;
  hideOutOfStockItems: boolean;
  onLaptop: string;
  onTablet: string;
  onMobile: string;
  defaultSort: string;
  paginationType: PaginationType;
  itemsPerPage: number;
  showPageInfo: boolean;
  pageInfoFormat: string;
  showResetButton: boolean;
  showClearAllButton: boolean;
}

export interface FilterFormProps {
  mode: PageMode;
  initialFilter?: {
    id?: string;
    title: string;
    description?: string;
    status: string;
    filterType?: string;
    targetScope: string | TargetScope;
    allowedCollections: CollectionReference[];
    options: FilterOption[];
    deploymentChannel?: string | DeploymentChannel;
    tags?: string[];
    settings?: {
      displayQuickView?: boolean;
      displayItemsCount?: boolean;
      displayVariantInsteadOfProduct?: boolean;
      defaultView?: string;
      filterOrientation?: string;
      displayCollectionImage?: boolean;
      hideOutOfStockItems?: boolean;
      onLaptop?: string;
      onTablet?: string;
      onMobile?: string;
      productDisplay?: {
        gridColumns?: number;
        showProductCount?: boolean;
        showSortOptions?: boolean;
        defaultSort?: string;
      };
      pagination?: {
        type?: string;
        itemsPerPage?: number;
        showPageInfo?: boolean;
        pageInfoFormat?: string;
      };
      showFilterCount?: boolean;
      showActiveFilters?: boolean;
      showResetButton?: boolean;
      showClearAllButton?: boolean;
    };
  } | null;
  shop?: string;
  storefrontFilters?: StorefrontFilterData | null;
}

/**
 * Helper function to safely convert string to enum value
 */
export function toDisplayType(value: string | undefined | null): DisplayType {
  if (!value) return DisplayType.CHECKBOX;
  const upper = value.toUpperCase();
  return Object.values(DisplayType).includes(upper as DisplayType)
    ? (upper as DisplayType)
    : DisplayType.CHECKBOX;
}

export function toSelectionType(value: string | undefined | null): SelectionType {
  if (!value) return SelectionType.MULTIPLE;
  const upper = value.toUpperCase();
  return Object.values(SelectionType).includes(upper as SelectionType)
    ? (upper as SelectionType)
    : SelectionType.MULTIPLE;
}

export function toSortOrder(value: string | undefined | null): SortOrder {
  if (!value) return SortOrder.ASCENDING;
  const upper = value.toUpperCase();
  return Object.values(SortOrder).includes(upper as SortOrder)
    ? (upper as SortOrder)
    : SortOrder.ASCENDING;
}

export function toFilterOptionStatus(value: string | undefined | null): FilterOptionStatus {
  if (!value) return FilterOptionStatus.PUBLISHED;
  const upper = value.toUpperCase();
  return Object.values(FilterOptionStatus).includes(upper as FilterOptionStatus)
    ? (upper as FilterOptionStatus)
    : FilterOptionStatus.PUBLISHED;
}

export function toFilterStatus(value: string | undefined | null): FilterStatus {
  if (!value) return FilterStatus.PUBLISHED;
  const upper = value.toUpperCase();
  return Object.values(FilterStatus).includes(upper as FilterStatus)
    ? (upper as FilterStatus)
    : FilterStatus.PUBLISHED;
}

export function toPaginationType(value: string | undefined | null): PaginationType {
  if (!value) return PaginationType.SCROLL;
  
  // Normalize the value: convert kebab-case to SCREAMING_SNAKE_CASE
  // e.g., "load-more" -> "LOAD_MORE", "infinite-scroll" -> "INFINITE_SCROLL"
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  
  // Check if it matches an enum value
  if (Object.values(PaginationType).includes(normalized as PaginationType)) {
    return normalized as PaginationType;
  }
  
  // Fallback to SCROLL if no match
  return PaginationType.SCROLL;
}

export function toTextTransform(value: string | undefined | null): TextTransform {
  if (!value) return TextTransform.NONE;
  const upper = value.toUpperCase();
  return Object.values(TextTransform).includes(upper as TextTransform)
    ? (upper as TextTransform)
    : TextTransform.NONE;
}

export function toDeploymentChannel(value: string | undefined | null): DeploymentChannel {
  if (!value) return DeploymentChannel.APP;
  const upper = value.toUpperCase();
  return Object.values(DeploymentChannel).includes(upper as DeploymentChannel)
    ? (upper as DeploymentChannel)
    : DeploymentChannel.APP;
}

export function toTargetScope(value: string | undefined | null): TargetScope {
  if (!value) return TargetScope.ALL;
  const lower = value.toLowerCase();
  return Object.values(TargetScope).includes(lower as TargetScope)
    ? (lower as TargetScope)
    : TargetScope.ALL;
}

export function toFilterType(value: string | undefined | null): FilterType {
  if (!value) return FilterType.CUSTOM;
  const lower = value.toLowerCase();
  return Object.values(FilterType).includes(lower as FilterType)
    ? (lower as FilterType)
    : FilterType.CUSTOM;
}

export function toFilterOrientation(value: string | undefined | null): FilterOrientation {
  if (!value) return FilterOrientation.VERTICAL;
  const lower = value.toLowerCase();
  return Object.values(FilterOrientation).includes(lower as FilterOrientation)
    ? (lower as FilterOrientation)
    : FilterOrientation.VERTICAL;
}

export function toDefaultView(value: string | undefined | null): DefaultView {
  if (!value) return DefaultView.GRID;
  const lower = value.toLowerCase();
  return Object.values(DefaultView).includes(lower as DefaultView)
    ? (lower as DefaultView)
    : DefaultView.GRID;
}

