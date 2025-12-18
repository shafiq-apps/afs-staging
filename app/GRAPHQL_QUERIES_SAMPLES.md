## GraphQL Queries & Mutations (App Server) — Updated Samples

This file is a **living set of examples** for *every* GraphQL operation exposed by the app server.
It is kept aligned with the **actual schema strings in** `app/modules/graphql/schema/*`.

### Endpoint

- **URL**: `POST /graphql`
- **Body**:

```json
{
  "query": "query MyQuery($var: String!) { ... }",
  "variables": { "var": "value" },
  "operationName": "MyQuery"
}
```

### Notes about JSON fields

The schema uses a `JSON` scalar for:
- **inputs** like `ProductSearchInput.options` / `ProductFilterInput.options`
- **outputs** like `ProductFilters.options`

**Best practice:** pass JSON via `variables` (not inline in the query string).

---

### Table of Contents

1. [Shops](#shops)
2. [Products](#products)
3. [Storefront Filters (Aggregations)](#storefront-filters-aggregations)
4. [Filters (Filter Config CRUD)](#filters-filter-config-crud)
5. [Cache Admin (Debug)](#cache-admin-debug)
6. [Combined Examples](#combined-examples)
7. [cURL examples](#curl-examples)

---

## Shops

### Query: `shop(domain: String!)`

```graphql
query Shop($domain: String!) {
  shop(domain: $domain) {
    shop
    installedAt
    isActive
    scopes

    # NOTE: these fields exist in the schema; be careful exposing them.
    accessToken
    refreshToken

    lastAccessed
    updatedAt
    isDeleted
    uninstalledAt
    reinstalledAt
    reinstalled

    sessionId
    state
    isOnline
    scope
    expires
    userId
    firstName
    lastName
    email
    accountOwner
    locale
    collaborator
    emailVerified

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

**Variables**

```json
{ "domain": "example.myshopify.com" }
```

**Example response (shape)**

```json
{
  "data": {
    "shop": {
      "shop": "example.myshopify.com",
      "installedAt": "2025-12-01T10:00:00.000Z",
      "isActive": true,
      "scopes": ["read_products", "write_products"],
      "accessToken": "shpat_***",
      "refreshToken": "shpat_***",
      "lastAccessed": "2025-12-18T09:15:00.000Z",
      "updatedAt": "2025-12-18T09:15:00.000Z",
      "uninstalledAt": null,
      "reinstalledAt": null,
      "metadata": { "shopId": "12345678", "currencyCode": "USD", "email": "merchant@example.com" },
      "locals": { "ip": "203.0.113.10", "userAgent": "Mozilla/5.0" }
    }
  }
}
```

### Query: `shopExists(domain: String!)`

```graphql
query ShopExists($domain: String!) {
  shopExists(domain: $domain)
}
```

**Variables**

```json
{ "domain": "example.myshopify.com" }
```

### Query: `indexingStatus(shop: String!)`

```graphql
query IndexingStatus($shop: String!) {
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

**Variables**

```json
{ "shop": "example.myshopify.com" }
```

### Mutation: `createShop(input: CreateShopInput!)`

```graphql
mutation CreateShop($input: CreateShopInput!) {
  createShop(input: $input) {
    shop
    isActive
    scopes
    installedAt
    updatedAt
    lastAccessed
    metadata
    locals
  }
}
```

**Variables**

```json
{
  "input": {
    "shop": "example.myshopify.com",
    "accessToken": "shpat_***",
    "refreshToken": "shpat_***",
    "isActive": true,
    "scopes": ["read_products", "write_products"],
    "installedAt": "2025-12-01T10:00:00.000Z",
    "metadata": { "shopId": "12345678", "currencyCode": "USD", "email": "merchant@example.com" },
    "locals": { "ip": "203.0.113.10", "userAgent": "Mozilla/5.0" }
  }
}
```

### Mutation: `updateShop(domain: String!, input: UpdateShopInput!)`

```graphql
mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
  updateShop(domain: $domain, input: $input) {
    shop
    isActive
    updatedAt
    lastAccessed
    metadata
  }
}
```

**Variables**

```json
{
  "domain": "example.myshopify.com",
  "input": {
    "isActive": true,
    "lastAccessed": "2025-12-18T09:15:00.000Z",
    "metadata": { "currencyCode": "EUR" }
  }
}
```

### Mutation: `deleteShop(domain: String!)`

```graphql
mutation DeleteShop($domain: String!) {
  deleteShop(domain: $domain)
}
```

### Mutation: `reindexProducts(shop: String!)`

```graphql
mutation ReindexProducts($shop: String!) {
  reindexProducts(shop: $shop) {
    success
    message
  }
}
```

---

## Products

### Query: `product(shop: String!, id: String!)`

```graphql
query Product($shop: String!, $id: String!) {
  product(shop: $shop, id: $id) {
    id
    title
    handle
    status
    vendor
    productType
    tags
    minPrice
    maxPrice
    imageUrl
    imagesUrls
    options { name values }
    variants {
      id
      title
      sku
      price
      availableForSale
      inventoryQuantity
      selectedOptions { name value }
    }
  }
}
```

**Variables**

```json
{ "shop": "example.myshopify.com", "id": "gid://shopify/Product/123" }
```

### Query: `products(shop: String!, filters: ProductSearchInput)`

```graphql
query Products($shop: String!, $filters: ProductSearchInput) {
  products(shop: $shop, filters: $filters) {
    products {
      id
      title
      vendor
      productType
      minPrice
      maxPrice
      imageUrl
      bestSellerRank
    }
    total
    nextCursor
    hasNextPage
    prevCursor

    # Only returned when includeFilters=true
    filters {
      vendors { value count }
      productTypes { value count }
      tags { value count }
      collections { value count }
      options
      price { min max }
    }
  }
}
```

**Variables (include filter aggs + option filter + price range)**

```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "limit": 20,
    "includeFilters": true,
    "search": "jacket",
    "vendors": ["Nike"],
    "priceMin": 10,
    "priceMax": 100,
    "options": {
      "Color": ["Black"],
      "Size": ["M", "L"]
    }
  }
}
```

**Example response (shape)**

```json
{
  "data": {
    "products": {
      "products": [
        {
          "id": "gid://shopify/Product/123",
          "title": "Jacket - Black",
          "vendor": "Nike",
          "productType": "Jackets",
          "minPrice": 49.99,
          "maxPrice": 89.99,
          "imageUrl": "https://cdn.shopify.com/...",
          "bestSellerRank": 12
        }
      ],
      "total": 42,
      "nextCursor": "MjA=",
      "hasNextPage": true,
      "prevCursor": null,
      "filters": {
        "vendors": [{ "value": "Nike", "count": 42 }],
        "productTypes": [{ "value": "Jackets", "count": 42 }],
        "tags": [{ "value": "winter", "count": 18 }],
        "collections": [{ "value": "174251016285", "count": 42 }],
        "options": {
          "Color": [{ "value": "Black", "count": 20 }],
          "Size": [{ "value": "M", "count": 14 }]
        },
        "price": { "min": 0.0, "max": 999.99 }
      }
    }
  }
}
```

---

## Storefront Filters (Aggregations)

### Query: `storefrontFilters(shop: String!, filters: ProductFilterInput)`

This returns **aggregations only** (no products).

```graphql
query StorefrontFilters($shop: String!, $filters: ProductFilterInput) {
  storefrontFilters(shop: $shop, filters: $filters) {
    vendors { value count }
    productTypes { value count }
    tags { value count }
    collections { value count }
    options
    price { min max }
  }
}
```

**Variables (no filters)**

```json
{ "shop": "example.myshopify.com" }
```

**Variables (with filters applied)**

```json
{
  "shop": "example.myshopify.com",
  "filters": {
    "vendors": ["Nike"],
    "priceMax": 50
  }
}
```

---

## Filters (Filter Config CRUD)

### Query: `filter(shop: String!, id: String!)`

```graphql
query Filter($shop: String!, $id: String!) {
  filter(shop: $shop, id: $id) {
    id
    shop
    title
    description
    filterType
    targetScope
    status
    deploymentChannel
    createdAt
    updatedAt
    version
    tags

    allowedCollections { label value id gid }

    options {
      handle
      position
      label
      optionType
      displayType
      selectionType
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
        removeSuffix
        replaceText { from to }
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
      productDisplay { gridColumns showProductCount showSortOptions defaultSort }
      pagination { type itemsPerPage showPageInfo pageInfoFormat }
      showFilterCount
      showActiveFilters
      showResetButton
      showClearAllButton
    }
  }
}
```

### Query: `filters(shop: String!)`

```graphql
query Filters($shop: String!) {
  filters(shop: $shop) {
    total
    filters {
      id
      title
      status
      deploymentChannel
      createdAt
      updatedAt
      version
      tags
    }
  }
}
```

### Mutation: `createFilter(shop: String!, input: CreateFilterInput!)`

```graphql
mutation CreateFilter($shop: String!, $input: CreateFilterInput!) {
  createFilter(shop: $shop, input: $input) {
    id
    shop
    title
    status
    deploymentChannel
    createdAt
    version
    options { handle position label optionType displayType selectionType status }
  }
}
```

**Variables**

```json
{
  "shop": "example.myshopify.com",
  "input": {
    "title": "Main Filters",
    "filterType": "custom",
    "targetScope": "all",
    "deploymentChannel": "APP",
    "status": "PUBLISHED",
    "tags": ["main"],
    "allowedCollections": [
      { "label": "All Products", "value": "all", "id": "0", "gid": "gid://shopify/Collection/0" }
    ],
    "options": [
      {
        "handle": "pr_price",
        "position": 0,
        "label": "Price",
        "optionType": "Price",
        "displayType": "RANGE",
        "selectionType": "RANGE",
        "status": "PUBLISHED",
        "optionSettings": { "baseOptionType": "PRICE" }
      },
      {
        "handle": "op_color",
        "position": 1,
        "label": "Color",
        "optionType": "Color",
        "displayType": "CHECKBOX",
        "selectionType": "MULTIPLE",
        "status": "PUBLISHED",
        "optionSettings": { "baseOptionType": "OPTION", "variantOptionKey": "Color" }
      }
    ]
  }
}
```

### Mutation: `updateFilter(shop: String!, id: String!, input: CreateFilterInput!)`

> Note: the schema currently uses `CreateFilterInput` for updates.

```graphql
mutation UpdateFilter($shop: String!, $id: String!, $input: CreateFilterInput!) {
  updateFilter(shop: $shop, id: $id, input: $input) {
    id
    title
    status
    updatedAt
    version
  }
}
```

### Mutation: `deleteFilter(shop: String!, id: String!)`

```graphql
mutation DeleteFilter($shop: String!, $id: String!) {
  deleteFilter(shop: $shop, id: $id)
}
```

---

## Cache Admin (Debug)

These operations are **disabled in production by default**.
Enable with env var: `GRAPHQL_CACHE_ADMIN_ENABLED=true`.

### Query: `cacheConfig`

```graphql
query CacheConfig {
  cacheConfig {
    enabled
    maxSize
    defaultTTL
    checkInterval
    searchTTL
    filterTTL
    filterListTTL
    statsEnabled
    logDisabled
  }
}
```

### Query: `cacheStats`

```graphql
query CacheStats {
  cacheStats
}
```

### Query: `cacheEntries(input: CacheEntriesInput)`

```graphql
query CacheEntries($input: CacheEntriesInput) {
  cacheEntries(input: $input) {
    area
    key
    ageMs
    expiresInMs
    accessCount
    lastAccessed
    isExpired
  }
}
```

**Variables**

```json
{ "input": { "area": "filters", "shop": "example.myshopify.com", "limit": 50 } }
```

### Mutation: `cacheClearAll`

```graphql
mutation CacheClearAll {
  cacheClearAll {
    success
    cleared
    details
  }
}
```

### Mutation: `cacheClearShop(shop: String!)`

```graphql
mutation CacheClearShop($shop: String!) {
  cacheClearShop(shop: $shop) {
    success
    cleared
    details
  }
}
```

### Mutation: `cacheClearByKeyContains(keyContains: String!, area: CacheArea)`

```graphql
mutation CacheClearByKeyContains($keyContains: String!, $area: CacheArea) {
  cacheClearByKeyContains(keyContains: $keyContains, area: $area) {
    success
    cleared
    details
  }
}
```

---

## Combined Examples

### Fetch shop + products + storefront aggs in one request

```graphql
query Combined($domain: String!, $filters: ProductSearchInput, $facetFilters: ProductFilterInput) {
  shop(domain: $domain) {
    shop
    isActive
  }

  products(shop: $domain, filters: $filters) {
    total
    nextCursor
    hasNextPage
  }

  storefrontFilters(shop: $domain, filters: $facetFilters) {
    price { min max }
  }
}
```

**Variables**

```json
{
  "domain": "example.myshopify.com",
  "filters": { "limit": 20, "includeFilters": false },
  "facetFilters": { "priceMax": 50 }
}
```

---

## cURL examples

### Basic: shopExists

```bash
curl -X POST "http://localhost:3000/graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "operationName": "ShopExists",
    "query": "query ShopExists($domain: String!) { shopExists(domain: $domain) }",
    "variables": { "domain": "example.myshopify.com" }
  }'
```

### Products: include aggregations

```bash
curl -X POST "http://localhost:3000/graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "operationName": "Products",
    "query": "query Products($shop: String!, $filters: ProductSearchInput) { products(shop: $shop, filters: $filters) { total nextCursor hasNextPage filters { price { min max } } } }",
    "variables": {
      "shop": "example.myshopify.com",
      "filters": { "limit": 20, "includeFilters": true, "priceMax": 50 }
    }
  }'
```
