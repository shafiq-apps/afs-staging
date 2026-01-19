# GraphQL Queries & Mutations - Sample Examples

This document contains sample GraphQL queries and mutations for all available schemas in the application.

## Table of Contents

1. [Shops Schema](#shops-schema)
2. [Products Schema](#products-schema)
3. [Filters Schema](#filters-schema)

---

## Shops Schema

### Queries

#### 1. Get Shop by Domain

**Query:**
```graphql
query GetShop($domain: String!) {
  shop(domain: $domain) {
    shop
    installedAt
    isActive
    scopes
    lastAccessed
    updatedAt
    metadata {
      shopId
      currencyCode
      email
    }
    locals {
      ip
      userAgent
    }
  }
}
```

**Variables:**
```json
{
  "domain": "example.myshopify.com"
}
```

**Response:**
```json
{
  "data": {
    "shop": {
      "shop": "example.myshopify.com",
      "installedAt": "2025-01-15T10:30:00Z",
      "isActive": true,
      "scopes": ["read_products", "write_products"],
      "lastAccessed": "2025-11-27T09:00:00Z",
      "updatedAt": "2025-11-27T09:00:00Z",
      "metadata": {
        "shopId": "12345678",
        "currencyCode": "USD",
        "email": "merchant@example.com"
      },
      "locals": {
        "ip": "192.168.1.1",
        "userAgent": "Mozilla/5.0..."
      }
    }
  }
}
```

#### 2. Check if Shop Exists

**Query:**
```graphql
query CheckShopExists($domain: String!) {
  shopExists(domain: $domain)
}
```

**Variables:**
```json
{
  "domain": "example.myshopify.com"
}
```

**Response:**
```json
{
  "data": {
    "shopExists": true
  }
}
```

### Mutations

#### 3. Create Shop

**Mutation:**
```graphql
mutation CreateShop($input: CreateShopInput!) {
  createShop(input: $input) {
    shop
    installedAt
    isActive
    scopes
    metadata {
      shopId
      currencyCode
      email
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "shop": "example.myshopify.com",
    "accessToken": "shpat_xxxxxxxxxxxxx",
    "refreshToken": "refresh_xxxxxxxxxxxxx",
    "installedAt": "2025-01-15T10:30:00Z",
    "isActive": true,
    "scopes": ["read_products", "write_products"],
    "metadata": {
      "shopId": "12345678",
      "currencyCode": "USD",
      "email": "merchant@example.com"
    },
    "locals": {
      "ip": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "createShop": {
      "shop": "example.myshopify.com",
      "installedAt": "2025-01-15T10:30:00Z",
      "isActive": true,
      "scopes": ["read_products", "write_products"],
      "metadata": {
        "shopId": "12345678",
        "currencyCode": "USD",
        "email": "merchant@example.com"
      }
    }
  }
}
```

#### 4. Update Shop

**Mutation:**
```graphql
mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
  updateShop(domain: $domain, input: $input) {
    shop
    isActive
    lastAccessed
    updatedAt
    metadata {
      shopId
      currencyCode
      email
    }
  }
}
```

**Variables:**
```json
{
  "domain": "example.myshopify.com",
  "input": {
    "isActive": false,
    "lastAccessed": "2025-11-27T10:00:00Z",
    "metadata": {
      "shopId": "12345678",
      "currencyCode": "EUR",
      "email": "newemail@example.com"
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "updateShop": {
      "shop": "example.myshopify.com",
      "isActive": false,
      "lastAccessed": "2025-11-27T10:00:00Z",
      "updatedAt": "2025-11-27T10:00:00Z",
      "metadata": {
        "shopId": "12345678",
        "currencyCode": "EUR",
        "email": "newemail@example.com"
      }
    }
  }
}
```

#### 5. Delete Shop

**Mutation:**
```graphql
mutation DeleteShop($domain: String!) {
  deleteShop(domain: $domain)
}
```

**Variables:**
```json
{
  "domain": "example.myshopify.com"
}
```

**Response:**
```json
{
  "data": {
    "deleteShop": true
  }
}
```

#### 6. Get Indexing Status

**Query:**
```graphql
query GetIndexingStatus($shop: String!) {
  indexingStatus(shop: $shop) {
    shop
    status
    startedAt
    completedAt
    totalLines
    totalIndexed
    totalFailed
    progress
    failedItems {
      id
      line
      error
      retryCount
    }
    error
    lastShopifyUpdatedAt
    indexExists
    lastUpdatedAt
    duration
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com"
}
```

**Response (In Progress):**
```json
{
  "data": {
    "indexingStatus": {
      "shop": "example.myshopify.com",
      "status": "in_progress",
      "startedAt": "2025-11-28T12:00:00.000Z",
      "completedAt": null,
      "totalLines": 5000,
      "totalIndexed": 2500,
      "totalFailed": 5,
      "progress": 50,
      "failedItems": [
        {
          "id": "gid://shopify/Product/123",
          "line": 1234,
          "error": "Validation error",
          "retryCount": 1
        }
      ],
      "error": null,
      "lastShopifyUpdatedAt": "2025-11-28T11:00:00.000Z",
      "indexExists": true,
      "lastUpdatedAt": "2025-11-28T12:15:00.000Z",
      "duration": null
    }
  }
}
```

**Response (Completed):**
```json
{
  "data": {
    "indexingStatus": {
      "shop": "example.myshopify.com",
      "status": "success",
      "startedAt": "2025-11-28T12:00:00.000Z",
      "completedAt": "2025-11-28T12:30:00.000Z",
      "totalLines": 5000,
      "totalIndexed": 4995,
      "totalFailed": 5,
      "progress": 100,
      "failedItems": [
        {
          "id": "gid://shopify/Product/123",
          "line": 1234,
          "error": "Validation error",
          "retryCount": 3
        }
      ],
      "error": null,
      "lastShopifyUpdatedAt": "2025-11-28T11:00:00.000Z",
      "indexExists": true,
      "lastUpdatedAt": "2025-11-28T12:30:00.000Z",
      "duration": 1800000
    }
  }
}
```

**Response (Failed):**
```json
{
  "data": {
    "indexingStatus": {
      "shop": "example.myshopify.com",
      "status": "failed",
      "startedAt": "2025-11-28T12:00:00.000Z",
      "completedAt": "2025-11-28T12:10:00.000Z",
      "totalLines": 5000,
      "totalIndexed": 1000,
      "totalFailed": 50,
      "progress": 20,
      "failedItems": [...],
      "error": "Bulk operation failed: Connection timeout",
      "lastShopifyUpdatedAt": "2025-11-28T11:00:00.000Z",
      "indexExists": true,
      "lastUpdatedAt": "2025-11-28T12:10:00.000Z",
      "duration": 600000
    }
  }
}
```

**Response (Not Started):**
```json
{
  "data": {
    "indexingStatus": {
      "shop": "example.myshopify.com",
      "status": "not_started",
      "startedAt": null,
      "completedAt": null,
      "totalLines": null,
      "totalIndexed": 0,
      "totalFailed": 0,
      "progress": 0,
      "failedItems": [],
      "error": null,
      "lastShopifyUpdatedAt": null,
      "indexExists": false,
      "lastUpdatedAt": null,
      "duration": null
    }
  }
}
```

**Note:** 
- This query returns the current indexing status from Elasticsearch checkpoints
- Status can be: `"in_progress"`, `"success"`, `"failed"`, or `"not_started"`
- Progress is calculated as a percentage (0-100)
- Duration is in milliseconds (null if indexing hasn't completed)
- Failed items include details about products that failed to index

#### 7. Reindex Products

**Mutation:**
```graphql
mutation ReindexProducts($shop: String!) {
  reindexProducts(shop: $shop) {
    success
    message
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com"
}
```

**Response:**
```json
{
  "data": {
    "reindexProducts": {
      "success": true,
      "message": "Indexing started"
    }
  }
}
```

**Error Response (Shop not found):**
```json
{
  "data": {
    "reindexProducts": {
      "success": false,
      "message": "Shop not found: example.myshopify.com"
    }
  }
}
```

**Error Response (Shop missing access token):**
```json
{
  "data": {
    "reindexProducts": {
      "success": false,
      "message": "Shop missing access token: example.myshopify.com"
    }
  }
}
```

**Error Response (Shop not active):**
```json
{
  "data": {
    "reindexProducts": {
      "success": false,
      "message": "Shop is not active: example.myshopify.com"
    }
  }
}
```

**Note:** 
- This mutation triggers bulk indexing of products from Shopify to Elasticsearch
- The mutation returns immediately with a success status while indexing runs in the background
- The indexing process is asynchronous and may take some time depending on the number of products
- This is equivalent to the REST endpoint: `POST /indexing/reindex?shop={shop}`

---

## Products Schema

### Queries

#### 1. Get Product by ID

**Query:**
```graphql
query GetProduct($shop: String!, $id: String!) {
  product(shop: $shop, id: $id) {
    id
    productId
    title
    handle
    status
    tags
    productType
    vendor
    category {
      name
    }
    createdAt
    updatedAt
    publishedAt
    totalInventory
    bestSellerRank
    minPrice
    maxPrice
    imageUrl
    imagesUrls
    options {
      id
      name
      values
    }
    variants {
      id
      title
      sku
      price
      availableForSale
      inventoryQuantity
    }
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "id": "gid://shopify/Product/123456789"
}
```

**Response:**
```json
{
  "data": {
    "product": {
      "id": "gid://shopify/Product/123456789",
      "productId": "123456789",
      "title": "Example Product",
      "handle": "example-product",
      "status": "ACTIVE",
      "tags": ["tag1", "tag2"],
      "productType": "Clothing",
      "vendor": "Example Vendor",
      "bestSellerRank": 5,
      "minPrice": 29.99,
      "maxPrice": 49.99,
      "imageUrl": "https://cdn.shopify.com/...",
      "variants": [
        {
          "id": "gid://shopify/ProductVariant/987654321",
          "title": "Small / Red",
          "sku": "PROD-001-S-RED",
          "price": "29.99",
          "availableForSale": true,
          "inventoryQuantity": 100
        }
      ]
    }
  }
}
```

#### 2. Get Products (First Page - Cursor Pagination)

**Query:**
```graphql
query GetProducts($shop: String!, $filters: ProductSearchInput) {
  products(shop: $shop, filters: $filters) {
    products {
      id
      title
      vendor
      productType
      minPrice
      maxPrice
      bestSellerRank
      imageUrl
      status
    }
    total
    nextCursor
    hasNextPage
    prevCursor
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "limit": 20
  }
}
```

**Response:**
```json
{
  "data": {
    "products": {
      "products": [
        {
          "id": "gid://shopify/Product/123456789",
          "title": "Product 1",
          "vendor": "Vendor A",
          "productType": "Type A",
          "minPrice": 29.99,
          "maxPrice": 49.99,
          "bestSellerRank": 1,
          "imageUrl": "https://cdn.shopify.com/...",
          "status": "ACTIVE"
        }
      ],
      "total": 150,
      "nextCursor": "MjA=",
      "hasNextPage": true,
      "prevCursor": null
    }
  }
}
```

#### 3. Get Products with Filters and Pagination (Next Page)

**Query:**
```graphql
query GetProductsNextPage($shop: String!, $filters: ProductSearchInput) {
  products(shop: $shop, filters: $filters) {
    products {
      id
      title
      vendor
      productType
      minPrice
      maxPrice
      bestSellerRank
      imageUrl
    }
    total
    nextCursor
    hasNextPage
    prevCursor
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "limit": 20,
    "cursor": "MjA="
  }
}
```

**Response:**
```json
{
  "data": {
    "products": {
      "products": [...],
      "total": 150,
      "nextCursor": "NDA=",
      "hasNextPage": true,
      "prevCursor": "MA=="
    }
  }
}
```

#### 4. Get Products with Search and Filters

**Query:**
```graphql
query SearchProducts($shop: String!, $filters: ProductSearchInput) {
  products(shop: $shop, filters: $filters) {
    products {
      id
      title
      vendor
      productType
      tags
      minPrice
      maxPrice
      bestSellerRank
      imageUrl
    }
    total
    nextCursor
    hasNextPage
    prevCursor
    filters {
      vendors {
        value
        count
      }
      productTypes {
        value
        count
      }
      tags {
        value
        count
      }
      collections {
        value
        count
      }
      priceRange {
        min
        max
      }
    }
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "search": "jacket",
    "vendors": ["Vendor A", "Vendor B"],
    "productTypes": ["Clothing"],
    "tags": ["winter", "sale"],
    "priceMin": 20,
    "priceMax": 100,
    "limit": 20,
    "includeFilters": true
  }
}
```

**Response:**
```json
{
  "data": {
    "products": {
      "products": [...],
      "total": 45,
      "nextCursor": "MjA=",
      "hasNextPage": true,
      "prevCursor": null,
      "filters": {
        "vendors": [
          { "value": "Vendor A", "count": 25 },
          { "value": "Vendor B", "count": 20 }
        ],
        "productTypes": [
          { "value": "Clothing", "count": 45 }
        ],
        "tags": [
          { "value": "winter", "count": 30 },
          { "value": "sale", "count": 15 }
        ],
        "collections": [...],
        "priceRange": {
          "min": 19.99,
          "max": 99.99
        }
      }
    }
  }
}
```

#### 5. Get Products with Option Filters

**Query:**
```graphql
query GetProductsWithOptions($shop: String!, $filters: ProductSearchInput) {
  products(shop: $shop, filters: $filters) {
    products {
      id
      title
      options {
        name
        values
      }
      variants {
        id
        title
        selectedOptions {
          name
          value
        }
        price
      }
    }
    total
    nextCursor
    hasNextPage
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "options": {
      "Color": ["Red", "Blue"],
      "Size": ["M", "L"]
    },
    "limit": 20
  }
}
```

**Response:**
```json
{
  "data": {
    "products": {
      "products": [
        {
          "id": "gid://shopify/Product/123456789",
          "title": "Example Product",
          "options": [
            {
              "name": "Color",
              "values": ["Red", "Blue", "Green"]
            },
            {
              "name": "Size",
              "values": ["S", "M", "L", "XL"]
            }
          ],
          "variants": [
            {
              "id": "gid://shopify/ProductVariant/987654321",
              "title": "Red / M",
              "selectedOptions": [
                { "name": "Color", "value": "Red" },
                { "name": "Size", "value": "M" }
              ],
              "price": "29.99"
            }
          ]
        }
      ],
      "total": 10,
      "nextCursor": null,
      "hasNextPage": false
    }
  }
}
```

#### 6. Get Products with Sorting

**Query:**
```graphql
query GetProductsSorted($shop: String!, $filters: ProductSearchInput) {
  products(shop: $shop, filters: $filters) {
    products {
      id
      title
      minPrice
      maxPrice
      bestSellerRank
      createdAt
    }
    total
    nextCursor
    hasNextPage
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "sort": "price:asc",
    "limit": 20
  }
}
```

**Available Sort Options:**
- `"price:asc"` - Price ascending
- `"price:desc"` - Price descending
- `"createdAt:desc"` - Newest first (default)
- `"createdAt:asc"` - Oldest first
- `"bestSellerRank:asc"` - Best selling first

#### 7. Get Storefront Filters (Aggregations)

**Query:**
```graphql
query GetStorefrontFilters($shop: String!, $filters: ProductFilterInput) {
  storefrontFilters(shop: $shop, filters: $filters) {
    vendors {
      value
      count
    }
    productTypes {
      value
      count
    }
    tags {
      value
      count
    }
    collections {
      value
      count
    }
    options
    priceRange {
      min
      max
    }
  }
}
```

**Variables (No filters - get all aggregations):**
```json
{
  "shop": "example.myshopify.com"
}
```

**Variables (With filters - get filtered aggregations):**
```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "vendors": ["Nike"],
    "productTypes": ["Jacket"]
  }
}
```

**Response:**
```json
{
  "data": {
    "storefrontFilters": {
      "vendors": [
        { "value": "digitalcoo-filter-demo-10", "count": 49 }
      ],
      "productTypes": [
        { "value": "watches", "count": 16 },
        { "value": "Watches", "count": 1 }
      ],
      "tags": [
        { "value": "jacket", "count": 24 },
        { "value": "coat", "count": 18 },
        { "value": "leather", "count": 8 }
      ],
      "collections": [
        { "value": "174251016285", "count": 49 },
        { "value": "306458427485", "count": 49 }
      ],
      "options": {
        "Size": [
          { "value": "M", "count": 26 },
          { "value": "L", "count": 22 },
          { "value": "S", "count": 19 }
        ],
        "Color": [
          { "value": "Black", "count": 17 },
          { "value": "black", "count": 10 },
          { "value": "White", "count": 6 }
        ]
      },
      "priceRange": {
        "min": 0.02,
        "max": 23998
      }
    }
  }
}
```

**Note:** This query returns the same data as the REST endpoint `GET /storefront/filters?shop={shop}`. It's useful for getting filter aggregations without fetching products.

---

## Filters Schema

### Queries

#### 1. Get Filter by ID

**Query:**
```graphql
query GetFilter($shop: String!, $id: String!) {
  filter(shop: $shop, id: $id) {
    id
    shop
    title
    description
    filterType
    targetScope
    status
    deploymentChannel
    isActive
    version
    createdAt
    updatedAt
    allowedCollections {
      label
      value
      id
    }
    options {
      handle
      position
      optionId
      label
      optionType
      displayType
      selectionType
      targetScope
      
      # Value Selection & Filtering
      baseOptionType
      selectedValues
      removeSuffix
      replaceText {
        from
        to
      }
      
      # Value Grouping & Normalization
      valueNormalization
      groupBySimilarValues
      
      # Display Options
      collapsed
      searchable
      showTooltip
      tooltipContent
      showCount
      
      # Filtering & Prefixes
      removePrefix
      filterByPrefix
      
      # Sorting
      sortBy
      manualSortedValues
      
      # Advanced
      groups
      menus
      showMenu
      textTransform
      paginationType
      status
    }
    settings {
      # Legacy fields
      displayQuickView
      displayItemsCount
      defaultView
      filterOrientation
      hideOutOfStockItems
      
      # New nested structure
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
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2"
}
```

**Response:**
```json
{
  "data": {
    "filter": {
      "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2",
      "shop": "example.myshopify.com",
      "title": "Main Product Filters",
      "description": "Primary filter configuration for product listing",
      "filterType": "custom",
      "targetScope": "all",
      "status": "published",
      "deploymentChannel": "app",
      "isActive": true,
      "version": 2,
      "createdAt": "2025-10-27T09:06:52.576Z",
      "updatedAt": "2025-11-27T10:00:00.000Z",
      "allowedCollections": [
        {
          "label": "Dresses",
          "value": "dresses",
          "id": "#158110974018"
        }
      ],
      "options": [
        {
          "handle": "collection",
          "position": 0,
          "optionId": "6f30",
          "label": "Collection",
          "optionType": "Collection##6f30",
          "displayType": "list",
          "selectionType": "multiple",
          "targetScope": "all",
          "baseOptionType": null,
          "selectedValues": [],
          "removeSuffix": [],
          "replaceText": [],
          "valueNormalization": null,
          "groupBySimilarValues": false,
          "collapsed": false,
          "searchable": true,
          "showTooltip": false,
          "tooltipContent": "",
          "showCount": true,
          "removePrefix": [],
          "filterByPrefix": [],
          "sortBy": "ascending",
          "manualSortedValues": [],
          "groups": [],
          "menus": [],
          "showMenu": false,
          "textTransform": "none",
          "paginationType": "scroll",
          "status": "published"
        }
      ],
      "settings": {
        "displayQuickView": true,
        "displayItemsCount": true,
        "defaultView": "grid",
        "filterOrientation": "vertical",
        "hideOutOfStockItems": false,
        "productDisplay": {
          "gridColumns": 4,
          "showProductCount": true,
          "showSortOptions": true,
          "defaultSort": "createdAt:desc"
        },
        "pagination": {
          "type": "pages",
          "itemsPerPage": 20,
          "showPageInfo": true,
          "pageInfoFormat": "Showing {start}-{end} of {total} products"
        },
        "showFilterCount": true,
        "showActiveFilters": true,
        "showResetButton": true,
        "showClearAllButton": true
      },
      "tags": ["main", "product-listing"]
    }
  }
}
```

#### 2. List All Filters

**Query:**
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
  "shop": "example.myshopify.com"
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
          "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2",
          "title": "Main Product Filters",
          "description": "Primary filter configuration",
          "filterType": "custom",
          "status": "published",
          "deploymentChannel": "app",
          "isActive": true,
          "createdAt": "2025-10-27T09:06:52.576Z",
          "updatedAt": "2025-11-27T10:00:00.000Z",
          "tags": ["main", "product-listing"]
        },
        {
          "id": "553ae9a1-ef2c-4f63-a621-e2438f0701ff",
          "title": "Testing",
          "filterType": "custom",
          "status": "published",
          "deploymentChannel": "app",
          "isActive": true,
          "createdAt": "2025-10-17T18:05:49.280Z",
          "updatedAt": "2025-11-11T08:46:18.915Z",
          "tags": []
        }
      ]
    }
  }
}
```

### Mutations

#### 3. Create Filter

**Mutation:**
```graphql
mutation CreateFilter($shop: String!, $input: CreateFilterInput!) {
  createFilter(shop: $shop, input: $input) {
    id
    title
    description
    filterType
    targetScope
    status
    deploymentChannel
    isActive
    createdAt
    options {
      handle
      label
      position
      displayType
      showCount
    }
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "input": {
    "title": "New Filter Configuration",
    "description": "Custom filter setup for product search",
    "filterType": "custom",
    "targetScope": "all",
    "status": "published",
    "deploymentChannel": "app",
    "isActive": true,
    "tags": ["custom", "search"],
    "allowedCollections": [
      {
        "label": "Featured",
        "value": "featured",
        "id": "#123456789"
      }
    ],
    "options": [
      {
        "handle": "collection",
        "position": 0,
        "optionId": "7a42",
        "label": "Collection",
        "optionType": "Collection##7a42",
        "displayType": "list",
        "selectionType": "multiple",
        "targetScope": "all",
        "collapsed": false,
        "searchable": true,
        "showTooltip": false,
        "showCount": true,
        "sortBy": "ascending",
        "status": "published"
      },
      {
        "handle": "color",
        "position": 1,
        "optionId": "8b53",
        "label": "Color",
        "optionType": "Color##8b53",
        "displayType": "color-swatch",
        "selectionType": "multiple",
        "targetScope": "all",
        "baseOptionType": null,
        "selectedValues": [],
        "removeSuffix": [],
        "replaceText": [],
        "valueNormalization": {
          "red": "Red",
          "Red": "Red",
          "RED": "Red"
        },
        "groupBySimilarValues": true,
        "collapsed": false,
        "searchable": false,
        "showTooltip": true,
        "tooltipContent": "Select a color",
        "showCount": true,
        "sortBy": "manual",
        "manualSortedValues": ["Red", "Blue", "Green", "Black", "White"],
        "status": "published"
      },
      {
        "handle": "winter-colors",
        "position": 2,
        "optionId": "9c64",
        "label": "Winter Colors",
        "optionType": "Color##9c64",
        "displayType": "swatch",
        "selectionType": "multiple",
        "targetScope": "all",
        "baseOptionType": "Color",
        "selectedValues": ["Red", "Yellow", "Pink", "Dark Green"],
        "removeSuffix": [],
        "replaceText": [
          { "from": "Dark Green", "to": "Forest Green" }
        ],
        "valueNormalization": null,
        "groupBySimilarValues": false,
        "collapsed": false,
        "searchable": false,
        "showTooltip": true,
        "tooltipContent": "Winter color selection",
        "showCount": true,
        "sortBy": "ascending",
        "status": "published"
      },
      {
        "handle": "size",
        "position": 3,
        "optionId": "ad75",
        "label": "Size",
        "optionType": "Size##ad75",
        "displayType": "checkbox",
        "selectionType": "multiple",
        "targetScope": "all",
        "removePrefix": ["Size "],
        "removeSuffix": [" (US)"],
        "replaceText": [
          { "from": "XS", "to": "Extra Small" },
          { "from": "XL", "to": "Extra Large" }
        ],
        "collapsed": false,
        "searchable": true,
        "showCount": true,
        "sortBy": "manual",
        "manualSortedValues": ["XS", "S", "M", "L", "XL", "XXL"],
        "status": "published"
      }
    ],
    "settings": {
      "displayQuickView": true,
      "displayItemsCount": true,
      "displayVariantInsteadOfProduct": false,
      "defaultView": "grid",
      "filterOrientation": "vertical",
      "displayCollectionImage": false,
      "hideOutOfStockItems": false,
      "onLaptop": "expanded",
      "onTablet": "expanded",
      "onMobile": "expanded",
      "productDisplay": {
        "gridColumns": 4,
        "showProductCount": true,
        "showSortOptions": true,
        "defaultSort": "createdAt:desc"
      },
      "pagination": {
        "type": "pages",
        "itemsPerPage": 20,
        "showPageInfo": true,
        "pageInfoFormat": "Showing {start}-{end} of {total} products"
      },
      "showFilterCount": true,
      "showActiveFilters": true,
      "showResetButton": true,
      "showClearAllButton": true
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "createFilter": {
      "id": "new-uuid-here",
      "title": "New Filter Configuration",
      "description": "Custom filter setup for product search",
      "filterType": "custom",
      "targetScope": "all",
      "status": "published",
      "deploymentChannel": "app",
      "isActive": true,
      "createdAt": "2025-11-27T10:30:00.000Z",
      "options": [
        {
          "handle": "collection",
          "label": "Collection",
          "position": 0
        },
        {
          "handle": "product-type",
          "label": "Product Type",
          "position": 1
        },
        {
          "handle": "price",
          "label": "Price",
          "position": 2
        }
      ]
    }
  }
}
```

#### 4. Update Filter

**Mutation:**
```graphql
mutation UpdateFilter($shop: String!, $id: String!, $input: UpdateFilterInput!) {
  updateFilter(shop: $shop, id: $id, input: $input) {
    id
    title
    description
    isActive
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
      productDisplay {
        gridColumns
        defaultSort
      }
      pagination {
        type
        itemsPerPage
      }
      showResetButton
      showClearAllButton
    }
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2",
  "input": {
    "title": "Updated Filter Title",
    "description": "Updated description",
    "isActive": false,
    "status": "draft",
    "tags": ["updated", "draft"],
    "settings": {
      "defaultView": "list",
      "filterOrientation": "horizontal",
      "productDisplay": {
        "gridColumns": 3,
        "defaultSort": "price:asc"
      },
      "pagination": {
        "type": "load-more",
        "itemsPerPage": 24
      },
      "showResetButton": true,
      "showClearAllButton": true
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "updateFilter": {
      "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2",
      "title": "Updated Filter Title",
      "description": "Updated description",
      "isActive": false,
      "status": "draft",
      "version": 3,
      "updatedAt": "2025-11-27T11:00:00.000Z",
      "options": [...],
      "settings": {
        "defaultView": "list",
        "filterOrientation": "horizontal",
        "productDisplay": {
          "gridColumns": 3,
          "defaultSort": "price:asc"
        },
        "pagination": {
          "type": "load-more",
          "itemsPerPage": 24
        },
        "showResetButton": true,
        "showClearAllButton": true
      }
    }
  }
}
```

#### 5. Update Filter Options Only

**Mutation:**
```graphql
mutation UpdateFilterOptions($shop: String!, $id: String!, $input: UpdateFilterInput!) {
  updateFilter(shop: $shop, id: $id, input: $input) {
    id
    title
    options {
      handle
      position
      label
      displayType
      collapsed
      searchable
      showTooltip
      showCount
      status
    }
    version
    updatedAt
  }
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2",
  "input": {
    "options": [
      {
        "handle": "collection",
        "position": 0,
        "optionId": "6f30",
        "label": "Collection",
        "optionType": "Collection##6f30",
        "displayType": "list",
        "collapsed": true,
        "searchable": true,
        "showTooltip": false,
        "showCount": true,
        "status": "published"
      },
      {
        "handle": "color",
        "position": 1,
        "optionId": "8b53",
        "label": "Color",
        "optionType": "Color##8b53",
        "displayType": "color-swatch",
        "baseOptionType": null,
        "selectedValues": [],
        "valueNormalization": {
          "red": "Red",
          "blue": "Blue"
        },
        "groupBySimilarValues": true,
        "collapsed": false,
        "searchable": false,
        "showTooltip": true,
        "tooltipContent": "Select color",
        "showCount": true,
        "status": "published"
      }
    ]
  }
}
```

**Response:**
```json
{
  "data": {
    "updateFilter": {
      "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2",
      "title": "Main Product Filters",
      "options": [
        {
          "handle": "collection",
          "position": 0,
          "label": "Collection",
          "collapsed": true,
          "searchable": true,
          "status": "published"
        },
        {
          "handle": "vendor",
          "position": 1,
          "label": "Vendor",
          "collapsed": false,
          "searchable": true,
          "status": "published"
        }
      ],
      "version": 4,
      "updatedAt": "2025-11-27T11:15:00.000Z"
    }
  }
}
```

#### 6. Delete Filter

**Mutation:**
```graphql
mutation DeleteFilter($shop: String!, $id: String!) {
  deleteFilter(shop: $shop, id: $id)
}
```

**Variables:**
```json
{
  "shop": "example.myshopify.com",
  "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2"
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

---

## Combined Queries

### Get Shop with Products and Filters

**Query:**
```graphql
query GetShopWithData($shopDomain: String!, $productFilters: ProductSearchInput) {
  shop(domain: $shopDomain) {
    shop
    isActive
    metadata {
      shopId
      currencyCode
    }
  }
  
  products(shop: $shopDomain, filters: $productFilters) {
    products {
      id
      title
      minPrice
      maxPrice
    }
    total
    nextCursor
    hasNextPage
  }
  
  filters(shop: $shopDomain) {
    total
    filters {
      id
      title
      isActive
    }
  }
}
```

**Variables:**
```json
{
  "shopDomain": "example.myshopify.com",
  "productFilters": {
    "limit": 10
  }
}
```

**Response:**
```json
{
  "data": {
    "shop": {
      "shop": "example.myshopify.com",
      "isActive": true,
      "metadata": {
        "shopId": "12345678",
        "currencyCode": "USD"
      }
    },
    "products": {
      "products": [...],
      "total": 150,
      "nextCursor": "MTA=",
      "hasNextPage": true
    },
    "filters": {
      "total": 2,
      "filters": [
        {
          "id": "41c36da4-6ac6-476e-a30e-21ab5c7341d2",
          "title": "Main Product Filters",
          "isActive": true
        }
      ]
    }
  }
}
```

---

## Notes

### Pagination
- Products query uses **cursor-based pagination**
- Maximum limit is **500 products** per query
- Use `nextCursor` from response to get next page
- Use `prevCursor` from response to get previous page
- Check `hasNextPage` to know if more results are available

### Filter Aggregations
- Set `includeFilters: true` in `ProductSearchInput` to get filter aggregations
- Aggregations include: vendors, productTypes, tags, collections, options, price ranges

### Field Selection
- GraphQL allows you to select only the fields you need
- This reduces response size and improves performance
- All fields are optional except those marked with `!`

### Error Handling
- All queries return errors in the `errors` array if something goes wrong
- Check for `errors` in the response before using `data`
- Error messages include details about what went wrong

### Authentication
- All queries require proper authentication
- Shop domain must match authenticated shop
- Mutations may require additional permissions

---

## Testing with GraphQL Playground

You can test these queries using any GraphQL client:

1. **GraphQL Playground**: `http://localhost:PORT/graphql`
2. **Postman**: Use POST request with JSON body
3. **cURL**: 
```bash
curl -X POST http://localhost:PORT/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { shop(domain: \"example.myshopify.com\") { shop isActive } }"}'
```

---

## Example cURL Commands

### Get Shop
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetShop($domain: String!) { shop(domain: $domain) { shop isActive } }",
    "variables": { "domain": "example.myshopify.com" }
  }'
```

### Get Products
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetProducts($shop: String!) { products(shop: $shop, filters: { limit: 20 }) { products { id title } total nextCursor } }",
    "variables": { "shop": "example.myshopify.com" }
  }'
```

### Create Filter
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation CreateFilter($shop: String!, $input: CreateFilterInput!) { createFilter(shop: $shop, input: $input) { id title } }",
    "variables": {
      "shop": "example.myshopify.com",
      "input": {
        "title": "Test Filter",
        "options": [
          {
            "handle": "collection",
            "position": 0,
            "optionId": "test123",
            "label": "Collection",
            "optionType": "Collection##test123"
          }
        ]
      }
    }
  }'
```

