# GraphQL Implementation Documentation

## Overview

This document defines the architecture, patterns, and rules for implementing GraphQL API in the application. The GraphQL layer serves as the API gateway for the dashboard UI, routing queries to appropriate module services while maintaining clean separation of concerns.

---

## Architecture Principles

### 1. Module-Based Structure
- GraphQL is implemented as a **module** (`modules/graphql/`)
- Follows the same patterns as other modules (products, indexing, shops)
- Uses factory pattern for dependency injection
- Integrates with existing bootstrap system

### 2. Separation of Concerns
- **GraphQL Module**: API layer, schema definitions, resolvers
- **Business Modules**: Pure business logic, no GraphQL knowledge
- **Repositories**: Data access layer, ES queries
- Clear boundaries between layers

### 3. Service Injection Pattern
- Module services are created in bootstrap
- Services are injected into request context
- Resolvers access services via `req.{module}Service`
- No direct dependencies between GraphQL and business modules

---

## Module Structure

### GraphQL Module Organization

```
modules/graphql/
├── route.config.ts              # Route prefix: '/graphql'
├── routes/
│   └── index.ts                  # POST /graphql endpoint handler
├── graphql.factory.ts            # Module factory (dependency injection)
├── graphql.service.ts            # GraphQL execution service
├── graphql.type.ts               # GraphQL-specific TypeScript types
├── graphql.helper.ts             # GraphQL utilities
├── schema/
│   ├── index.ts                  # Combined schema (exports all)
│   ├── filters.schema.ts         # Filter types & operations
│   ├── settings.schema.ts        # Settings types & operations
│   ├── translations.schema.ts    # Translation types & operations
│   ├── plans.schema.ts           # Plans types & operations
│   ├── metadata.schema.ts        # Metadata types & operations
│   └── themes.schema.ts          # Theme types & operations
└── resolvers/
    ├── index.ts                  # Combined resolvers (exports all)
    ├── filters.resolvers.ts      # Filter resolvers
    ├── settings.resolvers.ts     # Settings resolvers
    ├── translations.resolvers.ts # Translation resolvers
    ├── plans.resolvers.ts        # Plans resolvers
    ├── metadata.resolvers.ts     # Metadata resolvers
    └── themes.resolvers.ts       # Theme resolvers
```

---

## File Naming Conventions

### Module Files
- `graphql.factory.ts` - Factory function (follows existing pattern)
- `graphql.service.ts` - Service class (follows existing pattern)
- `graphql.type.ts` - TypeScript types (follows existing pattern)
- `graphql.helper.ts` - Utility functions (follows existing pattern)

### Schema Files
- `{module-name}.schema.ts` - GraphQL schema definitions
- Use kebab-case for file names
- One schema file per business domain

### Resolver Files
- `{module-name}.resolvers.ts` - GraphQL resolvers
- Use kebab-case for file names
- One resolver file per business domain

### Route Files
- `routes/index.ts` - Single GraphQL endpoint
- Follows existing route handler pattern

---

## Implementation Rules

### Rule 1: Route Configuration
- **File**: `route.config.ts`
- **Export**: `routePrefix = '/graphql'`
- **Purpose**: Defines the GraphQL endpoint URL
- **Pattern**: Follows existing module route config pattern

### Rule 2: Route Handler
- **File**: `routes/index.ts`
- **Method**: `POST` only (GraphQL standard)
- **Pattern**: Use `handler()` wrapper (existing pattern)
- **Middleware**: Authentication, authorization, rate limiting
- **Response**: Standard GraphQL response format

### Rule 3: Factory Pattern
- **File**: `graphql.factory.ts`
- **Function**: `createGraphQLModule(dependencies)`
- **Dependencies**: 
  - `esClient: Client` (Elasticsearch client)
  - Module services (filtersService, settingsService, etc.)
- **Returns**: `{ service, server }`
- **Purpose**: Creates and wires GraphQL server with dependencies

### Rule 4: Service Layer
- **File**: `graphql.service.ts`
- **Class**: `GraphQLService`
- **Methods**:
  - `executeQuery(query: string, variables: any, context: any)`
  - `executeMutation(mutation: string, variables: any, context: any)`
- **Purpose**: Handles GraphQL execution, error transformation

### Rule 5: Schema Organization
- **Location**: `schema/` directory
- **Naming**: `{domain}.schema.ts`
- **Structure**: 
  - Type definitions
  - Query definitions
  - Mutation definitions
  - Input types
- **Combination**: All schemas combined in `schema/index.ts`

### Rule 6: Resolver Organization
- **Location**: `resolvers/` directory
- **Naming**: `{domain}.resolvers.ts`
- **Structure**:
  - Query resolvers
  - Mutation resolvers
  - Field resolvers (if needed)
- **Combination**: All resolvers combined in `resolvers/index.ts`

### Rule 7: Resolver Implementation
- **Access Services**: Via `context.req.{module}Service`
- **No Direct ES Access**: Resolvers call services, not repositories
- **Error Handling**: Transform business errors to GraphQL errors
- **Validation**: Use service layer validation, not resolver validation

### Rule 8: Type Definitions
- **File**: `graphql.type.ts`
- **Purpose**: GraphQL-specific TypeScript types
- **Includes**:
  - Context types
  - GraphQL request/response types
  - Resolver types

---

## Bootstrap Integration

### Module Creation Order
1. Initialize Elasticsearch client
2. Create business modules (filters, settings, etc.)
3. Create GraphQL module (passes business module services)
4. Inject all services into request context
5. Load routes (auto-discovers GraphQL module)

### Service Injection Pattern
```typescript
// In bootstrap/main.ts
app.use((req: any, res, next) => {
  // Business module services
  req.filtersService = filtersModule.service;
  req.settingsService = settingsModule.service;
  req.productsService = productsModule.service;
  
  // GraphQL service (optional, if needed)
  req.graphqlService = graphqlModule.service;
  
  next();
});
```

### Factory Dependencies
```typescript
// GraphQL module factory receives:
createGraphQLModule({
  esClient,
  filtersService: filtersModule.service,
  settingsService: settingsModule.service,
  productsService: productsModule.service,
  // ... other module services
})
```

---

## Schema Definition Rules

### Rule 1: Type Naming
- **Types**: `PascalCase` (e.g., `Filter`, `AppSettings`)
- **Queries**: `camelCase` (e.g., `filters`, `appSettings`)
- **Mutations**: `camelCase` with verb (e.g., `createFilter`, `updateSettings`)
- **Input Types**: Suffix with `Input` (e.g., `CreateFilterInput`)

### Rule 2: Schema Structure
```graphql
# Type definition
type Filter {
  id: ID!
  name: String!
  status: FilterStatus!
  # ... other fields
}

# Query definition
type Query {
  filters(shop: String!, limit: Int, offset: Int): [Filter!]!
  filter(id: ID!): Filter
}

# Mutation definition
type Mutation {
  createFilter(input: CreateFilterInput!): Filter!
  updateFilter(id: ID!, input: UpdateFilterInput!): Filter!
  deleteFilter(id: ID!): Boolean!
}

# Input type
input CreateFilterInput {
  name: String!
  description: String
  # ... other fields
}

# Enum type
enum FilterStatus {
  ACTIVE
  INACTIVE
  DRAFT
}
```

### Rule 3: Required Fields
- Use `!` for required fields
- Use `[Type!]!` for required arrays of required items
- Use `[Type]` for optional arrays

### Rule 4: Pagination Pattern
```graphql
type Query {
  filters(
    shop: String!
    limit: Int = 10
    offset: Int = 0
    sortBy: String
    sortOrder: SortOrder = ASC
  ): FilterConnection!
}

type FilterConnection {
  items: [Filter!]!
  total: Int!
  limit: Int!
  offset: Int!
  hasMore: Boolean!
}

enum SortOrder {
  ASC
  DESC
}
```

---

## Resolver Implementation Rules

### Rule 1: Resolver Structure
```typescript
export const resolvers = {
  Query: {
    filters: async (parent, args, context) => {
      const { req } = context;
      return req.filtersService.getFilters(args.shop, {
        limit: args.limit,
        offset: args.offset,
      });
    },
  },
  Mutation: {
    createFilter: async (parent, args, context) => {
      const { req } = context;
      return req.filtersService.createFilter(args.input);
    },
  },
};
```

### Rule 2: Context Access
- **Always use**: `context.req.{module}Service`
- **Never**: Direct repository access
- **Never**: Direct ES client access
- **Purpose**: Maintains separation of concerns

### Rule 3: Error Handling
```typescript
try {
  return await req.filtersService.getFilters(args.shop);
} catch (error) {
  // Transform business error to GraphQL error
  throw new GraphQLError(error.message, {
    extensions: {
      code: error.code || 'INTERNAL_ERROR',
      details: error.details,
    },
  });
}
```

### Rule 4: Input Validation
- **Service Layer**: Handles business validation
- **Resolvers**: Pass inputs directly to services
- **GraphQL Schema**: Provides type validation
- **No Duplication**: Don't validate in resolvers if service validates

### Rule 5: Authentication & Authorization
- **Middleware**: Handles authentication (JWT, etc.)
- **Context**: Contains user/shop information
- **Resolvers**: Check permissions if needed
- **Services**: Can also check permissions

---

## Security Rules

### Rule 1: Authentication
- **Required**: All GraphQL queries/mutations require authentication
- **Middleware**: JWT validation in route middleware
- **Context**: User info available in `context.req.user`

### Rule 2: Authorization
- **Role-Based**: Check user roles in resolvers or middleware
- **Shop Isolation**: Always filter by shop (multi-tenancy)
- **Resource-Level**: Check permissions for specific resources

### Rule 3: Input Validation
- **Schema Validation**: GraphQL schema provides type validation
- **Business Validation**: Service layer validates business rules
- **Sanitization**: Sanitize inputs before passing to services

### Rule 4: Rate Limiting
- **Middleware**: Apply rate limiting to GraphQL endpoint
- **Per-User**: Limit based on authenticated user
- **Per-Operation**: Different limits for queries vs mutations

### Rule 5: Query Complexity
- **Limit Depth**: Prevent deeply nested queries
- **Limit Fields**: Limit number of fields per query
- **Cost Analysis**: Analyze query cost before execution

---

## Error Handling Rules

### Rule 1: Error Types
- **GraphQLError**: GraphQL-specific errors
- **Business Errors**: Transformed to GraphQL errors
- **Validation Errors**: Field-level error details
- **System Errors**: Generic internal errors

### Rule 2: Error Format
```typescript
{
  errors: [
    {
      message: "Error message",
      extensions: {
        code: "ERROR_CODE",
        field: "fieldName", // For validation errors
        details: {} // Additional error details
      }
    }
  ],
  data: null // or partial data
}
```

### Rule 3: Error Codes
- `VALIDATION_ERROR` - Input validation failed
- `NOT_FOUND` - Resource not found
- `UNAUTHORIZED` - Authentication failed
- `FORBIDDEN` - Authorization failed
- `CONFLICT` - Resource conflict
- `INTERNAL_ERROR` - Server error
- `RATE_LIMIT_EXCEEDED` - Too many requests

### Rule 4: Error Logging
- **Log All Errors**: Log errors with context
- **Don't Expose Internals**: Don't expose internal details in production
- **Include Request ID**: Include request ID for tracing

---

## Testing Rules

### Rule 1: Unit Tests
- **Services**: Test GraphQL service independently
- **Resolvers**: Test resolvers with mocked services
- **Schemas**: Test schema validation

### Rule 2: Integration Tests
- **End-to-End**: Test full GraphQL query flow
- **Module Integration**: Test resolver → service → repository flow
- **Error Scenarios**: Test error handling

### Rule 3: Test Structure
- **Location**: `modules/graphql/__tests__/`
- **Naming**: `*.test.ts` or `*.spec.ts`
- **Coverage**: Test all resolvers, mutations, queries

---

## Best Practices

### 1. Schema Design
- **Start Simple**: Begin with basic queries, add complexity later
- **Use Enums**: Use enums for fixed value sets
- **Document Types**: Add descriptions to types and fields
- **Version Carefully**: Avoid breaking changes

### 2. Resolver Design
- **Keep Thin**: Resolvers should be thin, delegate to services
- **No Business Logic**: Business logic belongs in services
- **Handle Errors**: Always handle errors gracefully
- **Use Async**: All resolvers should be async

### 3. Performance
- **Batch Requests**: Use DataLoader for N+1 query problems
- **Caching**: Cache frequently accessed data
- **Pagination**: Always paginate list queries
- **Field Selection**: Only fetch requested fields

### 4. Maintainability
- **Modular Schemas**: One schema file per domain
- **Modular Resolvers**: One resolver file per domain
- **Clear Naming**: Use clear, descriptive names
- **Documentation**: Document complex queries/mutations

---

## Module Integration Example

### Adding a New Domain (e.g., "Notifications")

1. **Create Business Module** (if not exists):
   ```
   modules/notifications/
   ├── notifications.service.ts
   ├── notifications.repository.ts
   └── notifications.factory.ts
   ```

2. **Update Bootstrap**:
   ```typescript
   const notificationsModule = createNotificationsModule(esClient);
   req.notificationsService = notificationsModule.service;
   ```

3. **Create GraphQL Schema**:
   ```
   modules/graphql/schema/notifications.schema.ts
   ```

4. **Create GraphQL Resolvers**:
   ```
   modules/graphql/resolvers/notifications.resolvers.ts
   ```

5. **Update Schema Index**:
   ```typescript
   // schema/index.ts
   import { notificationsSchema } from './notifications.schema';
   ```

6. **Update Resolver Index**:
   ```typescript
   // resolvers/index.ts
   import { notificationsResolvers } from './notifications.resolvers';
   ```

7. **Update GraphQL Factory**:
   ```typescript
   createGraphQLModule({
     // ... existing services
     notificationsService: notificationsModule.service,
   })
   ```

---

## Migration from REST

### When to Use GraphQL
- **Dashboard UI**: Complex data fetching needs
- **Multiple Resources**: Need to fetch multiple resources in one request
- **Flexible Queries**: Need flexible field selection
- **Real-time Updates**: Need subscriptions (future)

### When to Keep REST
- **Simple CRUD**: Simple create/read/update/delete
- **File Uploads**: File upload operations
- **Webhooks**: External webhook endpoints
- **Public APIs**: Public-facing APIs

### Coexistence
- **Both Can Exist**: GraphQL and REST can coexist
- **Same Services**: Both use same module services
- **Different Endpoints**: Different URL paths
- **Choose Appropriately**: Use best tool for each use case

---

## Checklist for Implementation

### Phase 1: Setup
- [ ] Create `modules/graphql/` directory structure
- [ ] Create `route.config.ts` with `/graphql` prefix
- [ ] Create `graphql.factory.ts` with factory function
- [ ] Create `graphql.service.ts` with execution service
- [ ] Create `graphql.type.ts` with TypeScript types

### Phase 2: Core Infrastructure
- [ ] Create `routes/index.ts` with POST handler
- [ ] Set up GraphQL server in factory
- [ ] Configure middleware (auth, rate limiting)
- [ ] Set up error handling
- [ ] Integrate with bootstrap

### Phase 3: First Domain (Filters)
- [ ] Create `schema/filters.schema.ts`
- [ ] Create `resolvers/filters.resolvers.ts`
- [ ] Create filters module (if not exists)
- [ ] Update schema/resolver indexes
- [ ] Test queries and mutations

### Phase 4: Additional Domains
- [ ] Add settings domain
- [ ] Add translations domain
- [ ] Add plans domain
- [ ] Add metadata domain
- [ ] Add themes domain

### Phase 5: Polish
- [ ] Add comprehensive error handling
- [ ] Add query complexity limits
- [ ] Add caching where appropriate
- [ ] Add documentation
- [ ] Add tests

---

## Common Patterns

### Pattern 1: List Query with Pagination
```graphql
query {
  filters(shop: "example.com", limit: 10, offset: 0) {
    items {
      id
      name
    }
    total
    hasMore
  }
}
```

### Pattern 2: Single Resource Query
```graphql
query {
  filter(id: "123") {
    id
    name
    status
    configuration
  }
}
```

### Pattern 3: Create Mutation
```graphql
mutation {
  createFilter(input: {
    name: "New Filter"
    description: "Filter description"
  }) {
    id
    name
  }
}
```

### Pattern 4: Update Mutation
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

### Pattern 5: Delete Mutation
```graphql
mutation {
  deleteFilter(id: "123")
}
```

---

## Troubleshooting

### Issue: Resolver can't access service
- **Check**: Service injected in bootstrap
- **Check**: Service name matches (`req.{module}Service`)
- **Check**: Context passed correctly to resolvers

### Issue: Schema not loading
- **Check**: Schema exported from `schema/index.ts`
- **Check**: Schema imported in factory
- **Check**: No circular dependencies

### Issue: Resolver not called
- **Check**: Resolver exported from `resolvers/index.ts`
- **Check**: Resolver matches query/mutation name
- **Check**: Schema defines query/mutation

### Issue: Authentication not working
- **Check**: Middleware applied to route
- **Check**: JWT validation in middleware
- **Check**: User context in request

---

## References

- [GraphQL Specification](https://spec.graphql.org/)
- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server/)
- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)

---

## Version History

- **v1.0.0** - Initial GraphQL implementation documentation
- Created: [Current Date]
- Last Updated: [Current Date]

---

## Notes

- This documentation should be updated as patterns evolve
- All implementations must follow these rules
- Exceptions require team approval
- Questions? Refer to this document first

