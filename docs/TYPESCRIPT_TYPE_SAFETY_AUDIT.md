# TypeScript Type Safety Audit Report
**Directory:** `/app`  
**Date:** 2024  
**Purpose:** Audit all `any` type usages and propose proper TypeScript types

## Executive Summary

This audit identifies **592 instances** of `any` type usage across the codebase and proposes proper TypeScript types to replace them. All proposed types should be added to appropriate `*.type.ts` files to maintain organized type definitions.

### Categories of `any` Usage:
1. **Error Handling** (50+ instances) - `catch (error: any)`
2. **Elasticsearch Query Types** (100+ instances) - ES query clauses, aggregations, responses
3. **GraphQL Types** (80+ instances) - Resolvers, variables, responses
4. **HTTP/Request Types** (30+ instances) - Request objects, query params
5. **Utility Functions** (40+ instances) - Sanitizers, formatters
6. **Repository Types** (200+ instances) - ES responses, mappings
7. **Index Types** (50+ instances) - Index signatures with `any`
8. **Other** (32+ instances) - Various other contexts

---

## Proposed Type Definitions

### 1. Error Types
**File to create/update:** `app/shared/types/error.type.ts`

#### Proposed Types:
```typescript
/**
 * Base error type for all application errors
 */
export interface AppError extends Error {
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
  details?: unknown;
}

/**
 * Elasticsearch error
 */
export interface ElasticsearchError extends AppError {
  statusCode: number;
  meta?: {
    body?: unknown;
    statusCode?: number;
    headers?: Record<string, string>;
  };
}

/**
 * GraphQL error
 */
export interface GraphQLError extends AppError {
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

/**
 * HTTP error
 */
export interface HttpError extends AppError {
  status: number;
  statusText?: string;
  response?: unknown;
}

/**
 * Type guard to check if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard for Elasticsearch errors
 */
export function isElasticsearchError(error: unknown): error is ElasticsearchError {
  return (
    isError(error) &&
    'statusCode' in error &&
    typeof (error as ElasticsearchError).statusCode === 'number'
  );
}
```

**Usage Replacements:**
- `catch (error: any)` → `catch (error: unknown)`
- Then use type guards: `if (isError(error)) { ... }`

---

### 2. Elasticsearch Query Types
**File to create/update:** `app/shared/types/elasticsearch.type.ts`

#### Proposed Types:
```typescript
/**
 * Elasticsearch query clause types
 */
export type ESQueryClause = 
  | ESTermClause
  | ESTermsClause
  | ESMatchClause
  | ESMatchAllClause
  | ESBoolClause
  | ESRangeClause
  | ESExistsClause
  | ESWildcardClause
  | ESPrefixClause;

export interface ESTermClause {
  term: Record<string, string | number | boolean>;
}

export interface ESTermsClause {
  terms: Record<string, string[] | number[]>;
}

export interface ESMatchClause {
  match: Record<string, string | ESMatchQuery>;
}

export interface ESMatchQuery {
  query: string;
  operator?: 'and' | 'or';
  fuzziness?: string | number;
  prefix_length?: number;
  boost?: number;
}

export interface ESMatchAllClause {
  match_all: Record<string, never>;
}

export interface ESBoolClause {
  bool: {
    must?: ESQueryClause[];
    should?: ESQueryClause[];
    must_not?: ESQueryClause[];
    filter?: ESQueryClause[];
    minimum_should_match?: number | string;
  };
}

export interface ESRangeClause {
  range: Record<string, {
    gte?: number | string;
    lte?: number | string;
    gt?: number | string;
    lt?: number | string;
  }>;
}

export interface ESExistsClause {
  exists: {
    field: string;
  };
}

export interface ESWildcardClause {
  wildcard: Record<string, string>;
}

export interface ESPrefixClause {
  prefix: Record<string, string>;
}

/**
 * Elasticsearch aggregation query
 */
export interface ESAggregationQuery {
  filterType: string;
  query: ESSearchQuery;
  handle?: string;
}

/**
 * Elasticsearch search query structure
 */
export interface ESSearchQuery {
  index: string;
  size?: number;
  from?: number;
  track_total_hits?: boolean | number;
  query: ESQueryClause;
  aggs?: Record<string, ESAggregation>;
  post_filter?: ESQueryClause;
  sort?: ESSortClause[];
}

/**
 * Elasticsearch aggregation
 */
export interface ESAggregation {
  terms?: {
    field: string;
    size?: number;
    order?: Record<string, 'asc' | 'desc'>;
    missing?: string;
  };
  filter?: ESQueryClause;
  aggs?: Record<string, ESAggregation>;
}

/**
 * Elasticsearch sort clause
 */
export type ESSortClause = 
  | Record<string, 'asc' | 'desc' | { order: 'asc' | 'desc'; missing?: string }>
  | string;

/**
 * Elasticsearch multi-search header
 */
export interface ESMsearchHeader {
  index: string;
  preference?: string;
}

/**
 * Elasticsearch multi-search body
 */
export interface ESMsearchBody {
  size?: number;
  track_total_hits?: boolean | number;
  query: ESQueryClause;
  aggs?: Record<string, ESAggregation>;
  post_filter?: ESQueryClause;
}

/**
 * Elasticsearch multi-search request body (alternating header and body)
 */
export type ESMsearchRequestBody = Array<ESMsearchHeader | ESMsearchBody>;

/**
 * Elasticsearch search response
 */
export interface ESSearchResponse<T = unknown> {
  hits: {
    total: number | { value: number; relation: string };
    hits: Array<{
      _id: string;
      _source: T;
      _score?: number;
      sort?: unknown[];
    }>;
  };
  aggregations?: Record<string, ESAggregationResult>;
}

/**
 * Elasticsearch aggregation result
 */
export interface ESAggregationResult {
  buckets?: Array<{
    key: string | number;
    doc_count: number;
  }>;
  doc_count?: number;
  value?: number;
}

/**
 * Elasticsearch multi-search response
 */
export interface ESMsearchResponse<T = unknown> {
  responses: Array<ESSearchResponse<T> | { error?: unknown }>;
}

/**
 * Simple filter mapping for ES queries
 */
export interface ESSimpleFilter {
  field: string;
  values?: string[];
  baseFieldKey: string;
}

export type ESSimpleFilters = Record<string, ESSimpleFilter>;
```

**Usage Replacements:**
- `const mustQueries: any[]` → `const mustQueries: ESQueryClause[]`
- `const aggregationQueries: Array<{ filterType: string; query: any; handle?: string }>` → `const aggregationQueries: ESAggregationQuery[]`
- `const msearchBody: any[]` → `const msearchBody: ESMsearchRequestBody`
- `let msearchResponse: { responses: any[] }` → `let msearchResponse: ESMsearchResponse`
- `const simpleFilters: Record<string, { field: string; values?: any[]; baseFieldKey: string }>` → `const simpleFilters: ESSimpleFilters`

---

### 3. GraphQL Types
**File to update:** `app/modules/graphql/graphql.type.ts`

#### Proposed Types (additions):
```typescript
/**
 * GraphQL resolver function type
 */
export type GraphQLResolver<TSource = unknown, TArgs = Record<string, unknown>, TContext = GraphQLContext, TReturn = unknown> = (
  source: TSource,
  args: TArgs,
  context: TContext,
  info?: unknown
) => TReturn | Promise<TReturn>;

/**
 * GraphQL resolver map
 */
export type GraphQLResolverMap = Record<string, {
  [fieldName: string]: GraphQLResolver | {
    resolve?: GraphQLResolver;
    subscribe?: GraphQLResolver;
  };
}>;

/**
 * GraphQL variables (typed)
 */
export type GraphQLVariables = Record<string, unknown>;

/**
 * GraphQL response data (typed)
 */
export type GraphQLResponseData = Record<string, unknown> | null;

/**
 * GraphQL execution result (typed)
 */
export interface GraphQLExecutionResult {
  data?: GraphQLResponseData;
  errors?: GraphQLError[];
}

/**
 * GraphQL service dependencies (typed)
 */
export interface GraphQLServiceDependencies {
  productsService?: unknown;
  shopsRepository?: unknown;
  filtersRepository?: unknown;
  subscriptionsRepository?: unknown;
  subscriptionPlansRepository?: unknown;
  [key: string]: unknown;
}

/**
 * GraphQL module (typed)
 */
export interface GraphQLModule {
  service: GraphQLService;
  schema: GraphQLSchema;
  resolvers: GraphQLResolverMap;
}

/**
 * GraphQL context with typed request
 */
export interface GraphQLContext {
  req: Request & {
    productsService?: unknown;
    shopsRepository?: unknown;
    filtersRepository?: unknown;
    graphqlService?: unknown;
    subscriptionsRepository?: unknown;
    subscriptionPlansRepository?: unknown;
    esClient?: unknown;
    [key: string]: unknown;
  };
  user?: {
    id: string;
    shop: string;
    role?: string;
    [key: string]: unknown;
  };
}

/**
 * GraphQL request (update existing)
 */
export interface GraphQLRequest {
  query: string;
  variables?: GraphQLVariables;
  operationName?: string;
}

/**
 * GraphQL response (update existing)
 */
export interface GraphQLResponse {
  data?: GraphQLResponseData;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}
```

**Usage Replacements:**
- `resolvers: any` → `resolvers: GraphQLResolverMap`
- `variables?: Record<string, any>` → `variables?: GraphQLVariables`
- `data?: any` → `data?: GraphQLResponseData`
- `parent: any` → `parent: unknown` (or specific type)
- `args: { input: any }` → `args: { input: SpecificInputType }`
- `export const resolvers: any[]` → `export const resolvers: GraphQLResolverMap[]`

---

### 4. HTTP/Request Types
**File to create/update:** `app/core/http/http.types.ts`

#### Proposed Types (additions):
```typescript
/**
 * Extended Express Request with injected services
 */
export interface ExtendedHttpRequest extends Request {
  productsService?: unknown;
  shopsRepository?: unknown;
  filtersRepository?: unknown;
  graphqlService?: unknown;
  subscriptionsRepository?: unknown;
  subscriptionPlansRepository?: unknown;
  esClient?: unknown;
  [key: string]: unknown;
}

/**
 * HTTP query parameters (typed)
 */
export type HttpQueryParams = Record<string, string | string[] | undefined>;

/**
 * HTTP request body (typed)
 */
export type HttpRequestBody = Record<string, unknown> | unknown[] | string | null;

/**
 * HTTP request parameters (typed)
 */
export type HttpRequestParams = Record<string, string>;

/**
 * HTTP response body (typed)
 */
export interface HttpResponseBody {
  success?: boolean;
  message?: string;
  data?: unknown;
  error?: string | unknown;
  [key: string]: unknown;
}
```

**Usage Replacements:**
- `req: any` → `req: ExtendedHttpRequest`
- `req.query as Record<string, any>` → `req.query as HttpQueryParams`
- `const responseBody: any` → `const responseBody: HttpResponseBody`

---

### 5. Utility Function Types
**File to create/update:** `app/shared/types/utility.type.ts`

#### Proposed Types:
```typescript
/**
 * Sanitizable input types
 */
export type SanitizableInput = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined
  | SanitizableObject
  | SanitizableArray;

export interface SanitizableObject {
  [key: string]: SanitizableInput;
}

export type SanitizableArray = SanitizableInput[];

/**
 * Sanitized object result
 */
export type SanitizedObject = Record<string, unknown>;

/**
 * Logger function arguments
 */
export type LogArguments = unknown[];

/**
 * Logger interface (update existing)
 */
export interface Logger {
  debug: (...args: LogArguments) => void;
  info: (...args: LogArguments) => void;
  warn: (...args: LogArguments) => void;
  error: (...args: LogArguments) => void;
  log: (...args: LogArguments) => void;
}

/**
 * Format log result
 */
export type FormattedLog = unknown[];
```

**Usage Replacements:**
- `obj: any` → `obj: SanitizableInput`
- `): any` → `): SanitizedObject`
- `const sanitized: any = {}` → `const sanitized: SanitizedObject = {}`
- `...args: any[]` → `...args: LogArguments`
- `): any[]` → `): FormattedLog`

---

### 6. Repository Types
**File to create/update:** `app/shared/storefront/repository.type.ts`

#### Proposed Types:
```typescript
/**
 * Elasticsearch hit source (for product documents)
 */
export type ESHitSource = shopifyProduct;

/**
 * Elasticsearch hit
 */
export interface ESHit<T = ESHitSource> {
  _id: string;
  _source: T;
  _score?: number;
  sort?: unknown[];
}

/**
 * Storefront repository sort clause
 */
export interface StorefrontSortClause {
  [field: string]: 'asc' | 'desc' | { order: 'asc' | 'desc'; missing?: string };
}

/**
 * Storefront repository query clause
 */
export type StorefrontQueryClause = ESQueryClause;

/**
 * Handle mapping for filter options
 */
export interface HandleMapping {
  handleToBaseField: Record<string, string>;
  baseFieldToHandles: Record<string, string[]>;
  handleToValues: Record<string, string[]>;
  standardFieldToHandles: Record<string, string[]>;
}

/**
 * Sanitized filter input with mapping
 */
export interface SanitizedFilterInputWithMapping extends ProductFilterInput {
  __handleMapping?: HandleMapping;
}
```

**Usage Replacements:**
- `let sort: any[]` → `let sort: StorefrontSortClause[]`
- `(sanitizedFilters as any).__handleMapping` → `(sanitizedFilters as SanitizedFilterInputWithMapping).__handleMapping`
- `const hits = result.hits?.hits?.map((hit: any) => hit._source)` → `const hits = result.hits?.hits?.map((hit: ESHit) => hit._source)`

---

### 7. Filter Configuration Types
**File to create/update:** `app/shared/storefront/filter-config.type.ts`

#### Proposed Types:
```typescript
/**
 * Option settings (from Filter type, but extracted for reuse)
 */
export interface OptionSettings {
  baseOptionType?: string;
  removeSuffix?: string[];
  replaceText?: Array<{ from: string; to: string }>;
  valueNormalization?: Record<string, string>;
  groupBySimilarValues?: boolean;
  removePrefix?: string[];
  filterByPrefix?: string[];
  sortBy?: 'ASCENDING' | 'DESCENDING';
  manualSortedValues?: string[];
  groups?: unknown[];
  menus?: unknown[];
  textTransform?: 'NONE' | 'UPPERCASE' | 'LOWERCASE' | 'CAPITALIZE';
  paginationType?: 'SCROLL' | 'PAGE';
  variantOptionKey?: string;
}

/**
 * Cleaned option settings (minimized for storefront)
 */
export type CleanedOptionSettings = Partial<OptionSettings>;

/**
 * Product display settings
 */
export interface ProductDisplaySettings {
  [key: string]: unknown;
}

/**
 * Pagination settings
 */
export interface PaginationSettings {
  [key: string]: unknown;
}

/**
 * Filter settings (cleaned for storefront)
 */
export interface CleanedFilterSettings {
  displayQuickView?: boolean;
  displayItemsCount?: boolean;
  displayVariantInsteadOfProduct?: boolean;
  defaultView?: string;
  filterOrientation?: string;
  displayCollectionImage?: boolean;
  hideOutOfStockItems?: boolean;
  onLaptop?: boolean;
  onTablet?: boolean;
  onMobile?: boolean;
  productDisplay?: ProductDisplaySettings;
  pagination?: PaginationSettings;
  showFilterCount?: boolean;
  showActiveFilters?: boolean;
  showResetButton?: boolean;
  showClearAllButton?: boolean;
}

/**
 * Cleaned filter option
 */
export interface CleanedFilterOption {
  handle: string;
  position: number;
  label: string;
  optionType: string;
  displayType: string;
  selectionType: string;
  allowedOptions?: string[];
  collapsed?: boolean;
  searchable?: boolean;
  showTooltip?: boolean;
  tooltipContent?: string;
  showCount?: boolean;
  showMenu?: boolean;
  status?: string;
  optionSettings?: CleanedOptionSettings;
}

/**
 * Formatted filter config for storefront
 */
export interface FormattedFilterConfig {
  id: string;
  shop: string;
  title: string;
  description?: string;
  filterType: string;
  targetScope: string;
  allowedCollections?: string[];
  options?: CleanedFilterOption[];
  status: string;
  deploymentChannel: string;
  settings?: CleanedFilterSettings;
  tags?: string[];
  version: number;
  updatedAt?: string | null;
  createdAt: string;
}
```

**Usage Replacements:**
- `function cleanOptionSettings(optionSettings: any): any` → `function cleanOptionSettings(optionSettings: OptionSettings): CleanedOptionSettings`
- `function cleanSettings(settings: any): any` → `function cleanSettings(settings: Filter['settings']): CleanedFilterSettings`
- `export function formatFilterConfigForStorefront(filterConfig: Filter | null): any` → `export function formatFilterConfigForStorefront(filterConfig: Filter | null): FormattedFilterConfig | null`
- `const productDisplay: any = {}` → `const productDisplay: ProductDisplaySettings = {}`
- `const pagination: any = {}` → `const pagination: PaginationSettings = {}`
- `const option: any = {}` → `const option: CleanedFilterOption = {}`

---

### 8. Indexing Types
**File to update:** `app/modules/indexing/indexing.type.ts`

#### Proposed Types (additions):
```typescript
/**
 * Normalized node array (from GraphQL)
 */
export type NormalizedNodeArray<T = unknown> = T[];

/**
 * Media nodes array
 */
export type MediaNodesArray = Array<{
  id?: string;
  url?: string;
  altText?: string;
  [key: string]: unknown;
}>;

/**
 * Indexing batch
 */
export type IndexingBatch<T = unknown> = T[];

/**
 * Indexing body (for bulk operations)
 */
export type IndexingBody = Array<{
  index?: { _index: string; _id: string };
  create?: { _index: string; _id: string };
  update?: { _index: string; _id: string };
  delete?: { _index: string; _id: string };
  doc?: unknown;
}>;

/**
 * Orphaned variants map
 */
export type OrphanedVariantsMap = Map<string, Array<{
  id: string;
  [key: string]: unknown;
}>>;

/**
 * Orphaned images map
 */
export type OrphanedImagesMap = Map<string, Array<{
  id: string;
  url?: string;
  [key: string]: unknown;
}>>;
```

**Usage Replacements:**
- `const normalizeNodeArray = (value: any): any[]` → `const normalizeNodeArray = <T>(value: unknown): NormalizedNodeArray<T>`
- `let mediaNodes: any[]` → `let mediaNodes: MediaNodesArray`
- `let batch: any[]` → `let batch: IndexingBatch`
- `const body: any[]` → `const body: IndexingBody`
- `orphanedVariants.forEach((variants: any[], productId: string)` → `orphanedVariants.forEach((variants: Array<{ id: string; [key: string]: unknown }>, productId: string)`

---

### 9. Subscription Types
**File to update:** `app/modules/subscriptions/subscriptions.type.ts`

#### Proposed Types (additions):
```typescript
/**
 * GraphQL variables for subscriptions
 */
export interface SubscriptionGraphQLVariables {
  query: string;
  variables?: Record<string, unknown>;
}

/**
 * Line items array
 */
export type LineItemsArray = Array<{
  id?: string;
  quantity?: number;
  [key: string]: unknown;
}>;
```

**Usage Replacements:**
- `{ query, variables }: { query: string; variables?: any }` → `{ query, variables }: SubscriptionGraphQLVariables`
- `lineItems: any[]` → `lineItems: LineItemsArray`

---

### 10. Webhook Types
**File to create/update:** `app/modules/webhooks/webhooks.type.ts`

#### Proposed Types:
```typescript
/**
 * Webhook query must clauses
 */
export type WebhookQueryMustClauses = ESQueryClause[];

/**
 * Shopify products array (for reconciliation)
 */
export type ShopifyProductsArray = Array<{
  id: string;
  [key: string]: unknown;
}>;

/**
 * Products to delete array
 */
export type ProductsToDeleteArray = string[];
```

**Usage Replacements:**
- `const must: any[]` → `const must: WebhookQueryMustClauses`
- `const shopifyProducts: any[]` → `const shopifyProducts: ShopifyProductsArray`
- `const productsToDelete: any[]` → `const productsToDelete: ProductsToDeleteArray`

---

### 11. Search Types
**File to update:** `app/shared/search/types.ts`

#### Proposed Types (additions):
```typescript
/**
 * Search config normalization input
 */
export interface SearchConfigInput {
  fields?: Array<{
    name: string;
    weight?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
```

**Usage Replacements:**
- `private normalizeSearchConfig(data: any, documentId?: string): SearchConfig` → `private normalizeSearchConfig(data: SearchConfigInput, documentId?: string): SearchConfig`
- `fields: (data.fields ?? []).map((field: any) => ({` → `fields: (data.fields ?? []).map((field: SearchConfigInput['fields'][0]) => ({`

---

### 12. Validation Types
**File to update:** `app/core/http/validation.schema.ts` and `app/modules/graphql/core/http/validation.schema.ts`

#### Proposed Types:
```typescript
/**
 * Validation schema enum values
 */
export type ValidationEnumValues = Array<string | number>;

/**
 * Validation schema
 */
export interface ValidationSchema {
  query?: Record<string, ValidationFieldSchema>;
  body?: Record<string, ValidationFieldSchema>;
  params?: Record<string, ValidationFieldSchema>;
}

export interface ValidationFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  enum?: ValidationEnumValues;
  min?: number;
  max?: number;
  pattern?: string;
  [key: string]: unknown;
}
```

**Usage Replacements:**
- `enum?: any[]` → `enum?: ValidationEnumValues`
- `query?: Record<string, any>` → `query?: Record<string, ValidationFieldSchema>`

---

### 13. Field Selector Types
**File to create/update:** `app/shared/storefront/field-selector.type.ts`

#### Proposed Types:
```typescript
/**
 * Selected variant fields
 */
export interface SelectedVariantFields {
  [key: string]: unknown;
}

/**
 * Selected product fields
 */
export interface SelectedProductFields {
  [key: string]: unknown;
  variants?: SelectedVariantFields[];
}
```

**Usage Replacements:**
- `const selected: any = {}` → `const selected: SelectedProductFields = {}`
- `const selectedVariant: any = {}` → `const selectedVariant: SelectedVariantFields = {}`
- `product.variants.map((variant: any) =>` → `product.variants.map((variant: productVariant) =>`

---

### 14. GraphQL Factory Types
**File to create/update:** `app/modules/graphql/graphql.factory.type.ts`

#### Proposed Types:
```typescript
/**
 * GraphQL scalar serializer
 */
export interface GraphQLScalarSerializer {
  serialize(value: unknown): unknown;
  parseValue(value: unknown): unknown;
  parseLiteral(ast: unknown): unknown;
}

/**
 * GraphQL resolver arguments
 */
export type GraphQLResolverArgs = unknown[];

/**
 * Default resolvers map
 */
export type DefaultResolversMap = Record<string, GraphQLResolver>;

/**
 * Combined resolvers
 */
export interface CombinedResolvers {
  Query?: Record<string, GraphQLResolver>;
  Mutation?: Record<string, GraphQLResolver>;
  Subscription?: Record<string, GraphQLResolver>;
  [typeName: string]: Record<string, GraphQLResolver> | undefined;
}
```

**Usage Replacements:**
- `serialize(value: any): any` → `serialize(value: unknown): unknown`
- `parseValue(value: any): any` → `parseValue(value: unknown): unknown`
- `parseLiteral(ast: ValueNode): any` → `parseLiteral(ast: ValueNode): unknown`
- `const value: any = {}` → `const value: Record<string, unknown> = {}`
- `function createDefaultResolvers(): any` → `function createDefaultResolvers(): DefaultResolversMap`
- `function combineResolvers(resolvers: any[]): any` → `function combineResolvers(resolvers: GraphQLResolverMap[]): CombinedResolvers`
- `...args: any[]` → `...args: GraphQLResolverArgs`

---

### 15. Context Types
**File to update:** `app/core/context/context.service.ts` (add types inline or create type file)

#### Proposed Types:
```typescript
/**
 * Shop data for context
 */
export interface ShopData {
  shop: string;
  domain?: string;
  [key: string]: unknown;
}
```

**Usage Replacements:**
- `shopData: any` → `shopData: ShopData`

---

### 16. Shopify Admin Types
**File to create/update:** `app/core/http/shopify-admin.type.ts`

#### Proposed Types:
```typescript
/**
 * Shopify GraphQL variables
 */
export type ShopifyGraphQLVariables = Record<string, unknown>;

/**
 * Shopify GraphQL response
 */
export interface ShopifyGraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

/**
 * Shopify GraphQL cost
 */
export interface ShopifyGraphQLCost {
  requestedQueryCost: number;
  actualQueryCost: number;
  throttleStatus: {
    maximumAvailable: number;
    currentlyAvailable: number;
    restoreRate: number;
  };
}
```

**Usage Replacements:**
- `variables?: any` → `variables?: ShopifyGraphQLVariables`
- `response?: any` → `response?: ShopifyGraphQLResponse`
- `cost: any` → `cost: ShopifyGraphQLCost`
- `errors: data.errors.map((e: any) =>` → `errors: data.errors.map((e: ShopifyGraphQLResponse['errors'][0]) =>`

---

## Summary of Type Files to Create/Update

### New Files to Create:
1. `app/shared/types/error.type.ts` - Error types and type guards
2. `app/shared/types/elasticsearch.type.ts` - Elasticsearch query and response types
3. `app/shared/types/utility.type.ts` - Utility function types
4. `app/shared/storefront/repository.type.ts` - Repository-specific types
5. `app/shared/storefront/filter-config.type.ts` - Filter configuration types
6. `app/shared/storefront/field-selector.type.ts` - Field selector types
7. `app/modules/graphql/graphql.factory.type.ts` - GraphQL factory types
8. `app/modules/webhooks/webhooks.type.ts` - Webhook types
9. `app/core/http/shopify-admin.type.ts` - Shopify admin API types

### Files to Update:
1. `app/modules/graphql/graphql.type.ts` - Add typed GraphQL types
2. `app/core/http/http.types.ts` - Add extended request types
3. `app/shared/types/response.type.ts` - Add response types (currently empty)
4. `app/shared/search/types.ts` - Add search config input types
5. `app/modules/indexing/indexing.type.ts` - Add indexing batch types
6. `app/modules/subscriptions/subscriptions.type.ts` - Add subscription variable types
7. `app/core/http/validation.schema.ts` - Add validation enum types
8. `app/modules/graphql/core/http/validation.schema.ts` - Add validation enum types

---

## Migration Priority

### High Priority (Critical Type Safety):
1. Error types - Replace all `catch (error: any)` with `catch (error: unknown)` + type guards
2. Elasticsearch types - Most common `any` usage, affects core functionality
3. GraphQL types - Core API types need proper typing

### Medium Priority:
4. HTTP/Request types - Request object extensions
5. Repository types - Storefront repository queries
6. Filter configuration types - Complex nested structures

### Low Priority (Nice to Have):
7. Utility types - Internal helper functions
8. Indexing types - Batch processing types
9. Webhook types - Background processing
10. Other specialized types

---

## Implementation Notes

1. **Gradual Migration**: Types can be added incrementally. Start with error types, then Elasticsearch, then GraphQL.

2. **Type Guards**: Use type guards for runtime type checking when using `unknown`:
   ```typescript
   if (isError(error)) {
     logger.error(error.message);
   }
   ```

3. **Generic Types**: Use generics where appropriate for reusable types:
   ```typescript
   interface ESSearchResponse<T = unknown> { ... }
   ```

4. **Union Types**: Use union types for discriminated unions:
   ```typescript
   type ESQueryClause = ESTermClause | ESTermsClause | ...
   ```

5. **Index Signatures**: Replace `[key: string]: any` with `[key: string]: unknown` where possible, or use specific types.

6. **Type Assertions**: Minimize use of `as any`. Use proper type assertions with `as SpecificType` when necessary.

---

## Estimated Impact

- **Type Safety**: Will eliminate 592 instances of `any` types
- **Code Quality**: Improved IDE autocomplete and type checking
- **Refactoring Safety**: TypeScript compiler will catch breaking changes
- **Documentation**: Types serve as inline documentation
- **Maintainability**: Easier to understand code structure and data flow

---

## Conclusion

This audit provides a comprehensive roadmap for eliminating all `any` types from the codebase. The proposed types are organized into logical files following the existing architecture pattern. Implementation should be done incrementally, starting with the highest priority categories (errors, Elasticsearch, GraphQL) and working through the rest.

All types are designed to be backward-compatible where possible, using optional properties and union types to handle variations in data structures.

