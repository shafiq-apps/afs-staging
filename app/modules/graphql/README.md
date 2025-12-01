# GraphQL Module

**Fully Dynamic GraphQL API with Auto-Generated Resolvers**

Just write your schema - resolvers are automatically generated from Elasticsearch! Zero hardcoded values, zero boilerplate.

---

## 🚀 Quick Start

### Installation

```bash
npm install graphql
```

### Usage

1. **Create Schema** - Write your GraphQL schema
2. **Add to Index** - Import in `schema/index.ts`
3. **Done!** - Resolvers auto-generated, no resolver files needed!

---

## 📝 How It Works

### Fully Dynamic System

The system automatically:
- ✅ Infers ES index names from GraphQL types (`Shop` → `shops`)
- ✅ Generates resolvers from schema definitions
- ✅ Creates ES services dynamically
- ✅ Filters sensitive data automatically
- ✅ Handles all CRUD operations

### Example

**Schema:**
```typescript
// schema/shops.schema.ts
export const shopsSchema = `
  type Shop {
    shop: String!
    isActive: Boolean
    metadata: ShopMetadata
  }

  type Query {
    shop(domain: String!): Shop
    shopExists(domain: String!): Boolean!
  }
`;
```

**Add to Index:**
```typescript
// schema/index.ts
import { shopsSchema } from './shops.schema';
export const schemas = [shopsSchema];
```

**That's It!** The system automatically:
- Creates ES service for `shops` index
- Generates `shop(domain)` resolver → `esService.getByField('domain', domain)`
- Generates `shopExists(domain)` resolver → `esService.existsByField('domain', domain)`
- Filters `accessToken` and `refreshToken` automatically

---

## 🎯 Index Name Inference

The system automatically infers index names:

| GraphQL Type | Auto-Inferred Index |
|--------------|-------------------|
| `Shop` | `shops` |
| `Filter` | `filters` |
| `Setting` | `settings` |
| `Translation` | `translations` |

**Default Rule:** `TypeName` → `lowercase + 's'`

### Custom Index Configuration (Optional)

If you need custom index names:

**Option 1: Schema Annotation**
```graphql
# @index shops idField=shop sensitiveFields=accessToken,refreshToken
type Shop {
  shop: String!
  # ...
}
```

**Option 2: Programmatic**
```typescript
import { configureIndex } from './graphql.index-config';

configureIndex('Shop', {
  index: 'custom-shops-index',
  idField: 'shop',
  sensitiveFields: ['accessToken', 'refreshToken'],
});
```

### Dynamic Indexes (Multi-tenant/Shop-specific)

For dynamic indexes that change based on query arguments (e.g., shop-specific indexes):

```graphql
# @index filters-{shop} idField=id sensitiveFields=internalId,secret
type Filter {
  id: ID!
  name: String!
  shop: String!
}

type Query {
  filters(shop: String!): [Filter!]!
}
```

**How it works:**
- Placeholders like `{shop}` are replaced with actual argument values
- Query: `filters(shop: "example.com")` → Uses index: `filters-example.com`
- Query: `filters(shop: "another.com")` → Uses index: `filters-another.com`
- Services are cached per unique index name

**Multi-parameter example:**
```graphql
# @index products-{shop}-{category}
type Product { ... }

# Query: products(shop: "example.com", category: "electronics")
# Index used: products-example.com-electronics
```

---

## 🔄 Auto-Generated Operations

### Query Patterns

| GraphQL Query | Auto-Generated ES Operation |
|--------------|----------------------------|
| `shop(domain: String!)` | `esService.getByField('domain', domain)` |
| `shop(id: ID!)` | `esService.getById(id)` |
| `shops(shop: String!, limit: Int)` | `esService.list({ shop }, { limit })` |
| `shopExists(domain: String!)` | `esService.existsByField('domain', domain)` |

### Mutation Patterns

| GraphQL Mutation | Auto-Generated ES Operation |
|-----------------|----------------------------|
| `createShop(input: CreateShopInput!)` | `esService.create(input)` |
| `updateShop(id: ID!, input: UpdateShopInput!)` | `esService.update(id, input)` |
| `deleteShop(id: ID!)` | `esService.delete(id)` |

---

## 🔒 Sensitive Data Filtering

Sensitive fields are automatically filtered based on index configuration:

**Default Configuration:**
- `shops` index → filters `accessToken`, `refreshToken`
- `filters` index → filters `internalId`, `secret`

**Custom Configuration:**
```graphql
# @index shops sensitiveFields=accessToken,refreshToken,secretKey
type Shop { ... }
```

---

## 📡 API Endpoint

```
POST /graphql
```

### Request Format

```json
{
  "query": "query GetShop($domain: String!) { shop(domain: $domain) { shop isActive } }",
  "variables": {
    "domain": "example.myshopify.com"
  },
  "operationName": "GetShop"
}
```

### Response Format

```json
{
  "data": {
    "shop": {
      "shop": "example.myshopify.com",
      "isActive": true,
      "metadata": {
        "shopId": "123",
        "currencyCode": "USD"
      }
    }
  },
  "extensions": {
    "requestId": "req_1234567890_abc123",
    "executionTime": "6ms"
  }
}
```

---

## 📚 Complete Example

### Step 1: Create Schema

**Static Index Example:**
```typescript
// schema/filters.schema.ts
export const filtersSchema = `
  # @index filters sensitiveFields=internalId,secret
  type Filter {
    id: ID!
    name: String!
    status: FilterStatus!
    configuration: FilterConfiguration
  }
```

**Dynamic Index Example (Shop-specific):**
```typescript
// schema/filters.schema.ts
export const filtersSchema = `
  # @index filters-{shop} idField=id sensitiveFields=internalId,secret
  type Filter {
    id: ID!
    name: String!
    shop: String!
    status: FilterStatus!
  }

  type Query {
    filters(shop: String!, limit: Int, offset: Int): [Filter!]!
    filter(id: ID!): Filter
    filterExists(id: ID!): Boolean!
  }

  type Mutation {
    createFilter(input: CreateFilterInput!): Filter!
    updateFilter(id: ID!, input: UpdateFilterInput!): Filter!
    deleteFilter(id: ID!): Boolean!
  }
`;
```

### Step 2: Add to Schema Index

```typescript
// schema/index.ts
import { shopsSchema } from './shops.schema';
import { filtersSchema } from './filters.schema';

export const schemas = [
  shopsSchema,
  filtersSchema,
];
```

### Step 3: Done!

The system automatically:
- ✅ Creates ES service for `filters` index
- ✅ Generates all query resolvers
- ✅ Generates all mutation resolvers
- ✅ Filters `internalId` and `secret` fields
- ✅ Handles errors automatically

**No resolver files needed!**

---

## 🛠️ Environment Variables

```env
# GraphQL Configuration (Optional)
GRAPHQL_MAX_DEPTH=10              # Maximum query depth
GRAPHQL_MAX_COMPLEXITY=1000       # Maximum query complexity
GRAPHQL_ENABLE_INTROSPECTION=true # Enable introspection queries
```

---

## 🔐 Security Features

- ✅ **Rate Limiting** - 100 requests/minute by default
- ✅ **Query Complexity Limits** - Prevents DoS attacks
- ✅ **Input Validation** - Validates all inputs
- ✅ **Sensitive Data Filtering** - Automatic field filtering
- ✅ **Request Size Limits** - Prevents large payloads
- ✅ **Error Sanitization** - Hides internal details in production

---

## ⚠️ Error Handling

The system includes comprehensive error handling:

1. **Request Validation** - Validates request structure
2. **Query Validation** - Validates GraphQL syntax
3. **Complexity Checks** - Prevents overly complex queries
4. **Execution Errors** - Catches and formats errors
5. **User-Friendly Messages** - Transforms technical errors
6. **Request Tracking** - Unique ID for each request

### Error Codes

- `VALIDATION_ERROR` - Input validation failed
- `SYNTAX_ERROR` - Invalid GraphQL syntax
- `QUERY_TOO_COMPLEX` - Query exceeds complexity limits
- `SERVICE_UNAVAILABLE` - ES service not available
- `INTERNAL_ERROR` - Internal server error

### Error Response Format

```json
{
  "errors": [
    {
      "message": "Error message",
      "extensions": {
        "code": "ERROR_CODE",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "requestId": "req_1234567890_abc123"
      }
    }
  ]
}
```

---

## 🧪 Testing

### Simple Query

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { shop(domain: \"example.myshopify.com\") { shop isActive } }"
  }'
```

### With Variables

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($domain: String!) { shop(domain: $domain) { shop isActive metadata } }",
    "variables": {
      "domain": "example.myshopify.com"
    }
  }'
```

### Mutation

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: CreateFilterInput!) { createFilter(input: $input) { id name } }",
    "variables": {
      "input": {
        "name": "New Filter",
        "status": "ACTIVE"
      }
    }
  }'
```

---

## 🏗️ Architecture

```
GraphQL Schema
    ↓
Auto-Resolver Generator (Fully Dynamic)
    ↓
ES Service Factory (Dynamic - creates services for any index)
    ↓
ES Repository (Generic - works with any index)
    ↓
Elasticsearch
```

---

## 📋 File Structure

```
modules/graphql/
├── route.config.ts              # Route prefix: '/graphql'
├── routes/
│   └── index.ts                  # POST /graphql endpoint
├── graphql.factory.ts            # Module factory
├── graphql.service.ts             # GraphQL execution service
├── graphql.auto-resolver.ts       # Auto-resolver generator (fully dynamic)
├── graphql.es-repository.ts       # Generic ES repository
├── graphql.es-service.ts          # Generic ES service
├── graphql.es-factory.ts          # ES service factory
├── graphql.index-config.ts        # Index configuration
├── graphql.helper.ts              # Utilities
├── graphql.type.ts                # TypeScript types
├── schema/
│   ├── index.ts                  # Schema aggregator
│   └── shops.schema.ts           # Example schema
└── resolvers/
    └── index.ts                  # Resolver aggregator (usually empty - auto-generated)
```

---

## ✨ Benefits

✅ **Zero Hardcoded Values** - Everything is inferred or configured  
✅ **Fully Dynamic** - Works with any ES index, any schema  
✅ **No Resolver Files** - Just schemas  
✅ **Auto-Filtering** - Sensitive data handled automatically  
✅ **Type-Safe** - GraphQL schema provides types  
✅ **Scalable** - Add new types by just adding schemas  
✅ **Less Code** - 90% less code to write  
✅ **No Complexity** - System handles everything internally  

---

## 🎓 Best Practices

1. **Use Schema Annotations** - Configure indexes in schema comments
2. **Define Sensitive Fields** - Always specify sensitive fields
3. **Use Nested Types** - For complex data structures
4. **Test Queries** - Use GraphQL introspection or tools
5. **Monitor Logs** - Check logs for auto-generated operations

---

## 🔧 Configuration

### Custom Index Names

```typescript
import { configureIndex } from './graphql.index-config';

configureIndex('Shop', {
  index: 'custom-shops-index',
  idField: 'shop',
  sensitiveFields: ['accessToken', 'refreshToken'],
});
```

### Custom Sensitive Fields

```typescript
import { configureSensitiveFields } from './graphql.es-factory';

configureSensitiveFields({
  shops: ['accessToken', 'refreshToken', 'apiKey'],
  filters: ['internalId', 'secret', 'privateKey'],
});
```

---

## 📖 Query Examples

### Get Single Item

```graphql
query {
  shop(domain: "example.myshopify.com") {
    shop
    isActive
    installedAt
    metadata {
      shopId
      currencyCode
    }
  }
}
```

### List with Filters

```graphql
query {
  filters(shop: "example.myshopify.com", limit: 10, offset: 0) {
    id
    name
    status
  }
}
```

### Check Existence

```graphql
query {
  shopExists(domain: "example.myshopify.com")
}
```

### Create

```graphql
mutation {
  createFilter(input: {
    name: "New Filter"
    status: ACTIVE
  }) {
    id
    name
  }
}
```

### Update

```graphql
mutation {
  updateFilter(id: "123", input: {
    name: "Updated Filter"
  }) {
    id
    name
  }
}
```

### Delete

```graphql
mutation {
  deleteFilter(id: "123")
}
```

---

## 🚨 Important Notes

- **No Resolver Files Needed** - Resolvers are auto-generated
- **Sensitive Data Auto-Filtered** - Configure sensitive fields per index
- **Index Names Auto-Inferred** - `TypeName` → `lowercase + 's'`
- **Nested Data Supported** - Metadata and locals return as objects
- **Error Handling** - Comprehensive error handling built-in
- **Request Tracking** - Every request has unique ID

---

## 🐛 Troubleshooting

### Query Returns No Data

- Check if index exists in Elasticsearch
- Verify index name matches inferred name
- Check logs for auto-generated operations

### Method Not Found Error

- Verify ES service was created for the type
- Check index name configuration
- Review logs for service creation

### Sensitive Data Exposed

- Configure sensitive fields in index config
- Use schema annotations: `@index shops sensitiveFields=accessToken`

---

## 📝 Summary

**Just write the schema - the system handles everything else!**

- ✅ No hardcoded service names
- ✅ No hardcoded index names  
- ✅ No hardcoded method names
- ✅ No resolver files
- ✅ Fully dynamic and scalable
- ✅ Zero boilerplate

---

## 🔗 Related Documentation

- See `GRAPHQL_IMPLEMENTATION.md` in project root for architecture details
- GraphQL Spec: https://spec.graphql.org/
