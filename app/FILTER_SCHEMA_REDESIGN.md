# Filter Schema Redesign - Requirements & Implementation Plan

## Overview
This document outlines the redesigned filter schema to support comprehensive filter customization for storefront display.

## Key Changes

### 1. Removed "Filter Sections" Feature
- **Reason**: Filter options themselves serve as sections on the storefront
- **Action**: Removed `FilterSection` interface and related UI

### 2. Enhanced FilterOption Interface

#### New Fields Added:

**Value Selection & Filtering:**
- `baseOptionType?: string` - For derived options (e.g., "Color" for "Winter Colors")
- `selectedValues: string[]` - Specific values to show from base option
- `removeSuffix: string[]` - Remove suffixes from display
- `replaceText: Array<{ from: string; to: string }>` - Replace text patterns

**Value Grouping & Normalization:**
- `valueNormalization: Record<string, string>` - Map similar values to one normalized value

**Display Options:**
- `showTooltip: boolean` - Show tooltip
- `showCount: boolean` - Show count badges

**Removed:**
- `manualSortedData` - Redundant with `manualSortedValues`

### 3. Enhanced Display Types
Added new display types:
- `swatch` - Color swatches
- `color-swatch` - Color swatches with color preview
- `checkbox` - Checkbox list
- `radio` - Radio button list
- `square` - Square-shaped options

### 4. Enhanced Settings Interface

**Product Display:**
- `defaultSort?: string` - Default sorting option

**Pagination:**
- `type?: string` - "pages" | "load-more" | "infinite-scroll"
- `itemsPerPage?: number` - Items per page
- `showPageInfo?: boolean` - Show "Showing X-Y of Z products"
- `pageInfoFormat?: string` - Custom format string

**Filter Display:**
- `showResetButton?: boolean` - Show reset filters button
- `showClearAllButton?: boolean` - Show clear all button

## User Requirements Implementation

### ✅ Requirement 1: Position Control (Drag & Drop)
- **Status**: Already implemented
- **Location**: Filter options can be reordered via drag and drop
- **Field**: `position: number`

### ✅ Requirement 2: Display Customization
- **Status**: Schema updated, UI pending
- **Fields**: 
  - `displayType` now supports: `swatch`, `color-swatch`, `checkbox`, `radio`, `square`
- **Next Steps**: Add UI controls in filter option settings

### ✅ Requirement 3: Value Selection from Base Options
- **Status**: Schema updated, UI pending
- **Fields**:
  - `baseOptionType?: string` - Base option (e.g., "Color")
  - `selectedValues: string[]` - Selected values (e.g., ["Red", "Yellow", "Pink"])
- **Example**: 
  - Filter Option: "Winter Colors"
  - `baseOptionType: "Color"`
  - `selectedValues: ["Red", "Yellow", "Pink", "Dark Green"]`
- **Next Steps**: Add UI for selecting base option and values

### ✅ Requirement 4: Text Transformation (Prefix/Suffix/Replace)
- **Status**: Schema updated, UI pending
- **Fields**:
  - `removePrefix: string[]` - Remove prefixes
  - `removeSuffix: string[]` - Remove suffixes
  - `replaceText: Array<{ from: string; to: string }>` - Replace patterns
- **Example**: 
  - Original: `winter_collection_discount`
  - Remove: `_collection_discount`
  - Display: `winter`
  - **Note**: Original value is kept for ES queries
- **Next Steps**: Add UI for text transformation rules

### ✅ Requirement 5: Value Normalization (Group Similar Values)
- **Status**: Schema updated, UI pending
- **Field**: `valueNormalization: Record<string, string>`
- **Example**: 
  ```json
  {
    "jacket": "Jacket",
    "Jacket": "Jacket",
    "JACKET": "Jacket",
    "Jackets": "Jacket",
    "Jackety": "Jacket"
  }
  ```
- **Next Steps**: Add UI for value normalization mapping

### ✅ Requirement 6: Additional Display Options
- **Status**: Partially implemented
- **Fields**:
  - `collapsed: boolean` - Collapse on load ✅
  - `searchable: boolean` - Show search bar ✅
  - `groupBySimilarValues: boolean` - Group similar values ✅
  - `sortBy: string` - Sort filter values ✅
  - `showTooltip: boolean` - Show tooltip ✅
  - `tooltipContent: string` - Tooltip text ✅
- **Next Steps**: Ensure all options are accessible in UI

### ✅ Requirement 7: Active/Disabled State
- **Status**: Already implemented
- **Field**: `status: string` - "published" | "draft" | "disabled"
- **UI**: Toggle in filter option header

### ✅ Requirement 8: Advanced General Settings
- **Status**: Schema updated, UI partially implemented
- **Settings**:
  - Product Display (grid columns, sort options) ✅
  - Pagination (type, items per page, page info) ✅
  - Filter Display (reset button, clear all) ✅
- **Next Steps**: Complete UI implementation

## Schema Structure

```typescript
interface FilterOption {
  // Identification
  handle: string;
  position: number;
  optionId: string;
  
  // Basic Configuration
  label: string;
  optionType: string;
  status: string; // "published" | "draft" | "disabled"
  
  // Display Configuration
  displayType: string; // "list" | "dropdown" | "grid" | "range" | "swatch" | "color-swatch" | "checkbox" | "radio" | "square"
  selectionType: string; // "multiple" | "single" | "range"
  
  // Value Selection & Filtering
  baseOptionType?: string;
  selectedValues: string[];
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
  targetScope: string;
  textTransform: string;
  paginationType: string;
  groups: string[];
  menus: string[];
  showMenu: boolean;
}

interface Filter {
  id: string;
  title: string;
  description?: string;
  status: string;
  targetScope: string;
  allowedCollections: CollectionReference[];
  options: FilterOption[];
  settings?: {
    defaultView?: string;
    filterOrientation?: string;
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
}
```

## Next Steps for UI Implementation

1. **Value Selection UI** - Add interface for selecting base option and values
2. **Text Transformation UI** - Add interface for prefix/suffix/replace rules
3. **Value Normalization UI** - Add interface for mapping similar values
4. **Display Type Selector** - Add all new display types (swatch, color-swatch, etc.)
5. **Pagination Settings** - Complete pagination configuration UI
6. **Product Sort Settings** - Add default sort selector
7. **Filter Display Options** - Add reset/clear all button toggles

## Notes

- Original values are always preserved for Elasticsearch queries
- Display transformations only affect what users see
- Value normalization happens before display but original values are used for filtering
- Base option types allow creating custom filter groups from existing options

