# Shop GraphQL Mutations - Postman Examples

Complete examples for testing Shop mutations using Postman with the GraphQL endpoint.

## Endpoint

```
POST /graphql
```

## Headers

```
Content-Type: application/json
```

---

## 1. Create Shop (Install)

Creates a new shop or updates if exists (upsert).

### Query

```graphql
mutation CreateShop($input: CreateShopInput!) {
  createShop(input: $input) {
    shop
    isActive
    installedAt
    lastAccessed
    scopes
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

### Variables

```json
{
  "input": {
    "shop": "example.myshopify.com",
    "accessToken": "shpat_abc123def456",
    "refreshToken": "refresh_token_xyz789",
    "scopes": ["read_products", "write_products", "read_orders"],
    "isActive": true,
    "installedAt": "2024-01-15T10:30:00.000Z",
    "lastAccessed": "2024-01-15T10:30:00.000Z",
    "metadata": {
      "shopId": "12345678",
      "currencyCode": "USD",
      "email": "shop@example.com"
    },
    "locals": {
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  }
}
```

### Postman Request Body

```json
{
  "query": "mutation CreateShop($input: CreateShopInput!) { createShop(input: $input) { shop isActive installedAt lastAccessed scopes metadata { shopId currencyCode email } locals { ip userAgent } } }",
  "variables": {
    "input": {
      "shop": "example.myshopify.com",
      "accessToken": "shpat_abc123def456",
      "refreshToken": "refresh_token_xyz789",
      "scopes": ["read_products", "write_products"],
      "isActive": true,
      "installedAt": "2024-01-15T10:30:00.000Z",
      "lastAccessed": "2024-01-15T10:30:00.000Z",
      "metadata": {
        "shopId": "12345678",
        "currencyCode": "USD",
        "email": "shop@example.com"
      },
      "locals": {
        "ip": "192.168.1.100",
        "userAgent": "Mozilla/5.0"
      }
    }
  }
}
```

### Expected Response

```json
{
  "data": {
    "createShop": {
      "shop": "example.myshopify.com",
      "isActive": true,
      "installedAt": "2024-01-15T10:30:00.000Z",
      "lastAccessed": "2024-01-15T10:30:00.000Z",
      "scopes": ["read_products", "write_products"],
      "metadata": {
        "shopId": "12345678",
        "currencyCode": "USD",
        "email": "shop@example.com"
      },
      "locals": {
        "ip": "192.168.1.100",
        "userAgent": "Mozilla/5.0"
      }
    }
  },
  "extensions": {
    "requestId": "req_1234567890_abc123",
    "executionTime": "15ms"
  }
}
```

**Note:** `accessToken` and `refreshToken` are saved to Elasticsearch but not returned in the response (filtered as sensitive fields).

---

## 2. Update Shop (Uninstall)

Updates an existing shop, typically used for uninstall events.

### Query

```graphql
mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
  updateShop(domain: $domain, input: $input) {
    shop
    isActive
    uninstalledAt
    updatedAt
    lastAccessed
  }
}
```

### Variables

```json
{
  "domain": "example.myshopify.com",
  "input": {
    "isActive": false,
    "uninstalledAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z",
    "lastAccessed": "2024-01-15T11:00:00.000Z"
  }
}
```

### Postman Request Body

```json
{
  "query": "mutation UpdateShop($domain: String!, $input: UpdateShopInput!) { updateShop(domain: $domain, input: $input) { shop isActive uninstalledAt updatedAt lastAccessed } }",
  "variables": {
    "domain": "example.myshopify.com",
    "input": {
      "isActive": false,
      "uninstalledAt": "2024-01-15T11:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z",
      "lastAccessed": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

### Expected Response

```json
{
  "data": {
    "updateShop": {
      "shop": "example.myshopify.com",
      "isActive": false,
      "uninstalledAt": "2024-01-15T11:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z",
      "lastAccessed": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

---

## 3. Update Shop (Reinstall)

Updates shop to mark as reinstalled.

### Query

```graphql
mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
  updateShop(domain: $domain, input: $input) {
    shop
    isActive
    installedAt
    reinstalledAt
    updatedAt
  }
}
```

### Postman Request Body

```json
{
  "query": "mutation UpdateShop($domain: String!, $input: UpdateShopInput!) { updateShop(domain: $domain, input: $input) { shop isActive installedAt reinstalledAt updatedAt } }",
  "variables": {
    "domain": "example.myshopify.com",
    "input": {
      "isActive": true,
      "reinstalledAt": "2024-01-16T09:00:00.000Z",
      "updatedAt": "2024-01-16T09:00:00.000Z"
    }
  }
}
```

---

## 4. Update Shop (Update Last Accessed)

Updates the last accessed timestamp.

### Query

```graphql
mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
  updateShop(domain: $domain, input: $input) {
    shop
    lastAccessed
    updatedAt
  }
}
```

### Postman Request Body

```json
{
  "query": "mutation UpdateShop($domain: String!, $input: UpdateShopInput!) { updateShop(domain: $domain, input: $input) { shop lastAccessed updatedAt } }",
  "variables": {
    "domain": "example.myshopify.com",
    "input": {
      "lastAccessed": "2024-01-15T12:30:00.000Z",
      "updatedAt": "2024-01-15T12:30:00.000Z"
    }
  }
}
```

---

## 5. Update Shop (Update Scopes)

Updates OAuth scopes for a shop.

### Query

```graphql
mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
  updateShop(domain: $domain, input: $input) {
    shop
    scopes
    updatedAt
  }
}
```

### Postman Request Body

```json
{
  "query": "mutation UpdateShop($domain: String!, $input: UpdateShopInput!) { updateShop(domain: $domain, input: $input) { shop scopes updatedAt } }",
  "variables": {
    "domain": "example.myshopify.com",
    "input": {
      "scopes": ["read_products", "write_products", "read_orders", "write_orders"],
      "updatedAt": "2024-01-15T13:00:00.000Z"
    }
  }
}
```

---

## 6. Update Shop (Update Tokens)

Updates access token and refresh token.

### Query

```graphql
mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
  updateShop(domain: $domain, input: $input) {
    shop
    updatedAt
  }
}
```

### Postman Request Body

```json
{
  "query": "mutation UpdateShop($domain: String!, $input: UpdateShopInput!) { updateShop(domain: $domain, input: $input) { shop updatedAt } }",
  "variables": {
    "domain": "example.myshopify.com",
    "input": {
      "accessToken": "shpat_new_token_123",
      "refreshToken": "refresh_new_token_456",
      "updatedAt": "2024-01-15T14:00:00.000Z"
    }
  }
}
```

**Note:** Tokens are saved but not returned in response.

---

## 7. Delete Shop

Permanently deletes a shop from Elasticsearch.

### Query

```graphql
mutation DeleteShop($domain: String!) {
  deleteShop(domain: $domain)
}
```

### Postman Request Body

```json
{
  "query": "mutation DeleteShop($domain: String!) { deleteShop(domain: $domain) }",
  "variables": {
    "domain": "example.myshopify.com"
  }
}
```

### Expected Response

```json
{
  "data": {
    "deleteShop": true
  }
}
```

---

## Postman Setup Instructions

### 1. Create New Request

- Method: `POST`
- URL: `http://localhost:3000/graphql` (or your server URL)

### 2. Set Headers

```
Content-Type: application/json
```

### 3. Set Body

- Select: `raw`
- Format: `JSON`
- Paste the request body from examples above

### 4. Send Request

Click "Send" to execute the mutation.

---

## Common Use Cases

### APP_INSTALLED Event

Use **Create Shop** mutation with all installation data:
- `shop` (domain)
- `accessToken`
- `refreshToken`
- `scopes`
- `isActive: true`
- `installedAt` (timestamp)
- `metadata`
- `locals`

### APP_UNINSTALLED Event

Use **Update Shop** mutation to mark as uninstalled:
- `isActive: false`
- `uninstalledAt` (timestamp)

### Token Refresh

Use **Update Shop** mutation to update tokens:
- `accessToken` (new token)
- `refreshToken` (new refresh token)

### Scope Update

Use **Update Shop** mutation to update scopes:
- `scopes` (new array of scopes)

---

## Error Responses

### Shop Not Found (Update/Delete)

```json
{
  "data": {
    "updateShop": null
  },
  "errors": [
    {
      "message": "Shop not found",
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ]
}
```

### Validation Error

```json
{
  "errors": [
    {
      "message": "Field 'shop' is required",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "field": "shop"
      }
    }
  ]
}
```

---

## Notes

1. **Sensitive Fields**: `accessToken` and `refreshToken` are saved to ES but filtered from responses
2. **Document ID**: Shop domain is used as the Elasticsearch document ID
3. **Upsert**: `createShop` creates if doesn't exist, updates if exists
4. **Timestamps**: Use ISO 8601 format (e.g., `2024-01-15T10:30:00.000Z`)
5. **Metadata/Locals**: Use JSON objects for nested data

---

## Quick Test in Postman

**Minimal Create Shop Example:**

```json
{
  "query": "mutation { createShop(input: { shop: \"test.myshopify.com\", isActive: true }) { shop isActive installedAt } }"
}
```

This creates a shop with minimal data - all other fields are optional.

