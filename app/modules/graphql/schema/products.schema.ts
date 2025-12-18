/**
 * Products GraphQL Schema
 * Defines GraphQL types and operations for product data
 * 
 * This schema is based on products.type.ts and provides:
 * - Product queries with filters
 * - Aggregations for filters (vendors, productTypes, tags, collections, options, price ranges, SKUs)
 */

export const productsSchema = `
  # Product Option
  type ProductOption {
    id: String
    name: String
    values: [String!]!
  }

  # Product Variant Option
  type ProductVariantOption {
    name: String
    value: String
  }

  # Product Variant
  type ProductVariant {
    id: String
    title: String
    displayName: String
    sku: String
    barcode: String
    price: String
    compareAtPrice: String
    availableForSale: Boolean
    inventoryQuantity: Int
    position: Int
    sellableOnlineQuantity: Int
    taxable: Boolean
    createdAt: String
    selectedOptions: [ProductVariantOption!]
    options: [ProductVariantOption!]!
    optionPairs: [String!]!
    optionKey: String
  }

  # Product Metafield
  type ProductMetafield {
    id: String
    namespace: String
    key: String
    value: String
    type: String
  }

  # Product Category
  type ProductCategory {
    name: String
  }

  # Product Media Image
  type ProductMediaImage {
    url: String
    altText: String
    thumbhash: String
  }

  # Product Media
  type ProductMedia {
    id: String
    alt: String
    preview: ProductMediaPreview
    status: String
  }

  type ProductMediaPreview {
    image: ProductMediaImage
  }

  # Product Price Money
  type ProductPriceMoney {
    amount: String
    currencyCode: String
  }

  # Product Price Range
  type ProductPriceRangeV2 {
    maxVariantPrice: ProductPriceMoney
    minVariantPrice: ProductPriceMoney
  }

  # Product Variants Count
  type ProductVariantsCount {
    count: Int
    precision: String
  }

  type Product {
    id: String!
    productId: String
    title: String
    handle: String
    status: String
    tags: [String!]!
    productType: String
    vendor: String
    category: ProductCategory
    createdAt: String
    updatedAt: String
    publishedAt: String
    templateSuffix: String
    totalInventory: Int
    variantsCount: ProductVariantsCount
    priceRangeV2: ProductPriceRangeV2
    options: [ProductOption!]!
    collections: [String!]!
    skus: [String!]
    collectionSortOrder: JSON
    bestSellerRank: Int
    variants: [ProductVariant!]!
    metafields: [ProductMetafield!]!
    media: [ProductMedia!]
    imageUrl: String
    imagesUrls: [String!]!
    optionPairs: [String!]!
    variantOptionKeys: [String!]!
    documentType: String
    minPrice: Float
    maxPrice: Float
  }

  # Facet Value (for aggregations)
  type FacetValue {
    value: String!
    count: Int!
  }

  # Product Filters (aggregations)
  type ProductFilters {
    vendors: [FacetValue!]!
    productTypes: [FacetValue!]!
    tags: [FacetValue!]!
    collections: [FacetValue!]!
    skus: [FacetValue!]!
    options: JSON! # Record<string, FacetValue[]>
    # Backward compatibility: some clients query `priceRange` instead of `price`
    priceRange: PriceRange
    price: PriceRange
  }

  # Price Range
  type PriceRange {
    min: Float!
    max: Float!
  }

  # Product Filter Input
  input ProductFilterInput {
    vendors: [String!]
    productTypes: [String!]
    tags: [String!]
    collections: [String!]
    skus: [String!]
    options: JSON
    search: String
    variantOptionKeys: [String!]
    priceMin: Float
    priceMax: Float
    variantSkus: [String!]
  }

  # Product Search Input
  input ProductSearchInput {
    vendors: [String!]
    productTypes: [String!]
    tags: [String!]
    collections: [String!]
    skus: [String!]
    options: JSON
    search: String
    variantOptionKeys: [String!]
    priceMin: Float
    priceMax: Float
    variantSkus: [String!]
    cursor: String  # Base64-encoded offset for pagination. Use nextCursor from previous response to get next page.
    limit: Int      # Number of products per page (default: 20, max: 500)
    sort: String    # Sort field and order (e.g., "createdAt:desc" or "price:asc")
    includeFilters: Boolean  # Include filter aggregations in response
    fields: String  # Comma-separated list of fields to return (optional, all fields returned by default)
  }

  # Product Search Result
  type Products {
    products: [Product!]!      # Array of products for current page
    total: Int!                # Total number of products matching the filters
    nextCursor: String         # Cursor for next page (base64-encoded offset). Pass this as 'cursor' in next query to get next page.
    hasNextPage: Boolean!      # Whether there are more products available
    prevCursor: String         # Cursor for previous page. Pass this as 'cursor' in next query to get previous page.
    filters: ProductFilters    # Filter aggregations (only included if includeFilters=true)
  }

  # Query operations
  type Query {
    # Get product by ID
    product(shop: String!, id: String!): Product
    
    # Get products with filters and cursor-based pagination
    # 
    # Pagination Example:
    # 1. First page: query { products(shop: "shop.myshopify.com", filters: { limit: 20 }) { ... } }
    # 2. Next page: query { products(shop: "shop.myshopify.com", filters: { limit: 20, cursor: "nextCursorValue" }) { ... } }
    # 3. Previous page: query { products(shop: "shop.myshopify.com", filters: { limit: 20, cursor: "prevCursorValue" }) { ... } }
    #
    # The cursor is a base64-encoded offset value. Use nextCursor from the response to get the next page.
    # Maximum limit is 500 products per query.
    products(shop: String!, filters: ProductSearchInput): Products!
    
    # Get storefront filters (aggregations/facets) for products
    # Returns the same data as the REST endpoint: GET /storefront/filters?shop={shop}
    # Accepts optional filter parameters to get filtered aggregations
    # Example: query { storefrontFilters(shop: "shop.myshopify.com", filters: { vendors: ["Nike"] }) { vendors { value count } } }
    storefrontFilters(shop: String!, filters: ProductFilterInput): ProductFilters!
  }
`;

