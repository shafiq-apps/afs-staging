/**
 * Filters GraphQL Schema
 * Defines GraphQL types and operations for filter configurations
 * 
 * Index Configuration:
 * @index app_filters
 */

export const filtersSchema = `
  enum DisplayType {
    LIST
    DROPDOWN
    GRID
    RANGE
    SWATCH
    COLOR_SWATCH
    CHECKBOX
    RADIO
    SQUARE
  }

   enum SelectionType {
    SINGLE
    MULTIPLE
    RANGE
  }

  enum SortOrder {
    COUNT
    ASCENDING
    DESCENDING
    MANUAL
  }

  enum FilterOptionStatus {
    PUBLISHED
    UNPUBLISHED
  }

  enum FilterStatus {
    PUBLISHED
    UNPUBLISHED
  }

  enum PaginationType {
    SCROLL
    LOAD_MORE
    PAGES
    INFINITE_SCROLL
  }

  enum TextTransform {
    NONE
    UPPERCASE
    LOWERCASE
    CAPITALIZE
  }

  enum DeploymentChannel {
    APP
    THEME
    ADMIN
  }

  enum BaseOptionType {
    PRICE
    VENDOR
    PRODUCT_TYPE
    TAGS
    COLLECTION
    SKUS
    OPTION
  }

  type CollectionReference {
    label: String!
    value: String!
    id: String!
    gid: String!
  }

  type TextReplacement {
    from: String!
    to: String!
  }

  type FilterOptionSettings {
    baseOptionType: String
    removeSuffix: [String!]
    replaceText: [TextReplacement!]
    variantOptionKey: String
    valueNormalization: JSON
    groupBySimilarValues: Boolean
    removePrefix: [String!]
    filterByPrefix: [String!]
    sortBy: SortOrder
    manualSortedValues: [String!]
    groups: [String!]
    menus: [String!]
    textTransform: TextTransform
    paginationType: PaginationType
  }

  type FilterOption {
    handle: String!
    position: Int!
    label: String!
    optionType: String!
    displayType: DisplayType!
    selectionType: SelectionType!
    allowedOptions: [String!]!
    collapsed: Boolean!
    searchable: Boolean!
    showTooltip: Boolean!
    tooltipContent: String!
    showCount: Boolean!
    showMenu: Boolean!
    status: FilterOptionStatus!
    optionSettings: FilterOptionSettings
  }

  type ProductDisplaySettings {
    gridColumns: Int
    showProductCount: Boolean
    showSortOptions: Boolean
    defaultSort: String
  }

  type PaginationSettings {
    type: PaginationType
    itemsPerPage: Int
    showPageInfo: Boolean
    pageInfoFormat: String
  }

  type FilterSettings {
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
    productDisplay: ProductDisplaySettings
    pagination: PaginationSettings
    showFilterCount: Boolean
    showActiveFilters: Boolean
    showResetButton: Boolean
    showClearAllButton: Boolean
  }

  type Filter {
    id: String!
    shop: String!
    title: String!
    description: String
    filterType: String!
    targetScope: String!
    allowedCollections: [CollectionReference!]!
    options: [FilterOption!]!
    status: FilterStatus!
    deploymentChannel: DeploymentChannel!
    settings: FilterSettings
    tags: [String!]
    isActive: Boolean
    version: Int
    updatedAt: String
    createdAt: String!
  }

  type FilterListResult {
    filters: [Filter!]!
    total: Int!
  }

  input CollectionReferenceInput {
    label: String!
    value: String!
    id: String!
    gid: String!
  }

  input TextReplacementInput {
    from: String!
    to: String!
  }

  input FilterOptionSettingsInput {
    baseOptionType: String
    removeSuffix: [String!]
    replaceText: [TextReplacementInput!]
    variantOptionKey: String
    valueNormalization: JSON
    groupBySimilarValues: Boolean
    removePrefix: [String!]
    filterByPrefix: [String!]
    sortBy: SortOrder
    manualSortedValues: [String!]
    groups: [String!]
    menus: [String!]
    textTransform: TextTransform
    paginationType: PaginationType
  }

  input FilterOptionInput {
    handle: String!
    position: Int!
    label: String!
    optionType: String!
    displayType: DisplayType
    selectionType: SelectionType
    allowedOptions: [String!]
    collapsed: Boolean
    searchable: Boolean
    showTooltip: Boolean
    tooltipContent: String
    showCount: Boolean
    showMenu: Boolean
    status: FilterOptionStatus
    optionSettings: FilterOptionSettingsInput
  }

  input ProductDisplaySettingsInput {
    gridColumns: Int
    showProductCount: Boolean
    showSortOptions: Boolean
    defaultSort: String
  }

  input PaginationSettingsInput {
    type: PaginationType
    itemsPerPage: Int
    showPageInfo: Boolean
    pageInfoFormat: String
  }

  input FilterSettingsInput {
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
    productDisplay: ProductDisplaySettingsInput
    pagination: PaginationSettingsInput
    showFilterCount: Boolean
    showActiveFilters: Boolean
    showResetButton: Boolean
    showClearAllButton: Boolean
  }

  input CreateFilterInput {
    shop: String
    title: String!
    description: String
    filterType: String
    targetScope: String
    allowedCollections: [CollectionReferenceInput!]
    options: [FilterOptionInput!]!
    status: FilterStatus
    deploymentChannel: DeploymentChannel
    settings: FilterSettingsInput
    tags: [String!]
    isActive: Boolean
  }

  type Query {
    filter(shop: String!, id: String!): Filter
    filters(shop: String!): FilterListResult!
  }

  type Mutation {
    createFilter(shop: String!, input: CreateFilterInput!): Filter!
    updateFilter(shop: String!, id: String!, input: CreateFilterInput!): Filter!
    deleteFilter(shop: String!, id: String!): Boolean!
  }
`;

