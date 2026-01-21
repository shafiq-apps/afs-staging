# API Endpoints Documentation

This document provides comprehensive documentation for all available API endpoints in the application, organized by module.

---

## Table of Contents

- [Storefront Endpoints](#storefront-endpoints)
- [Indexing Endpoints](#indexing-endpoints)
- [App Endpoints](#app-endpoints)
- [System Endpoints](#system-endpoints)
- [GraphQL Endpoint](#graphql-endpoint)

---

## Storefront Endpoints

> **Note:** All storefront endpoints are **public** and do not require authentication. They are designed for use in storefront themes and customer-facing applications.

### GET /storefront/products

Search and retrieve products with filtering, pagination, and sorting capabilities. Supports dynamic option handles for flexible filtering.

**Middleware:**
- `validateShopDomain()` - Validates shop domain parameter
- `rateLimit()` - Rate limiting protection
- **No authentication required** (public endpoint)

**Query Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `shop` | string | Yes | Shopify shop domain | `shop.myshopify.com` |
| `search` | string | No | Search query text | `nike shoes` |
| `vendor` / `vendors` | string | No | Comma-separated vendor names | `Nike,Adidas` |
| `productType` / `productTypes` | string | No | Comma-separated product types | `Jacket,Shirt` |
| `tag` / `tags` | string | No | Comma-separated tags | `sale,new` |
| `collection` / `collections` | string | No | Comma-separated collection IDs | `gid://shopify/Collection/123` |
| `cpid` | string | No | Collection page ID for filter config matching | `page-123` |
| `{handle}` | string | No | Filter by option handle (dynamic) | `ef4gd=red` or `ef4gd=red,blue` |
| `variantKey` / `variantKeys` | string | No | Comma-separated variant option keys | `Color,Size` |
| `priceMin` | number | No | Minimum product price | `10.00` |
| `priceMax` | number | No | Maximum product price | `100.00` |
| `variantSku` / `variantSkus` | string | No | Comma-separated SKUs | `SKU-001,SKU-002` |
| `keep` | string | No | Keep filter aggregations (by handle) | `ef4gd,sd5d3s` |
| `preserveOptionAggregations` | boolean | No | Preserve all option aggregations | `true` |
| `page` | number | No | Page number (default: 1) | `1` |
| `limit` | number | No | Items per page (max: 100, default: 20) | `20` |
| `sort` | string | No | Sort order | `price_asc`, `price_desc`, `title_asc` |

**Option Handles:**
- Option handles are dynamically generated short identifiers (e.g., `ef4gd`, `sd5d3s`) that map to option names (e.g., `Color`, `Size`)
- Handles are automatically resolved based on active filter configuration
- Multiple values can be passed: `ef4gd=red,blue` filters for both red and blue
- Handles are collection/page-specific when `cpid` is provided

**Example Request:**

```bash
GET /storefront/products?shop=shop.myshopify.com&vendor=Nike&ef4gd=red&page=1&limit=20
```

**Example Request (Multiple Option Values):**

```bash
GET /storefront/products?shop=shop.myshopify.com&ef4gd=red,blue&sd5d3s=large&collection=gid://shopify/Collection/123
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "gid://shopify/Product/123",
        "title": "Nike Red Shoes",
        "price": 99.99,
        "variants": [...]
      }
    ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "totalPages": 8
    }
  }
}
```

**Notes:**
- Option handles (e.g., `ef4gd`) are dynamically mapped to option names (e.g., `Color`) based on active filter configuration
- Filter configuration is automatically applied based on collection/page context when `cpid` is provided
- Response does not include filters to optimize payload size (use `/storefront/filters` endpoint for filter data)
- Filter aggregations respect filter configuration settings (position sorting, targetScope filtering, etc.)

---

### GET /storefront/filters

Retrieve filter aggregations (facets) with filter configuration settings applied. Returns pre-formatted filters ready for storefront display.

**Middleware:**
- `validateShopDomain()` - Validates shop domain parameter
- `rateLimit()` - Rate limiting protection
- **No authentication required** (public endpoint)

**Query Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `shop` | string | Yes | Shopify shop domain | `shop.myshopify.com` |
| `collection` | string | No | Collection ID for filter config priority matching | `gid://shopify/Collection/123` |
| `cpid` | string | No | Collection page ID for filter config matching | `page-123` |
| `search` | string | No | Search query text | `nike shoes` |
| `vendor` / `vendors` | string | No | Comma-separated vendor names | `Nike,Adidas` |
| `productType` / `productTypes` | string | No | Comma-separated product types | `Jacket,Shirt` |
| `tag` / `tags` | string | No | Comma-separated tags | `sale,new` |
| `collection` / `collections` | string | No | Comma-separated collection IDs | `gid://shopify/Collection/123` |
| `{handle}` | string | No | Filter by option handle (dynamic) | `ef4gd=red` or `ef4gd=red,blue` |
| `variantKey` / `variantKeys` | string | No | Comma-separated variant option keys | `Color,Size` |
| `priceMin` | number | No | Minimum product price | `10.00` |
| `priceMax` | number | No | Maximum product price | `100.00` |
| `variantSku` / `variantSkus` | string | No | Comma-separated SKUs | `SKU-001,SKU-002` |
| `keep` | string | No | Keep filter aggregations (by handle) | `ef4gd,sd5d3s` |
| `preserveOptionAggregations` | boolean | No | Preserve all option aggregations | `true` |

**Example Request:**

```bash
GET /storefront/filters?shop=shop.myshopify.com&vendor=Nike&ef4gd=red&collection=gid://shopify/Collection/123&cpid=page-123
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "filters": [
      {
        "type": "option",
        "name": "Color",
        "handle": "ef4gd",
        "values": [
          {
            "value": "red",
            "label": "Red",
            "count": 45
          },
          {
            "value": "blue",
            "label": "Blue",
            "count": 32
          }
        ]
      },
      {
        "type": "vendor",
        "name": "Vendor",
        "values": [
          {
            "value": "Nike",
            "label": "Nike",
            "count": 120
          }
        ]
      }
    ],
    "appliedFilters": {
      "vendors": ["Nike"],
      "options": {
        "Color": ["red"]
      }
    }
  }
}
```

**Notes:**
- Accepts the same filter parameters as `/storefront/products` to calculate accurate filter counts
- Filter aggregations are pre-formatted with filter configuration settings applied:
  - Position-based sorting (as configured in filter settings)
  - Target scope filtering (collection-specific filters)
  - Published status filtering (only shows published options)
- Uses per-filter aggregation queries to prevent count "jumping" when filters are applied
- Filter configuration is automatically matched by collection/page when `cpid` is provided
- Filter values use `label` for display and `value` for filtering
- Option handles are included in response for easy URL construction

---

## Indexing Endpoints

### POST /admin/reindex

Trigger product bulk indexing for a shop. Returns immediately with 202 Accepted status while indexing runs in the background.

**Middleware:**
- `validateShopDomain()` - Validates shop domain parameter
- `rateLimit({ windowMs: 60000, max: 5 })` - Rate limiting (5 requests per minute)

**Query Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `shop` / `shop_domain` | string | Yes | Shopify shop domain | `shop.myshopify.com` |

**Example Request:**

```bash
POST /admin/reindex?shop=shop.myshopify.com
```

**Example Response (Success):**

```json
{
  "statusCode": 202,
  "body": {
    "success": true,
    "message": "Indexing started"
  }
}
```

**Example Response (Conflict - Already Indexing):**

```json
{
  "statusCode": 409,
  "body": {
    "success": false,
    "message": "Indexing is already in progress for this shop. Please wait for the current indexing to complete."
  }
}
```

**Example Response (Shop Not Found):**

```json
{
  "statusCode": 404,
  "body": {
    "success": false,
    "message": "Shop not found: shop.myshopify.com"
  }
}
```

**Example Response (Missing Access Token):**

```json
{
  "statusCode": 422,
  "body": {
    "success": false,
    "message": "Shop missing access token: shop.myshopify.com"
  }
}
```

**Notes:**
- Indexing runs asynchronously in the background
- A lock mechanism prevents concurrent indexing for the same shop
- Stale locks are automatically detected and released
- Checkpoint service tracks indexing progress and status
- The shop must exist in Elasticsearch and have a valid access token

---

### POST /admin/best-seller-cleanup

Delete best seller collections that have been unused for a specified number of days. Runs in the background.

**Query Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `days` | number | No | Days of inactivity (default: 30) | `30` |

**Example Request:**

```bash
POST /admin/best-seller-cleanup?days=30
```

**Example Response:**

```json
{
  "statusCode": 202,
  "body": {
    "success": true,
    "message": "Cleanup started for collections unused for 30 days"
  }
}
```

**Example Response (Invalid Days):**

```json
{
  "statusCode": 400,
  "body": {
    "success": false,
    "message": "Invalid days parameter. Must be a positive number."
  }
}
```

**Notes:**
- Cleanup runs asynchronously in the background
- Default cleanup period is 30 days
- Requires `shopsRepository` to be available

---

## App Endpoints

### POST /app/events

Handle Shopify app lifecycle events (installation and uninstallation).

**Middleware:**
- `validate()` - Validates request body structure
- `rateLimit({ windowMs: 60000, max: 60 })` - Rate limiting (60 requests per minute)

**Request Body:**

```json
{
  "event": "APP_INSTALLED" | "APP_UNINSTALLED",
  "shop": "shop.myshopify.com",
  "accessToken": "shpat_...",
  "refreshToken": "shpat_...",
  "scopes": ["read_products", "write_products"],
  "metadata": {},
  "locals": {}
}
```

**Example Request (Installation):**

```bash
POST /app/events
Content-Type: application/json

{
  "event": "APP_INSTALLED",
  "shop": "shop.myshopify.com",
  "accessToken": "shpat_abc123...",
  "refreshToken": "shpat_xyz789...",
  "scopes": ["read_products", "write_products"]
}
```

**Example Response (Installation - New):**

```json
{
  "success": true,
  "message": "Shop installed and saved successfully, reindexing started",
  "event": "APP_INSTALLED",
  "shop": "shop.myshopify.com",
  "data": {
    "shop": "shop.myshopify.com",
    "isActive": true,
    "installedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Response (Installation - Existing):**

```json
{
  "success": true,
  "message": "Shop installed and saved successfully",
  "event": "APP_INSTALLED",
  "shop": "shop.myshopify.com",
  "data": {
    "shop": "shop.myshopify.com",
    "isActive": true,
    "installedAt": "2024-01-10T08:00:00.000Z"
  }
}
```

**Example Request (Uninstallation):**

```bash
POST /app/events
Content-Type: application/json

{
  "event": "APP_UNINSTALLED",
  "shop": "shop.myshopify.com"
}
```

**Example Response (Uninstallation):**

```json
{
  "success": true,
  "message": "Shop uninstalled successfully",
  "event": "APP_UNINSTALLED",
  "shop": "shop.myshopify.com",
  "data": {
    "shop": "shop.myshopify.com",
    "isActive": false,
    "uninstalledAt": "2024-01-20T14:00:00.000Z"
  }
}
```

**Notes:**
- New installations automatically trigger reindexing in the background
- Existing installations update shop data without triggering reindexing
- Uninstallation marks the shop as inactive but preserves data
- OAuth tokens and scopes are stored securely

---

## System Endpoints

### GET /system/status

Get system status information including shop verification, version, and memory usage.

**Example Request:**

```bash
GET /system/status?shop=shop.myshopify.com
```

**Example Response:**

```json
{
  "shopshop": "shop.myshopify.com",
  "shop": true,
  "success": true,
  "status": "operational",
  "version": "1.0.0",
  "environment": "production",
  "nodeVersion": "v18.17.0",
  "memory": {
    "used": 125.45,
    "total": 256.00,
    "unit": "MB"
  }
}
```

**Query Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `shop` | string | No | Shop domain to verify | `shop.myshopify.com` |

---

### GET /system/health

Health check endpoint that verifies system and service health.

**Example Request:**

```bash
GET /system/health
```

**Example Response (Healthy):**

```json
{
  "statusCode": 200,
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 86400.5,
  "services": {
    "elasticsearch": "connected"
  }
}
```

**Example Response (Degraded):**

```json
{
  "statusCode": 503,
  "status": "degraded",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 86400.5,
  "services": {
    "elasticsearch": "disconnected"
  }
}
```

**Notes:**
- Returns HTTP 200 if all services are healthy
- Returns HTTP 503 if any service is degraded or unavailable
- Checks Elasticsearch connection status

---

### GET /system/monitor

Get current system resource usage (CPU and memory) with status indicators.

**Example Request:**

```bash
GET /system/monitor
```

**Example Response:**

```json
{
  "status": "ok",
  "resources": {
    "cpu": {
      "percent": 45.23,
      "status": "normal"
    },
    "memory": {
      "percent": 62.15,
      "used": 159.5,
      "total": 256.0,
      "status": "normal"
    },
    "overall": {
      "status": "normal",
      "threshold": {
        "cpu": 85,
        "memory": 85
      }
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Levels:**
- `normal`: Resource usage < 70%
- `warning`: Resource usage 70-85%
- `high`: Resource usage > 85%

**Notes:**
- CPU and memory percentages are calculated over a brief monitoring period
- Overall status is `high` if either CPU or memory exceeds 85%

---

## GraphQL Endpoint

### POST /graphql

Execute GraphQL queries and mutations. This is the main GraphQL API endpoint.

**Middleware:**
- `validate()` - Validates GraphQL request structure
- `rateLimit({ windowMs: 60000, max: 100 })` - Rate limiting (100 requests per minute)

**Request Body:**

```json
{
  "query": "query { ... }",
  "variables": {},
  "operationName": "MyQuery"
}
```

**Example Request:**

```bash
POST /graphql
Content-Type: application/json

{
  "query": "query GetShop($domain: String!) { shopExists(domain: $domain) }",
  "variables": {
    "domain": "shop.myshopify.com"
  },
  "operationName": "GetShop"
}
```

**Example Response (Success):**

```json
{
  "statusCode": 200,
  "body": {
    "data": {
      "shopExists": true
    }
  }
}
```

**Example Response (Error):**

```json
{
  "statusCode": 200,
  "body": {
    "data": null,
    "errors": [
      {
        "message": "An error occurred while processing your request",
        "extensions": {
          "code": "INTERNAL_ERROR",
          "timestamp": "2024-01-15T10:30:00.000Z"
        }
      }
    ]
  }
}
```

**Notes:**
- GraphQL always returns HTTP 200, even for errors
- Errors are included in the response body
- Development mode includes detailed error information
- Production mode hides internal error details

---

## Common Patterns

### Option Handle Filtering

Option handles are dynamically generated short identifiers (e.g., `ef4gd`, `sd5d3s`) used in URLs for cleaner, SEO-friendly filtering. They are automatically mapped to option names (e.g., `Color`, `Size`) based on active filter configuration.

**How It Works:**
1. Filter configuration defines option handles for each option
2. Handles are collection/page-specific when `cpid` is provided
3. Handles are resolved to option names server-side
4. Multiple values can be passed as comma-separated: `ef4gd=red,blue`

**Example:**
- URL: `/storefront/products?shop=shop.myshopify.com&ef4gd=red&sd5d3s=large`
- Internal mapping: 
  - `ef4gd` → `Color`
  - `sd5d3s` → `Size`
- Filter applied: 
  ```json
  {
    "options": {
      "Color": ["red"],
      "Size": ["large"]
    }
  }
  ```

**Multiple Values:**
```bash
# Filter for multiple colors
GET /storefront/products?shop=shop.myshopify.com&ef4gd=red,blue,green

# Filter for multiple options
GET /storefront/products?shop=shop.myshopify.com&ef4gd=red&sd5d3s=large,xl
```

**Collection/Page-Specific Handles:**
```bash
# Handles are resolved based on collection/page context
GET /storefront/products?shop=shop.myshopify.com&collection=gid://shopify/Collection/123&cpid=page-123&ef4gd=red
```

### Comma-Separated Values

Many filter parameters accept comma-separated values:

```bash
GET /storefront/products?shop=shop.myshopify.com&vendor=Nike,Adidas&tag=sale,new
```

### Price Range Filtering

Use `priceMin` / `priceMax`:

```bash
GET /storefront/products?shop=shop.myshopify.com&priceMin=10&priceMax=100
```

### Preserve Filter Aggregations

To maintain filter counts even when a filter is applied (prevents counts from "jumping"):

**Keep specific filters by handle:**
```bash
GET /storefront/products?shop=shop.myshopify.com&ef4gd=red&keep=ef4gd,sd5d3s
```

**Preserve all option aggregations:**
```bash
GET /storefront/products?shop=shop.myshopify.com&ef4gd=red&preserveOptionAggregations=true
```

**How It Works:**
- By default, when you apply a filter (e.g., `ef4gd=red`), that filter's counts are excluded from aggregations
- Using `keep=ef4gd` tells the server to include that filter's aggregations even though it's applied
- This is useful for showing "selected" states in UI where you want to show the count of the selected option
- The `/storefront/filters` endpoint automatically uses per-filter aggregation queries to prevent count jumping

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `202` - Accepted (async operation started)
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (operation already in progress)
- `422` - Unprocessable Entity (validation error)
- `500` - Internal Server Error
- `503` - Service Unavailable (degraded health)

---

## Rate Limiting

All endpoints implement rate limiting to prevent abuse:

- **Storefront endpoints**: Default rate limit
- **Reindex endpoint**: 5 requests per minute
- **App events endpoint**: 60 requests per minute
- **GraphQL endpoint**: 100 requests per minute

Rate limit exceeded responses:

```json
{
  "success": false,
  "message": "Too many requests",
  "statusCode": 429
}
```

---

## Authentication & Authorization

**Public Endpoints (No Authentication Required):**
- `/storefront/*` - All storefront endpoints (products, filters, search)
- `/system/health` - Health check endpoint

**Protected Endpoints (Authentication Required):**
- `/graphql` - GraphQL endpoint (uses HMAC-SHA256 authentication if configured)
- `/admin/*` - Admin endpoints (reindex, etc.)
- `/app/events` - App lifecycle events

**Authentication:**
- Storefront endpoints: **No authentication** - designed for public use
- Protected endpoints: Use HMAC-SHA256 authentication (see `AUTHENTICATION.md` for details)
- **All environments require valid API keys** - no development bypass available

**Shop Domain Validation:**
- All storefront endpoints require valid `shop` parameter
- Shop domain is validated and normalized automatically

---

## Caching

- Filter aggregations leverage cache populated by product requests
- Storefront filters endpoint hits cache from products endpoint for optimal performance
- Cache is automatically managed by the application

---

## Version Information

API version information is available in the `/system/status` endpoint response.

---

---

## Recent Updates

### Filter Configuration & Option Handles
- **Option handles** are now collection/page-aware when `cpid` parameter is provided
- Filter configuration is automatically matched by collection priority
- Per-filter aggregation queries prevent count "jumping" when filters are applied
- Filter aggregations respect filter configuration settings (position, targetScope, published status)

### Search Endpoint
- New `/storefront/search` endpoint optimized for autocomplete and suggestions
- Returns minimal product data for fast response times
- Supports semantic search and typo tolerance
- Maximum 10 results for optimal performance

### Authentication
- Storefront endpoints remain **public** (no authentication required)
- Protected endpoints support HMAC-SHA256 authentication
- **Valid API keys required in all environments** - no development bypass

---

*Last Updated: 2026-01-12*


