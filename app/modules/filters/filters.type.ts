/**
 * Filters Types
 * Types for filter configuration data structures
 * Uses camelCase for all field names (following coding standards)
 */

export interface Filter {
  id: string;
  shop: string;
  title: string;
  description?: string;
  filterType: string; // "custom", "default"
  targetScope: string; // "all", "entitled"
  allowedCollections: Array<{
    label: string;
    value: string;
    id: string;
  }>;
  options: Array<{
    handle: string;
    position: number;
    optionId: string;
    label: string;
    optionType: string; // e.g., "Collection", "Size", "Color"
    displayType?: string;
    selectionType?: string;
    targetScope?: string;
    allowedOptions?: string[];
    
    // Display Options
    collapsed?: boolean;
    searchable?: boolean;
    showTooltip?: boolean;
    tooltipContent?: string;
    showCount?: boolean;
    showMenu?: boolean;
    status?: string;
    
    // Option Settings (nested object per new schema)
    optionSettings?: {
      // Value Selection & Filtering
      baseOptionType?: string;
      selectedValues?: string[];
      removeSuffix?: string[];
      replaceText?: Array<{ from: string; to: string }>;
      
      // Value Grouping & Normalization
      valueNormalization?: Record<string, string>;
      groupBySimilarValues?: boolean;
      
      // Filtering & Prefixes
      removePrefix?: string[];
      filterByPrefix?: string[];
      
      // Sorting
      sortBy?: string;
      manualSortedValues?: string[];
      
      // Advanced
      groups?: string[];
      menus?: string[];
      textTransform?: string;
      paginationType?: string;
      
      // Performance Optimization: Pre-computed variant option keys
      // Stores the variant option key (e.g., "Color", "Size", "Material") for this filter option
      // This allows faster aggregations by filtering optionPairs to only relevant keys
      variantOptionKey?: string;
    };
  }>;
  status: string;
  deploymentChannel: string; // "app", "theme", "admin"
  settings?: {
    // Legacy fields
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
    
    // New nested structure
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
  tags?: string[];
  isActive?: boolean;
  version?: number;
  updatedAt?: string | null;
  createdAt: string;
}

export interface CreateFilterInput {
  shop?: string; // Optional - will be taken from mutation argument if not provided
  title: string;
  description?: string;
  filterType?: string;
  targetScope?: string;
  allowedCollections?: Array<{
    label: string;
    value: string;
    id: string;
  }>;
  options: Array<{
    handle: string;
    position: number;
    optionId: string;
    label: string;
    optionType: string;
    displayType?: string;
    selectionType?: string;
    targetScope?: string;
    allowedOptions?: string[];
    
    // Display Options
    collapsed?: boolean;
    searchable?: boolean;
    showTooltip?: boolean;
    tooltipContent?: string;
    showCount?: boolean;
    showMenu?: boolean;
    status?: string;
    
    // Option Settings (nested object per new schema)
    optionSettings?: {
      baseOptionType?: string;
      selectedValues?: string[];
      removeSuffix?: string[];
      replaceText?: Array<{ from: string; to: string }>;
      valueNormalization?: Record<string, string>;
      groupBySimilarValues?: boolean;
      removePrefix?: string[];
      filterByPrefix?: string[];
      sortBy?: string;
      manualSortedValues?: string[];
      groups?: string[];
      menus?: string[];
      textTransform?: string;
      paginationType?: string;
      variantOptionKey?: string;
    };
  }>;
  status?: string;
  deploymentChannel?: string;
  settings?: {
    // Legacy fields
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
    
    // New nested structure
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
  tags?: string[];
  isActive?: boolean;
}

export interface UpdateFilterInput {
  title?: string;
  description?: string;
  filterType?: string;
  targetScope?: string;
  allowedCollections?: Array<{
    label: string;
    value: string;
    id: string;
  }>;
  options?: Array<{
    handle: string;
    position: number;
    optionId: string;
    label: string;
    optionType: string;
    displayType?: string;
    selectionType?: string;
    targetScope?: string;
    allowedOptions?: string[];
    collapsed?: boolean;
    searchable?: boolean;
    tooltipContent?: string;
    showMenu?: boolean;
    status?: string;
    
    // Option Settings (nested object per new schema)
    optionSettings?: {
      baseOptionType?: string;
      selectedValues?: string[];
      removeSuffix?: string[];
      replaceText?: Array<{ from: string; to: string }>;
      valueNormalization?: Record<string, string>;
      groupBySimilarValues?: boolean;
      removePrefix?: string[];
      filterByPrefix?: string[];
      sortBy?: string;
      manualSortedValues?: string[];
      groups?: string[];
      menus?: string[];
      textTransform?: string;
      paginationType?: string;
      variantOptionKey?: string;
    };
  }>;
  status?: string;
  deploymentChannel?: string;
  settings?: {
    // Legacy fields
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
    
    // New nested structure
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
  tags?: string[];
  isActive?: boolean;
}

