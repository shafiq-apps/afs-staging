# Storefront Filters & Queries Guidelines

## Overview

This guide provides comprehensive documentation for using the storefront filtering and product search API endpoints. The system supports advanced filtering with short handle/ID keys for optimal performance, integrates with filter configurations created in the app, and provides flexible search capabilities.

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Query Parameters Reference](#query-parameters-reference)
3. [Filter Configuration Integration](#filter-configuration-integration)
4. [Handle/ID Format & Best Practices](#handleid-format--best-practices)
5. [Search Functionality](#search-functionality)
6. [Request & Response Formats](#request--response-formats)
7. [Examples & Use Cases](#examples--use-cases)
8. [Performance Optimization](#performance-optimization)

---

## API Endpoints

### GET /storefront/products

Returns paginated product results based on filter criteria and search query.

**Base URL:** `http://localhost:3554/storefront/products` (or your configured base URL)

**Purpose:**
- Search and filter products
- Get paginated product listings
- Retrieve product data with optional field selection
- Get filter aggregations alongside products

**Authentication:** None required (public storefront endpoint)

**Rate Limiting:** Applied per shop domain

---

### GET /storefront/filters

Returns available filter options (aggregations/facets) and filter configuration.

**Base URL:** `http://localhost:3554/storefront/filters` (or your configured base URL)

**Purpose:**
- Get available filter values and their counts
- Retrieve filter configuration (handle/ID mappings)
- Get contextual filter counts based on current selections
- Discover which filters are available for a shop

**Authentication:** None required (public storefront endpoint)

**Rate Limiting:** Applied per shop domain

**Note:** Accepts the same filter parameters as the products endpoint to provide contextual filter counts.

---

## Query Parameters Reference

### Required Parameters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `shop` | string | `shop.myshopify.com` | **Required** - Shop domain identifier |

### Standard Filters

| Parameter | Format | Example | Description |
|-----------|--------|---------|-------------|
| `search` | string | `jacket` | Search query for product titles, vendors, product types, and tags |
| `vendor` / `vendors` | comma-separated | `Nike,Adidas` | Filter by vendor names (case-insensitive) |
| `productType` / `productTypes` | comma-separated | `Jacket,Shirt` | Filter by product types (case-insensitive) |
| `tag` / `tags` | comma-separated | `sale,new` | Filter by product tags (case-insensitive) |
| `collection` / `collections` | comma-separated | `174251016285` | Filter by collection IDs |

### Price Filters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `priceMin` | number | `10.00` | Minimum product-level price (product.minPrice) |
| `priceMax` | number | `100.00` | Maximum product-level price (product.maxPrice) |
| `variantPriceMin` | number | `5.00` | Minimum variant price (variant.price) |
| `variantPriceMax` | number | `50.00` | Maximum variant price (variant.price) |

### Variant Filters

| Parameter | Format | Example | Description |
|-----------|--------|---------|-------------|
| `variantSku` / `variantSkus` / `sku` / `skus` | comma-separated | `SKU-001,SKU-002` | Filter by variant SKUs |
| `variantKey` / `variantKeys` / `variantOptionKeys` | comma-separated | `size,color` | Filter by variant option keys |

### Option Filters (Variant Options)

Option filters support **three formats** for maximum flexibility:

#### 1. Option Names (Traditional - Backward Compatible)
```
options[Size]=M,XXXL
options[Color]=Dark+Grey,Red
options[Price]=10-50
```

#### 2. Option Handles/IDs (Recommended - Shorter URLs)
```
options[pr_a3k9x]=M,XXXL
options[op_rok5d]=Dark+Grey,Red
options[pr_e2e1j]=10-50
```

#### 3. Direct Handle/ID Keys (Shortest - Best Performance)
```
pr_a3k9x=M,XXXL
op_rok5d=Dark+Grey,Red
pr_e2e1j=10-50
```

**Note:** Handles/IDs are automatically mapped to option names using the active filter configuration. If no filter config is active, option names must be used.

### Pagination Parameters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-based, default: 1) |
| `limit` | integer | `20` | Items per page (1-100, default: 20) |

### Sorting Parameters

| Parameter | Format | Example | Description |
|-----------|--------|---------|-------------|
| `sort` | string | `createdAt:desc` | Sort field and order (format: `field:order`) |

**Supported Sort Fields:**
- `createdAt` - Product creation date
- `price` - Product price (mapped to minPrice)
- `title` - Product title (alphabetical)
- `_score` - Relevance score (used automatically when search is present)

**Supported Sort Orders:**
- `asc` / `ascending` - Ascending order
- `desc` / `descending` - Descending order

**Default Sorting:**
- If `search` parameter is present: sorted by relevance (`_score:desc`)
- Otherwise: sorted by creation date (`createdAt:desc`)

### Advanced Parameters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `fields` | comma-separated or array | `id,title,imageUrl,variants.id,variants.price` | Select specific fields to return (reduces response size) |
| `includeFilters` | boolean | `true` | Include filter aggregations in products response |

---

## Filter Configuration Integration

### Overview

The filtering system integrates with filter configurations created in the app. These configurations define:
- Which filter options are available
- Short handles/IDs for each option
- Option display settings
- Filter scoping (all products vs. specific collections)
- Option-level restrictions

### How Filter Config Works

1. **Active Filter Detection:**
   - The system automatically detects the active filter configuration for a shop
   - Only filters with `status === 'published'` and `deploymentChannel === 'app'` or `'theme'` are considered active
   - If multiple published filters exist, the first one found is used

2. **Handle/ID Mapping:**
   - Each filter option in the config has a unique `handle` (e.g., `pr_a3k9x`)
   - Query parameters using handles/IDs are automatically mapped to actual option names
   - This mapping happens in `applyFilterConfigToInput()` function

3. **Option Validation:**
   - Only options defined in the active filter config are processed
   - Query parameters that don't match any option in the config are filtered out
   - This prevents invalid filters from affecting search results

4. **Filter Scoping:**
   - Filters can be scoped to all products (`targetScope: 'all'`) or specific collections (`targetScope: 'entitled'`)
   - When scoped to collections, only products in allowed collections are returned
   - Collection restrictions are automatically applied to search queries

### Getting Filter Configuration

To get the active filter configuration and handle mappings, call:

```
GET /storefront/filters?shop=shop.myshopify.com
```

**Response includes:**
- `filterConfig` - Complete filter configuration with all option definitions
- `filters` - Available filter values (aggregations) with counts
- `appliedFilters` - Currently applied filter values

**Filter Config Structure:**
```json
{
  "success": true,
  "data": {
    "filterConfig": {
      "id": "filter_123",
      "title": "Product Filters",
      "options": [
        {
          "handle": "pr_a3k9x",
          "optionId": "op_rok5d",
          "label": "Size",
          "optionType": "Size",
          "variantOptionKey": "size",
          "position": 1,
          "displayType": "list",
          "selectionType": "multiple",
          "status": "published"
        }
      ]
    },
    "filters": {
      "vendors": [...],
      "productTypes": [...],
      "options": {
        "Size": [
          { "value": "M", "count": 45 },
          { "value": "L", "count": 32 }
        ]
      }
    }
  }
}
```

### Using Filter Config in Queries

1. **Fetch filter config on initialization:**
   ```
   GET /storefront/filters?shop=shop.myshopify.com
   ```

2. **Extract handles/IDs from config:**
   - Use `handle` or `optionId` from each option
   - Store the mapping for use in query parameters

3. **Use handles/IDs in queries:**
   ```
   GET /storefront/products?shop=shop.myshopify.com&pr_a3k9x=M,XXXL
   ```

4. **Handle config changes:**
   - Filter config may change when merchants update filters in the app
   - Re-fetch filter config periodically or on filter-related errors
   - Cache filter config with appropriate TTL (recommended: 5 minutes)

---

## Handle/ID Format & Best Practices

### Handle/ID Format

**Pattern:** `{prefix}_{random}`

**Structure:**
- **Length:** 6-9 characters total
- **Format:** `{prefix}_{random}` (e.g., `pr_a3k9x`, `op_rok5d`)
- **Characters:** Lowercase alphanumeric + underscore only
- **URL-friendly:** No spaces or special characters

### Common Handle Prefixes

| Prefix | Type | Example | Description |
|--------|------|---------|-------------|
| `pr_` | Price | `pr_a3k9x` | Price range filter option |
| `vn_` | Vendor | `vn_x7m2p` | Vendor filter option |
| `pt_` | Product Type | `pt_k9m2x` | Product type filter option |
| `tg_` | Tags | `tg_m3k9p` | Tag filter option |
| `cl_` | Collection | `cl_x7m2k` | Collection filter option |
| `op_` | Generic Option | `op_rok5d` | Generic variant option (Size, Color, etc.) |

### Best Practices: Shortest Format Recommendation

**Recommended Format: Direct Handle/ID Keys**

Use the shortest format for optimal performance:

✅ **Best (Shortest):**
```
GET /storefront/products?shop=shop.myshopify.com&pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey
```

✅ **Good (Recommended):**
```
GET /storefront/products?shop=shop.myshopify.com&options[pr_a3k9x]=M,XXXL&options[op_rok5d]=Dark+Grey
```

⚠️ **Acceptable (Backward Compatible):**
```
GET /storefront/products?shop=shop.myshopify.com&options[Size]=M,XXXL&options[Color]=Dark+Grey
```

### Performance Benefits

**URL Length Comparison:**
- **Option Names:** `options[Size]=M,XXXL&options[Color]=Dark+Grey` (47 chars)
- **Options with Handles:** `options[pr_a3k9x]=M,XXXL&options[op_rok5d]=Dark+Grey` (49 chars)
- **Direct Handles:** `pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey` (33 chars)
- **Savings:** ~30% shorter URLs with direct handles

**Additional Benefits:**
- Faster parsing (shorter keys)
- Less URL encoding needed
- Better cache key generation
- Cleaner browser history
- More SEO-friendly URLs
- Easier to share and bookmark

### Implementation Guidelines

1. **Always fetch filter config first:**
   - Get handle mappings before building query URLs
   - Cache the config to avoid repeated requests

2. **Use direct handles when possible:**
   - Prefer `pr_a3k9x=M` over `options[pr_a3k9x]=M`
   - Only use `options[]` format if you need explicit option grouping

3. **Support both formats:**
   - For maximum compatibility, support both handles and option names
   - Fall back to option names if filter config is unavailable

4. **Validate handles:**
   - Check that handles exist in filter config before using
   - Handle cases where filter config changes or is unavailable

5. **Handle edge cases:**
   - If handle doesn't match any option, treat as option name
   - Log warnings for unknown handles in development

---

## Search Functionality

### How Search Works

The `search` parameter performs a multi-field text search across product data using Elasticsearch's `multi_match` query.

### Search Fields

Search queries are performed across the following fields with different weights:

| Field | Weight | Description |
|-------|--------|-------------|
| `title` | 3x | Product title (highest priority) |
| `vendor` | 2x | Vendor name |
| `productType` | 1x | Product type |
| `tags` | 1x | Product tags |

**Search Type:** `best_fields` - Returns documents matching any field, scoring by the best matching field.

**Operator:** `and` - All search terms must be present in at least one field.

### Search Examples

**Basic Search:**
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket
```
Searches for "jacket" in product titles, vendors, product types, and tags.

**Search with Filters:**
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket&pr_a3k9x=M&op_rok5d=Blue
```
Searches for "jacket" and applies Size=M and Color=Blue filters.

**Multi-word Search:**
```
GET /storefront/products?shop=shop.myshopify.com&search=winter+jacket
```
Searches for products containing both "winter" and "jacket" in any of the search fields.

### Search Behavior

1. **Case Insensitive:** Search is case-insensitive
2. **Whitespace Handling:** Multiple spaces are treated as single space
3. **Trimming:** Leading and trailing whitespace is removed
4. **Scoring:** Results are sorted by relevance score when search is present
5. **Combined with Filters:** Search works in combination with all other filters

### Search Limitations

- Search does not support wildcards or regex patterns
- Search does not search variant option values (use option filters instead)
- Search does not search product descriptions (only title, vendor, productType, tags)
- Special characters are sanitized for security

---

## Request & Response Formats

### GET /storefront/products Request

**Example Request:**
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket&pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey&priceMin=10&priceMax=100&page=1&limit=20&sort=createdAt:desc
```

### GET /storefront/products Response

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "gid://shopify/Product/123",
        "title": "Winter Jacket",
        "vendor": "Nike",
        "productType": "Jacket",
        "imageUrl": "https://...",
        "priceRange": {
          "minVariantPrice": { "amount": "49.99", "currencyCode": "USD" },
          "maxVariantPrice": { "amount": "99.99", "currencyCode": "USD" }
        },
        "variants": [
          {
            "id": "gid://shopify/ProductVariant/456",
            "price": { "amount": "49.99", "currencyCode": "USD" },
            "availableForSale": true
          }
        ]
      }
    ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "totalPages": 8
    },
    "appliedFilters": {
      "search": "jacket",
      "options": {
        "Size": ["M", "XXXL"],
        "Color": ["Dark Grey"]
      },
      "priceMin": 10,
      "priceMax": 100
    },
    "filters": {
      "vendors": [
        { "value": "Nike", "count": 45 },
        { "value": "Adidas", "count": 32 }
      ],
      "productTypes": [
        { "value": "Jacket", "count": 78 },
        { "value": "Shirt", "count": 12 }
      ],
      "options": {
        "Size": [
          { "value": "M", "count": 45 },
          { "value": "L", "count": 32 },
          { "value": "XXXL", "count": 8 }
        ],
        "Color": [
          { "value": "Dark Grey", "count": 25 },
          { "value": "Blue", "count": 18 }
        ]
      },
      "priceRange": {
        "min": 10.00,
        "max": 200.00
      }
    },
    "filterConfig": {
      "id": "filter_123",
      "title": "Product Filters",
      "options": [
        {
          "handle": "pr_a3k9x",
          "optionId": "op_rok5d",
          "label": "Size",
          "optionType": "Size",
          "variantOptionKey": "size"
        }
      ]
    }
  }
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description"
}
```

### GET /storefront/filters Request

**Example Request:**
```
GET /storefront/filters?shop=shop.myshopify.com&vendor=Nike&productType=Jacket
```

**Note:** Filter parameters are optional. When provided, filter counts reflect the current filter state.

### GET /storefront/filters Response

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "filterConfig": {
      "id": "filter_123",
      "title": "Product Filters",
      "description": "Main product filters",
      "filterType": "standard",
      "targetScope": "all",
      "allowedCollections": [],
      "options": [
        {
          "handle": "pr_a3k9x",
          "position": 1,
          "optionId": "op_rok5d",
          "label": "Size",
          "optionType": "Size",
          "displayType": "list",
          "selectionType": "multiple",
          "targetScope": "all",
          "allowedOptions": [],
          "variantOptionKey": "size",
          "collapsed": false,
          "searchable": true,
          "showCount": true,
          "sortBy": "ascending"
        }
      ],
      "settings": {
        "hideOutOfStockItems": false,
        "showFilterCount": true,
        "showActiveFilters": true
      },
      "deploymentChannel": "app",
      "status": "published"
    },
    "filters": {
      "vendors": [
        { "value": "Nike", "count": 45 },
        { "value": "Adidas", "count": 32 }
      ],
      "productTypes": [
        { "value": "Jacket", "count": 78 },
        { "value": "Shirt", "count": 12 }
      ],
      "tags": [
        { "value": "sale", "count": 25 },
        { "value": "new", "count": 18 }
      ],
      "collections": [
        { "value": "174251016285", "count": 50 }
      ],
      "options": {
        "Size": [
          { "value": "M", "count": 45 },
          { "value": "L", "count": 32 },
          { "value": "XXXL", "count": 8 }
        ],
        "Color": [
          { "value": "Dark Grey", "count": 25 },
          { "value": "Blue", "count": 18 }
        ]
      },
      "priceRange": {
        "min": 10.00,
        "max": 200.00
      },
      "variantPriceRange": {
        "min": 5.00,
        "max": 250.00
      }
    },
    "appliedFilters": {
      "vendors": ["Nike"],
      "productTypes": ["Jacket"]
    }
  }
}
```

---

## Examples & Use Cases

### Example 1: Basic Product Listing

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&page=1&limit=20
```

**Use Case:** Display first page of products with default sorting.

---

### Example 2: Search with Single Filter

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket&pr_a3k9x=M
```

**Use Case:** Search for jackets in size M using handle/ID.

---

### Example 3: Multiple Filters with Handles

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey&tags=sale
```

**Use Case:** Filter by size (M or XXXL), color (Dark Grey), and sale tag using shortest format.

---

### Example 4: Price Range with Search

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket&priceMin=10&priceMax=100&sort=price:asc
```

**Use Case:** Search for jackets priced between $10-$100, sorted by price ascending.

---

### Example 5: Collection Filtering

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&collection=174251016285&pr_a3k9x=M
```

**Use Case:** Filter products in a specific collection by size.

---

### Example 6: Full Featured Query

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket&pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey&priceMin=10&priceMax=100&page=1&limit=20&sort=createdAt:desc&includeFilters=true
```

**Use Case:** Complete search with filters, pagination, sorting, and filter aggregations.

---

### Example 7: Get Filter Options

**Request:**
```
GET /storefront/filters?shop=shop.myshopify.com
```

**Use Case:** Get all available filter options and their counts for initial filter UI rendering.

---

### Example 8: Contextual Filter Counts

**Request:**
```
GET /storefront/filters?shop=shop.myshopify.com&vendor=Nike&productType=Jacket
```

**Use Case:** Get filter counts that reflect current selections (e.g., show only sizes available for Nike jackets).

---

### Example 9: Field Selection (Performance Optimization)

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&fields=id,title,imageUrl,variants.id,variants.price
```

**Use Case:** Reduce response size by requesting only needed fields.

---

### Example 10: Mixed Format (Backward Compatibility)

**Request:**
```
GET /storefront/products?shop=shop.myshopify.com&options[Size]=M&op_rok5d=Dark+Grey
```

**Use Case:** Mix option names and handles for gradual migration.

---

## Performance Optimization

### Caching Strategies

1. **Filter Config Caching:**
   - Cache filter configuration for 5 minutes
   - Re-fetch when filter-related errors occur
   - Invalidate cache when filter config changes

2. **Response Caching:**
   - Cache product search results for 1-2 minutes
   - Cache filter aggregations for 30 seconds
   - Use cache keys based on query parameters

3. **Handle/ID Mapping:**
   - Store handle-to-option-name mappings locally
   - Update mappings when filter config changes

### Query Optimization

1. **Use Shortest Format:**
   - Prefer direct handles over `options[]` format
   - Reduces URL length and parsing time

2. **Field Selection:**
   - Use `fields` parameter to request only needed data
   - Reduces response size and parsing time

3. **Pagination:**
   - Use appropriate `limit` values (20-50 recommended)
   - Avoid requesting too many pages at once

4. **Debouncing:**
   - Debounce filter changes to reduce API calls
   - Wait for user to finish selecting filters

### Best Practices

1. **Initial Load:**
   - Fetch filter config first
   - Then fetch initial products
   - Render filters and products in parallel when possible

2. **Filter Updates:**
   - Update URL with new filters
   - Fetch products with new filters
   - Update filter counts after product fetch

3. **Error Handling:**
   - Handle network errors gracefully
   - Retry failed requests with exponential backoff
   - Fall back to option names if handles fail

4. **Monitoring:**
   - Track API response times
   - Monitor cache hit rates
   - Log filter config changes

---

## Error Handling & Validation

### Common Errors

1. **Missing Shop Parameter:**
   - Error: `Shop parameter is required`
   - Solution: Always include `shop` parameter

2. **Invalid Handle/ID:**
   - Behavior: Handle is treated as option name
   - Solution: Verify handle exists in filter config

3. **Filter Config Not Found:**
   - Behavior: Option names must be used
   - Solution: Use option names or ensure filter is published

4. **Invalid Sort Format:**
   - Behavior: Default sorting is applied
   - Solution: Use format `field:order` (e.g., `createdAt:desc`)

5. **Rate Limit Exceeded:**
   - Error: `Rate limit exceeded`
   - Solution: Implement request throttling and caching

### Input Sanitization

All query parameters are automatically sanitized:
- Null bytes and control characters are removed
- HTML/script injection characters are filtered
- Keys are limited to 200 characters
- Values are limited to 500 characters
- Special characters that could break queries are filtered out

---

## Migration Guide

### From Option Names to Handles/IDs

1. **Phase 1: Fetch Filter Config**
   ```
   GET /storefront/filters?shop=shop.myshopify.com
   ```

2. **Phase 2: Extract Handles**
   - Extract `handle` or `optionId` from each option
   - Store mapping: `{ optionName: handle }`

3. **Phase 3: Update Query Building**
   - Replace `options[Size]` with `pr_a3k9x`
   - Use direct handle format for shortest URLs

4. **Phase 4: Handle Edge Cases**
   - Fall back to option names if handle not found
   - Re-fetch filter config on errors

### Backward Compatibility

The API maintains full backward compatibility:
- Option names continue to work
- Handles/IDs are automatically mapped
- Mixed formats are supported
- No breaking changes required

---

## Notes

- Handles/IDs are case-sensitive
- Option names are case-insensitive (normalized to lowercase)
- Multiple values are comma-separated
- URL encoding is handled automatically
- All formats can be mixed in the same request
- Direct handle keys are automatically detected (no prefix needed)
- Filter config is authoritative - only published options are valid
- Collection restrictions are automatically applied when filter is scoped

---

## Support & Resources

For additional information:
- See `FILTER_QUERY_PARAMS_GUIDE.md` for detailed query parameter documentation
- See `GRAPHQL_QUERIES_SAMPLES.md` for GraphQL API examples
- Check route implementations in `app/modules/products/routes/`

