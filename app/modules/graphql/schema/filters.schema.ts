/**
 * Filters GraphQL Schema
 * Defines GraphQL types and operations for filter configurations
 * 
 * Index Configuration:
 * @index app_filters
 */

export const filtersSchema = `
  # Collection Reference (for filter targeting)
  type CollectionReference {
    label: String!
    value: String!
    id: String!
  }

  # Text Replacement Rule
  type TextReplacement {
    from: String!
    to: String!
  }

  # Filter Option Configuration
  type FilterOption {
    handle: String!                    # Unique identifier for the filter option (e.g., "collection", "product-type")
    position: Int!                     # Display order/position
    optionId: String!                  # Unique ID for this option (previously "uid")
    label: String!                     # Display label (e.g., "Collection", "Product Type")
    optionType: String!                # Type identifier (e.g., "Collection", "Product Type", "Size")
    displayType: String!                # How to display: "list", "dropdown", "grid", "range", "swatch", "color-swatch", "checkbox", "radio", "square"
    selectionType: String!              # Selection mode: "single", "multiple", "range"
    targetScope: String!                # Scope of targeting: "all", "entitled" (previously "targetSelection")
    allowedOptions: [String!]!          # List of allowed option values (previously "entitledOptions")
    
    # Value Selection & Filtering
    baseOptionType: String              # For derived options (e.g., "Color" for "Winter Colors")
    selectedValues: [String!]!          # Specific values to show from base option
    removeSuffix: [String!]!            # Suffixes to remove from display
    replaceText: [TextReplacement!]!    # Replace text patterns
    variantOptionKey: String             # Performance optimization: Pre-computed variant option key (e.g., "color", "size") for faster aggregations
    
    # Value Grouping & Normalization
    valueNormalization: JSON            # Map similar values to one normalized value (Record<string, string>)
    groupBySimilarValues: Boolean!       # Whether to group similar values together
    
    # Display Options
    collapsed: Boolean!                 # Whether option is collapsed by default
    searchable: Boolean!                # Whether option values are searchable
    showTooltip: Boolean!               # Show tooltip
    tooltipContent: String!             # Tooltip text for the option
    showCount: Boolean!                 # Show count badges
    
    # Filtering & Prefixes
    removePrefix: [String!]!            # Prefixes to remove from values
    filterByPrefix: [String!]!          # Prefixes to filter by
    
    # Sorting
    sortBy: String!                     # Sort order: "ascending", "descending", "manual"
    manualSortedValues: [String!]!      # Manually sorted value list
    
    # Advanced
    groups: [String!]!                  # Grouping categories
    menus: [String!]!                  # Menu items/links
    showMenu: Boolean!                  # Whether to show menu
    textTransform: String!              # Text transformation: "none", "uppercase", "lowercase", "capitalize"
    paginationType: String!             # Pagination style: "scroll", "load-more", "pages"
    status: String!                     # Option status: "published", "draft", "disabled"
  }

  # Product Display Settings
  type ProductDisplaySettings {
    gridColumns: Int                    # Number of grid columns
    showProductCount: Boolean           # Show product count
    showSortOptions: Boolean           # Show sort options
    defaultSort: String                 # Default sorting option
  }

  # Pagination Settings
  type PaginationSettings {
    type: String                        # Pagination type: "pages" | "load-more" | "infinite-scroll"
    itemsPerPage: Int                  # Items per page
    showPageInfo: Boolean              # Show "Showing X-Y of Z products"
    pageInfoFormat: String             # Custom format string
  }

  # Filter Display Settings
  type FilterSettings {
    # Legacy fields (kept for backward compatibility)
    displayQuickView: Boolean           # Show quick view option
    displayItemsCount: Boolean          # Show item count badges
    displayVariantInsteadOfProduct: Boolean  # Display variants instead of products
    defaultView: String                 # Default view mode: "grid", "list"
    filterOrientation: String           # Filter panel orientation: "vertical", "horizontal"
    displayCollectionImage: Boolean     # Show collection images
    hideOutOfStockItems: Boolean        # Hide out of stock items
    onLaptop: String                    # Laptop display state: "expanded", "collapsed", "hidden"
    onTablet: String                    # Tablet display state: "expanded", "collapsed", "hidden"
    onMobile: String                    # Mobile display state: "expanded", "collapsed", "hidden"
    
    # New nested structure
    productDisplay: ProductDisplaySettings  # Product display configuration
    pagination: PaginationSettings         # Pagination configuration
    showFilterCount: Boolean               # Show filter count
    showActiveFilters: Boolean             # Show active filters
    showResetButton: Boolean               # Show reset filters button
    showClearAllButton: Boolean            # Show clear all button
  }

  # Filter Configuration
  type Filter {
    id: String!                         # Unique filter ID (UUID)
    shop: String!                       # Shop domain
    title: String!                      # Filter configuration title/name
    description: String                 # Optional description of the filter
    filterType: String!                 # Filter type: "custom", "default" (previously "type")
    targetScope: String!                # Target scope: "all", "entitled" (previously "targetSelection")
    allowedCollections: [CollectionReference!]!  # Collections this filter applies to (previously "entitledCollections")
    options: [FilterOption!]!          # List of filter options
    status: String!                     # Filter status: "published", "draft", "archived" (use this as single source of truth for active state)
    deploymentChannel: String!          # Deployment channel: "app", "theme", "admin" (previously "channel")
    settings: FilterSettings            # Display and behavior settings
    tags: [String!]                     # Tags for categorization/organization
    isActive: Boolean                   # @deprecated Use status === 'published' instead. Kept for backward compatibility only.
    version: Int                        # Version number for optimistic locking (previously "__v")
    updatedAt: String                   # Last update timestamp
    createdAt: String!                 # Creation timestamp
  }

  # Filter List Result
  type FilterListResult {
    filters: [Filter!]!
    total: Int!
  }

  # Create Filter Input
  input CreateFilterInput {
    shop: String              # Optional - will be taken from mutation argument if not provided
    title: String!
    description: String
    filterType: String
    targetScope: String
    allowedCollections: [CollectionReferenceInput!]
    options: [FilterOptionInput!]!
    status: String
    deploymentChannel: String
    settings: FilterSettingsInput
    tags: [String!]
    isActive: Boolean
  }

  # Update Filter Input
  input UpdateFilterInput {
    title: String
    description: String
    filterType: String
    targetScope: String
    allowedCollections: [CollectionReferenceInput!]
    options: [FilterOptionInput!]
    status: String
    deploymentChannel: String
    settings: FilterSettingsInput
    tags: [String!]
    isActive: Boolean
  }

  # Collection Reference Input
  input CollectionReferenceInput {
    label: String!
    value: String!
    id: String!
  }

  # Text Replacement Input
  input TextReplacementInput {
    from: String!
    to: String!
  }

  # Filter Option Input
  input FilterOptionInput {
    handle: String!
    position: Int!
    optionId: String!
    label: String!
    optionType: String!
    displayType: String
    selectionType: String
    targetScope: String
    allowedOptions: [String!]
    
    # Value Selection & Filtering
    baseOptionType: String
    selectedValues: [String!]
    removeSuffix: [String!]
    replaceText: [TextReplacementInput!]
    variantOptionKey: String             # Performance optimization: Pre-computed variant option key (e.g., "color", "size") for faster aggregations
    
    # Value Grouping & Normalization
    valueNormalization: JSON
    groupBySimilarValues: Boolean
    
    # Display Options
    collapsed: Boolean
    searchable: Boolean
    showTooltip: Boolean
    tooltipContent: String
    showCount: Boolean
    
    # Filtering & Prefixes
    removePrefix: [String!]
    filterByPrefix: [String!]
    
    # Sorting
    sortBy: String
    manualSortedValues: [String!]
    
    # Advanced
    groups: [String!]
    menus: [String!]
    showMenu: Boolean
    textTransform: String
    paginationType: String
    status: String
  }

  # Product Display Settings Input
  input ProductDisplaySettingsInput {
    gridColumns: Int
    showProductCount: Boolean
    showSortOptions: Boolean
    defaultSort: String
  }

  # Pagination Settings Input
  input PaginationSettingsInput {
    type: String
    itemsPerPage: Int
    showPageInfo: Boolean
    pageInfoFormat: String
  }

  # Filter Settings Input
  input FilterSettingsInput {
    # Legacy fields (kept for backward compatibility)
    displayQuickView: Boolean
    displayItemsCount: Boolean
    displayVariantInsteadOfProduct: Boolean
    defaultView: String
    filterOrientation: String
    displayCollectionImage: Boolean
    hideOutOfStockItems: Boolean
    onLaptop: String
    onTablet: String
    onMobile: String
    
    # New nested structure
    productDisplay: ProductDisplaySettingsInput
    pagination: PaginationSettingsInput
    showFilterCount: Boolean
    showActiveFilters: Boolean
    showResetButton: Boolean
    showClearAllButton: Boolean
  }

  # Query operations
  type Query {
    # Get filter by ID
    filter(shop: String!, id: String!): Filter
    
    # List all filters for a shop
    filters(shop: String!): FilterListResult!
  }

  # Mutation operations
  type Mutation {
    # Create a new filter configuration
    createFilter(shop: String!, input: CreateFilterInput!): Filter!
    
    # Update an existing filter configuration
    updateFilter(shop: String!, id: String!, input: UpdateFilterInput!): Filter!
    
    # Delete a filter configuration
    deleteFilter(shop: String!, id: String!): Boolean!
  }
`;

