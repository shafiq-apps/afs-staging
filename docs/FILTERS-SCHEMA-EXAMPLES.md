# Filters GraphQL Schema Documentation

This document provides comprehensive documentation for the Filters GraphQL API, including all types, queries, mutations, and examples.

## Table of Contents

- [Overview](#overview)
- [Enums](#enums)
- [Types](#types)
- [Input Types](#input-types)
- [Queries](#queries)
- [Mutations](#mutations)
- [Examples](#examples)

## Overview

The Filters GraphQL API allows you to create, read, update, and delete filter configurations for product filtering in storefronts. Filters define how products can be filtered by various attributes like price, vendor, product type, collections, tags, and variant options.

**Index:** `app_filters`

## Enums

### DisplayType

Defines how filter options are displayed in the UI.

```graphql
enum DisplayType {
  LIST          # Simple list view
  DROPDOWN      # Dropdown menu
  GRID          # Grid layout
  RANGE         # Range slider (for price)
  SWATCH        # Color swatches
  COLOR_SWATCH  # Color-specific swatches
  CHECKBOX      # Checkbox list
  RADIO         # Radio buttons
  SQUARE        # Square buttons
}
```

### SelectionType

Defines how users can select filter values.

```graphql
enum SelectionType {
  SINGLE    # Single selection only
  MULTIPLE  # Multiple selections allowed
  RANGE     # Range selection (for price)
}
```

### SortOrder

Defines how filter values are sorted.

```graphql
enum SortOrder {
  ASCENDING  # A to Z, 0 to 9
  DESCENDING # Z to A, 9 to 0
  MANUAL     # Custom order
}
```

### FilterOptionStatus

Status of individual filter options.

```graphql
enum FilterOptionStatus {
  PUBLISHED   # Option is active and visible
  UNPUBLISHED # Option is hidden/draft
}
```

### FilterStatus

Status of the entire filter configuration.

```graphql
enum FilterStatus {
  PUBLISHED   # Filter is active
  UNPUBLISHED # Filter is draft/inactive
}
```

### PaginationType

Type of pagination for filter values.

```graphql
enum PaginationType {
  SCROLL          # Infinite scroll
  LOAD_MORE       # Load more button
  PAGES           # Page numbers (1, 2, 3...)
  INFINITE_SCROLL # Continuous scrolling
}
```

### TextTransform

Text transformation for filter values.

```graphql
enum TextTransform {
  NONE       # No transformation
  UPPERCASE  # ALL UPPERCASE
  LOWERCASE  # all lowercase
  CAPITALIZE # Capitalize First Letter
}
```

### DeploymentChannel

Where the filter is deployed.

```graphql
enum DeploymentChannel {
  APP    # Shopify App
  THEME  # Theme integration
  ADMIN  # Admin interface
}
```

## Types

### CollectionReference

Reference to a Shopify collection.

```graphql
type CollectionReference {
  label: String!  # Display name
  value: String!  # Handle or identifier
  id: String!     # Collection ID
}
```

### TextReplacement

Text replacement rule for filter values.

```graphql
type TextReplacement {
  from: String!  # Text to find
  to: String!    # Replacement text
}
```

### FilterOptionSettings

Advanced settings for filter options.

```graphql
type FilterOptionSettings {
  baseOptionType: String              # Base category (Price, Vendor, etc.)
  selectedValues: [String!]            # Pre-selected values
  removeSuffix: [String!]              # Suffixes to remove from display
  replaceText: [TextReplacement!]     # Text replacement rules
  variantOptionKey: String            # Variant option key (Color, Size, etc.)
  valueNormalization: JSON             # Value normalization mapping
  groupBySimilarValues: Boolean        # Group similar values together
  removePrefix: [String!]             # Prefixes to remove from display
  filterByPrefix: [String!]           # Only show values with these prefixes
  sortBy: SortOrder                   # Sort order for values
  manualSortedValues: [String!]       # Custom sort order
  groups: [String!]                   # Value groups
  menus: [String!]                     # Hierarchical menu structure
  textTransform: TextTransform        # Text transformation
  paginationType: PaginationType      # Pagination type
}
```

### FilterOption

A single filter option (e.g., Price, Vendor, Color).

```graphql
type FilterOption {
  handle: String!                    # Unique identifier
  position: Int!                      # Display order
  label: String!                     # Display label
  optionType: String!                # Type (Price, Vendor, Color, etc.)
  displayType: DisplayType!          # How to display
  selectionType: SelectionType!      # Single/Multiple/Range
  targetScope: String!               # Scope (all, entitled)
  allowedOptions: [String!]!         # Allowed values
  collapsed: Boolean!                 # Start collapsed
  searchable: Boolean!                # Enable search
  showTooltip: Boolean!               # Show tooltip
  tooltipContent: String!             # Tooltip text
  showCount: Boolean!                 # Show product count
  showMenu: Boolean!                  # Show as hierarchical menu
  status: FilterOptionStatus!        # Published/Unpublished
  optionSettings: FilterOptionSettings # Advanced settings
}
```

### ProductDisplaySettings

Settings for product display.

```graphql
type ProductDisplaySettings {
  gridColumns: Int        # Number of columns in grid
  showProductCount: Boolean # Show total product count
  showSortOptions: Boolean  # Show sort dropdown
  defaultSort: String      # Default sort order
}
```

### PaginationSettings

Settings for pagination.

```graphql
type PaginationSettings {
  type: PaginationType    # Pagination type
  itemsPerPage: Int       # Items per page
  showPageInfo: Boolean   # Show page info
  pageInfoFormat: String # Page info format string
}
```

### FilterSettings

Global filter settings.

```graphql
type FilterSettings {
  displayQuickView: Boolean              # Show quick view
  displayItemsCount: Boolean             # Show item count
  displayVariantInsteadOfProduct: Boolean # Show variants
  defaultView: String                    # Default view (grid/list)
  filterOrientation: String              # vertical/horizontal
  displayCollectionImage: Boolean        # Show collection images
  hideOutOfStockItems: Boolean           # Hide OOS items
  onLaptop: String                       # Laptop display setting
  onTablet: String                       # Tablet display setting
  onMobile: String                       # Mobile display setting
  productDisplay: ProductDisplaySettings # Product display settings
  pagination: PaginationSettings         # Pagination settings
  showFilterCount: Boolean               # Show filter count badges
  showActiveFilters: Boolean             # Show active filters summary
  showResetButton: Boolean               # Show reset button
  showClearAllButton: Boolean            # Show clear all button
}
```

### Filter

Complete filter configuration.

```graphql
type Filter {
  id: String!                    # Unique identifier
  shop: String!                  # Shop domain
  title: String!                 # Filter title
  description: String             # Filter description
  filterType: String!             # Filter type (custom/default)
  targetScope: String!           # Scope (all/entitled)
  allowedCollections: [CollectionReference!]! # Collections filter applies to
  options: [FilterOption!]!      # Filter options
  status: FilterStatus!          # Published/Unpublished
  deploymentChannel: DeploymentChannel! # Deployment channel
  settings: FilterSettings       # Global settings
  tags: [String!]                # Tags for organization
  isActive: Boolean              # Active status (deprecated, use status)
  version: Int                   # Version number
  updatedAt: String              # Last update timestamp
  createdAt: String!             # Creation timestamp
}
```

### FilterListResult

Result of listing filters.

```graphql
type FilterListResult {
  filters: [Filter!]!  # Array of filters
  total: Int!          # Total count
}
```

## Input Types

All input types mirror their corresponding types but are used for mutations. See the [Mutations](#mutations) section for examples.

## Queries

### Get Single Filter

Get a specific filter by ID.

```graphql
query GetFilter($shop: String!, $id: String!) {
  filter(shop: $shop, id: $id) {
    id
    title
    description
    status
    filterType
    targetScope
    allowedCollections {
      label
      value
      id
    }
    options {
      handle
      position
      label
      optionType
      displayType
      selectionType
      targetScope
      allowedOptions
      collapsed
      searchable
      showTooltip
      tooltipContent
      showCount
      showMenu
      status
      optionSettings {
        baseOptionType
        selectedValues
        removeSuffix
        replaceText {
          from
          to
        }
        variantOptionKey
        valueNormalization
        groupBySimilarValues
        removePrefix
        filterByPrefix
        sortBy
        manualSortedValues
        groups
        menus
        textTransform
        paginationType
      }
    }
    settings {
      displayQuickView
      displayItemsCount
      displayVariantInsteadOfProduct
      defaultView
      filterOrientation
      displayCollectionImage
      hideOutOfStockItems
      onLaptop
      onTablet
      onMobile
      productDisplay {
        gridColumns
        showProductCount
        showSortOptions
        defaultSort
      }
      pagination {
        type
        itemsPerPage
        showPageInfo
        pageInfoFormat
      }
      showFilterCount
      showActiveFilters
      showResetButton
      showClearAllButton
    }
    tags
    isActive
    version
    createdAt
    updatedAt
  }
}
```

**Variables:**
```json
{
  "shop": "example-shop.myshopify.com",
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

### List All Filters

Get all filters for a shop.

```graphql
query ListFilters($shop: String!) {
  filters(shop: $shop) {
    total
    filters {
      id
      title
      description
      filterType
      status
      deploymentChannel
      isActive
      createdAt
      updatedAt
      tags
    }
  }
}
```

**Variables:**
```json
{
  "shop": "example-shop.myshopify.com"
}
```

**Response:**
```json
{
  "data": {
    "filters": {
      "total": 2,
      "filters": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "title": "Product Filters",
          "description": "Main product filtering",
          "filterType": "custom",
          "status": "PUBLISHED",
          "deploymentChannel": "APP",
          "isActive": true,
          "createdAt": "2024-01-15T10:30:00Z",
          "updatedAt": "2024-01-20T14:45:00Z",
          "tags": ["main", "products"]
        }
      ]
    }
  }
}
```

## Mutations

### Create Filter

Create a new filter configuration.

```graphql
mutation CreateFilter($shop: String!, $input: CreateFilterInput!) {
  createFilter(shop: $shop, input: $input) {
    id
    title
    description
    status
    version
    createdAt
    options {
      handle
      label
      position
    }
    settings {
      defaultView
      filterOrientation
    }
  }
}
```

**Variables Example - Basic Filter:**
```json
{
  "shop": "example-shop.myshopify.com",
  "input": {
    "title": "Product Filters",
    "description": "Main product filtering configuration",
    "filterType": "custom",
    "targetScope": "all",
    "status": "PUBLISHED",
    "deploymentChannel": "APP",
    "options": [
      {
        "handle": "price-filter",
        "position": 0,
        "label": "Price",
        "optionType": "Price",
        "displayType": "RANGE",
        "selectionType": "RANGE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": false,
        "showTooltip": false,
        "tooltipContent": "",
        "showCount": true,
        "showMenu": false,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Price",
          "sortBy": "ASCENDING"
        }
      },
      {
        "handle": "vendor-filter",
        "position": 1,
        "label": "Vendor",
        "optionType": "Vendor",
        "displayType": "LIST",
        "selectionType": "MULTIPLE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": true,
        "showTooltip": false,
        "tooltipContent": "",
        "showCount": true,
        "showMenu": false,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Vendor",
          "sortBy": "ASCENDING",
          "textTransform": "CAPITALIZE"
        }
      }
    ],
    "settings": {
      "defaultView": "grid",
      "filterOrientation": "vertical",
      "showFilterCount": true,
      "showActiveFilters": true,
      "showResetButton": true,
      "showClearAllButton": true,
      "productDisplay": {
        "gridColumns": 3,
        "showProductCount": true,
        "showSortOptions": true,
        "defaultSort": "relevance"
      },
      "pagination": {
        "type": "PAGES",
        "itemsPerPage": 24,
        "showPageInfo": true,
        "pageInfoFormat": "Showing {start}-{end} of {total}"
      }
    },
    "tags": ["main", "products"]
  }
}
```

**Variables Example - Filter with Collections:**
```json
{
  "shop": "example-shop.myshopify.com",
  "input": {
    "title": "Collection-Specific Filters",
    "targetScope": "entitled",
    "allowedCollections": [
      {
        "label": "Summer Collection",
        "value": "summer-collection",
        "id": "gid://shopify/Collection/123456"
      },
      {
        "label": "Winter Collection",
        "value": "winter-collection",
        "id": "gid://shopify/Collection/789012"
      }
    ],
    "options": [
      {
        "handle": "color-filter",
        "position": 0,
        "label": "Color",
        "optionType": "Color",
        "displayType": "COLOR_SWATCH",
        "selectionType": "MULTIPLE",
        "targetScope": "all",
        "allowedOptions": ["Red", "Blue", "Green"],
        "collapsed": false,
        "searchable": false,
        "showTooltip": true,
        "tooltipContent": "Select one or more colors",
        "showCount": true,
        "showMenu": false,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Option",
          "variantOptionKey": "color",
          "sortBy": "MANUAL",
          "manualSortedValues": ["Red", "Blue", "Green", "Yellow"],
          "textTransform": "CAPITALIZE"
        }
      }
    ],
    "status": "PUBLISHED",
    "deploymentChannel": "APP"
  }
}
```

**Variables Example - Filter with Advanced Options:**
```json
{
  "shop": "example-shop.myshopify.com",
  "input": {
    "title": "Advanced Product Filters",
    "options": [
      {
        "handle": "size-filter",
        "position": 0,
        "label": "Size",
        "optionType": "Size",
        "displayType": "LIST",
        "selectionType": "MULTIPLE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": true,
        "showCount": true,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Option",
          "variantOptionKey": "size",
          "removePrefix": ["Size-"],
          "filterByPrefix": ["Size-"],
          "replaceText": [
            {
              "from": "XS",
              "to": "Extra Small"
            },
            {
              "from": "XL",
              "to": "Extra Large"
            }
          ],
          "groupBySimilarValues": true,
          "sortBy": "MANUAL",
          "manualSortedValues": ["XS", "S", "M", "L", "XL", "XXL"],
          "textTransform": "UPPERCASE",
          "paginationType": "SCROLL"
        }
      }
    ],
    "status": "PUBLISHED"
  }
}
```

### Update Filter

Update an existing filter configuration.

```graphql
mutation UpdateFilter($shop: String!, $id: String!, $input: CreateFilterInput!) {
  updateFilter(shop: $shop, id: $id, input: $input) {
    id
    title
    description
    status
    version
    updatedAt
    options {
      handle
      label
      position
    }
    settings {
      defaultView
      filterOrientation
    }
  }
}
```

**Variables:**
```json
{
  "shop": "example-shop.myshopify.com",
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "input": {
    "title": "Updated Product Filters",
    "description": "Updated description",
    "status": "PUBLISHED",
    "options": [
      {
        "handle": "price-filter",
        "position": 0,
        "label": "Price Range",
        "optionType": "Price",
        "displayType": "RANGE",
        "selectionType": "RANGE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": false,
        "showCount": true,
        "status": "PUBLISHED"
      }
    ],
    "settings": {
      "defaultView": "list",
      "filterOrientation": "horizontal"
    }
  }
}
```

### Delete Filter

Delete a filter configuration.

```graphql
mutation DeleteFilter($shop: String!, $id: String!) {
  deleteFilter(shop: $shop, id: $id)
}
```

**Variables:**
```json
{
  "shop": "example-shop.myshopify.com",
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response:**
```json
{
  "data": {
    "deleteFilter": true
  }
}
```

## Examples

### Complete Filter Creation Example

This example creates a comprehensive filter with multiple options:

```graphql
mutation CreateCompleteFilter($shop: String!, $input: CreateFilterInput!) {
  createFilter(shop: $shop, input: $input) {
    id
    title
    status
    createdAt
    options {
      handle
      label
      optionType
      displayType
      selectionType
    }
  }
}
```

**Variables:**
```json
{
  "shop": "example-shop.myshopify.com",
  "input": {
    "title": "Complete Product Filter",
    "description": "Full-featured product filtering",
    "filterType": "custom",
    "targetScope": "all",
    "status": "PUBLISHED",
    "deploymentChannel": "APP",
    "options": [
      {
        "handle": "price",
        "position": 0,
        "label": "Price",
        "optionType": "Price",
        "displayType": "RANGE",
        "selectionType": "RANGE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": false,
        "showCount": true,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Price"
        }
      },
      {
        "handle": "vendor",
        "position": 1,
        "label": "Brand",
        "optionType": "Vendor",
        "displayType": "LIST",
        "selectionType": "MULTIPLE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": true,
        "showCount": true,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Vendor",
          "sortBy": "ASCENDING",
          "textTransform": "CAPITALIZE"
        }
      },
      {
        "handle": "product-type",
        "position": 2,
        "label": "Category",
        "optionType": "Product Type",
        "displayType": "DROPDOWN",
        "selectionType": "SINGLE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": true,
        "showCount": true,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Product Type",
          "sortBy": "ASCENDING"
        }
      },
      {
        "handle": "color",
        "position": 3,
        "label": "Color",
        "optionType": "Color",
        "displayType": "COLOR_SWATCH",
        "selectionType": "MULTIPLE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": false,
        "showCount": true,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Option",
          "variantOptionKey": "color",
          "sortBy": "ASCENDING"
        }
      },
      {
        "handle": "size",
        "position": 4,
        "label": "Size",
        "optionType": "Size",
        "displayType": "CHECKBOX",
        "selectionType": "MULTIPLE",
        "targetScope": "all",
        "allowedOptions": [],
        "collapsed": false,
        "searchable": false,
        "showCount": true,
        "status": "PUBLISHED",
        "optionSettings": {
          "baseOptionType": "Option",
          "variantOptionKey": "size",
          "sortBy": "MANUAL",
          "manualSortedValues": ["XS", "S", "M", "L", "XL", "XXL"]
        }
      }
    ],
    "settings": {
      "defaultView": "grid",
      "filterOrientation": "vertical",
      "displayQuickView": true,
      "displayItemsCount": true,
      "hideOutOfStockItems": false,
      "showFilterCount": true,
      "showActiveFilters": true,
      "showResetButton": true,
      "showClearAllButton": true,
      "productDisplay": {
        "gridColumns": 3,
        "showProductCount": true,
        "showSortOptions": true,
        "defaultSort": "relevance"
      },
      "pagination": {
        "type": "PAGES",
        "itemsPerPage": 24,
        "showPageInfo": true
      }
    },
    "tags": ["main", "products", "storefront"]
  }
}
```

### Filter with Hierarchical Menu

Example of a filter option with hierarchical menu structure:

```json
{
  "handle": "categories",
  "position": 0,
  "label": "Categories",
  "optionType": "Collection",
  "displayType": "LIST",
  "selectionType": "MULTIPLE",
  "targetScope": "all",
  "allowedOptions": [],
  "showMenu": true,
  "status": "PUBLISHED",
  "optionSettings": {
    "baseOptionType": "Collection",
    "menus": [
      "Electronics",
      "Electronics > Phones",
      "Electronics > Phones > Smartphones",
      "Electronics > Computers",
      "Electronics > Computers > Laptops",
      "Clothing",
      "Clothing > Men",
      "Clothing > Men > Shirts"
    ],
    "sortBy": "ASCENDING"
  }
}
```

### Filter with Value Normalization

Example of normalizing variant option values:

```json
{
  "handle": "material",
  "position": 0,
  "label": "Material",
  "optionType": "Material",
  "displayType": "LIST",
  "selectionType": "MULTIPLE",
  "targetScope": "all",
  "allowedOptions": [],
  "status": "PUBLISHED",
  "optionSettings": {
    "baseOptionType": "Option",
    "variantOptionKey": "material",
    "valueNormalization": {
      "cotton": "Cotton",
      "poly": "Polyester",
      "wool": "Wool",
      "silk": "Silk"
    },
    "groupBySimilarValues": true,
    "sortBy": "ASCENDING"
  }
}
```

## Error Handling

All mutations and queries may return errors in the standard GraphQL error format:

```json
{
  "errors": [
    {
      "message": "Filter with id 123 not found for shop example-shop.myshopify.com",
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ]
}
```

Common error scenarios:
- Filter not found (404)
- Invalid shop domain
- Missing required fields
- Invalid enum values
- Validation errors

## Best Practices

1. **Always include `shop` parameter** - Required for all operations
2. **Use proper enum values** - Use the exact enum values (e.g., `PUBLISHED` not `published`)
3. **Handle optionSettings** - Use `optionSettings` for advanced configuration instead of top-level fields
4. **Version tracking** - The `version` field increments on each update
5. **Status management** - Use `status: PUBLISHED` instead of `isActive: true`
6. **Collection references** - Always include `id`, `label`, and `value` for collections
7. **Handle pagination** - For large filter value lists, use pagination settings

## Notes

- The `isActive` field is deprecated. Use `status === "PUBLISHED"` instead.
- Filter options are sorted by `position` field.
- The `shop` field is automatically set from the mutation parameter for security.
- All timestamps are in ISO 8601 format (UTC).

