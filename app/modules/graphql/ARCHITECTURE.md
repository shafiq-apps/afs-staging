# GraphQL ES CRUD Architecture

## Overview

This architecture provides a **centralized Elasticsearch CRUD layer** for all GraphQL operations, eliminating the need for individual module repositories for GraphQL queries and mutations.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    GraphQL Schema                           │
│              (shops.schema.ts, etc.)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Auto-Resolvers                                 │
│         (graphql.auto-resolver.ts)                          │
│  - Automatically generates resolvers from schema            │
│  - Uses centralized ES CRUD functions                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         Centralized ES CRUD Layer                           │
│         (graphql.es-crud.ts)                                │
│  - Unified CRUD interface                                   │
│  - Consistent error handling                                │
│  - Automatic sensitive field filtering                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           ES Service Layer                                  │
│         (graphql.es-service.ts)                             │
│  - Service-level operations                                 │
│  - Sensitive field filtering                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           ES Repository Layer                               │
│         (graphql.es-repository.ts)                          │
│  - Low-level ES operations                                  │
│  - Direct ES client interaction                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         Elasticsearch Client                                │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Auto-Resolvers (`graphql.auto-resolver.ts`)

**Purpose**: Automatically generates GraphQL resolvers from schema definitions.

**How it works**:
- Analyzes GraphQL schema to determine operations (queries, mutations)
- Infers entity types from field names (e.g., `deleteShop` → `Shop`)
- Uses centralized ES service for all operations
- No hardcoded repository dependencies

**Example**:
```typescript
// Schema defines: deleteShop(domain: String!): Boolean!
// Auto-resolver automatically:
// 1. Infers entity type: "Shop"
// 2. Gets ES service for "Shop"
// 3. Extracts "domain" argument
// 4. Calls esService.delete(domain)
```

### 2. Centralized ES CRUD (`graphql.es-crud.ts`)

**Purpose**: Provides a unified, type-safe interface for all ES operations.

**Benefits**:
- ✅ Single source of truth for ES operations
- ✅ Consistent error handling and logging
- ✅ Automatic sensitive field filtering
- ✅ Support for dynamic indexes
- ✅ Type-safe results with error codes

**Usage**:
```typescript
import { esCRUD } from './graphql.es-crud';

// Get service
const service = await esCRUD.getService('Shop', esClient, context, graphqlArgs);

// Perform operations
const result = await esCRUD.getById(service, id);
if (result.success) {
  return result.data;
} else {
  throw new Error(result.error.message);
}
```

### 3. ES Service (`graphql.es-service.ts`)

**Purpose**: Service layer that handles business logic and sensitive field filtering.

**Features**:
- Automatic sensitive field filtering (e.g., `accessToken`, `refreshToken`)
- Service-level caching and optimization
- Consistent API across all entity types

### 4. ES Repository (`graphql.es-repository.ts`)

**Purpose**: Low-level Elasticsearch operations.

**Features**:
- Direct ES client interaction
- Index management
- Query building
- Error handling

## When to Use Module Repositories

### ❌ DON'T Use Module Repositories For:
- GraphQL queries and mutations
- Standard CRUD operations
- Operations that can be auto-resolved

### ✅ DO Use Module Repositories For:
- **Non-GraphQL operations**: OAuth flows, webhooks, background jobs
- **Business logic**: Complex operations that require multiple steps
- **External API integration**: Shopify Admin API calls, third-party services
- **Specialized operations**: Operations that don't fit the standard CRUD pattern

### Example: ShopsRepository Usage

**Keep for**:
```typescript
// OAuth installation flow
async saveShop(input: CreateShopInput): Promise<Shop> {
  // Business logic: set defaults, validate, etc.
  // Then use ES directly or call centralized CRUD
}

// Shopify Admin API integration
async getShopAccessToken(shop: string): Promise<string> {
  // Uses ShopsRepository to get shop data
  // Then uses Shopify Admin API
}
```

**Remove for**:
```typescript
// GraphQL operations - use auto-resolvers instead
// ❌ async getShop(shop: string): Promise<Shop | null>
// ✅ Auto-resolved via: shop(domain: String!): Shop

// ❌ async deleteShop(shop: string): Promise<void>
// ✅ Auto-resolved via: deleteShop(domain: String!): Boolean!
```

## Migration Guide

### Step 1: Identify GraphQL Operations

Check your module repository for methods that:
- Are called only from GraphQL resolvers
- Perform standard CRUD operations
- Don't contain complex business logic

### Step 2: Remove from Repository

Remove GraphQL-specific methods from module repositories:

```typescript
// Before (shops.repository.ts)
export class ShopsRepository {
  async getShop(shop: string): Promise<Shop | null> { ... }
  async deleteShop(shop: string): Promise<void> { ... }
  async updateShop(shop: string, updates: UpdateShopInput): Promise<Shop | null> { ... }
}

// After - Keep only non-GraphQL operations
export class ShopsRepository {
  // Keep: OAuth, business logic, external API calls
  async saveShop(input: CreateShopInput): Promise<Shop> { ... }
  async recordShopAccess(shop: string): Promise<void> { ... }
  
  // Remove: GraphQL operations (handled by auto-resolvers)
}
```

### Step 3: Verify Auto-Resolvers

Ensure your GraphQL schema is properly defined:

```graphql
type Query {
  shop(domain: String!): Shop
  shopExists(domain: String!): Boolean!
}

type Mutation {
  createShop(input: CreateShopInput!): Shop!
  updateShop(domain: String!, input: UpdateShopInput!): Shop
  deleteShop(domain: String!): Boolean!
}
```

Auto-resolvers will automatically handle these operations.

### Step 4: Update Non-GraphQL Code

If you have non-GraphQL code that uses repository methods:

```typescript
// Option 1: Use centralized CRUD
import { esCRUD } from '@modules/graphql/graphql.es-crud';

const service = await esCRUD.getService('Shop', esClient, context);
const result = await esCRUD.getById(service, shop);

// Option 2: Keep repository for complex business logic
// (e.g., OAuth flows, Shopify API integration)
```

## Best Practices

### 1. Schema-First Development

Define your GraphQL schema first, then let auto-resolvers handle the implementation:

```graphql
type Shop {
  shop: String!
  isActive: Boolean
  # ... other fields
}

type Query {
  shop(domain: String!): Shop
}

type Mutation {
  deleteShop(domain: String!): Boolean!
}
```

### 2. Use Index Configuration

Configure indexes in schema comments:

```graphql
# @index shops idField=shop sensitiveFields=accessToken,refreshToken
type Shop {
  shop: String!
  # ...
}
```

### 3. Keep Repositories for Business Logic

Module repositories should focus on:
- Complex multi-step operations
- External API integration
- Domain-specific business rules
- Operations that don't map to standard CRUD

### 4. Use CRUD Utilities for Custom Resolvers

If you need custom resolvers, use the centralized CRUD:

```typescript
import { esCRUD } from '@modules/graphql/graphql.es-crud';

const customResolver = async (parent, args, context) => {
  const service = await esCRUD.getService('Shop', context.esClient, context, args);
  const result = await esCRUD.getById(service, args.domain);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }
  
  return result.data;
};
```

## Benefits of This Architecture

1. **Reduced Code Duplication**: No need to write CRUD methods for each module
2. **Consistency**: All operations use the same error handling and logging
3. **Maintainability**: Changes to ES operations happen in one place
4. **Type Safety**: Centralized CRUD provides type-safe results
5. **Automatic Features**: Sensitive field filtering, dynamic indexes, etc.
6. **Schema-Driven**: GraphQL schema is the single source of truth

## Example: Complete Flow

### 1. GraphQL Request
```graphql
mutation {
  deleteShop(domain: "example.myshopify.com")
}
```

### 2. Auto-Resolver Processing
```typescript
// graphql.auto-resolver.ts
// 1. Detects: deleteShop mutation
// 2. Infers entity type: "Shop" (from "deleteShop")
// 3. Gets ES service for "Shop"
// 4. Extracts argument: domain = "example.myshopify.com"
// 5. Calls: esService.delete("example.myshopify.com")
```

### 3. ES Service
```typescript
// graphql.es-service.ts
// 1. Receives delete request
// 2. Calls repository.delete()
// 3. Returns boolean result
```

### 4. ES Repository
```typescript
// graphql.es-repository.ts
// 1. Executes ES delete operation
// 2. Handles 404 errors gracefully
// 3. Returns success/failure
```

### 5. Response
```json
{
  "data": {
    "deleteShop": true
  }
}
```

## Summary

- ✅ **Use centralized ES CRUD** for all GraphQL operations
- ✅ **Use auto-resolvers** to automatically generate resolvers from schema
- ✅ **Keep module repositories** only for non-GraphQL business logic
- ✅ **Define schema first**, let auto-resolvers handle implementation
- ❌ **Don't create module repositories** for standard GraphQL CRUD operations

This architecture provides a clean separation of concerns while reducing code duplication and improving maintainability.

