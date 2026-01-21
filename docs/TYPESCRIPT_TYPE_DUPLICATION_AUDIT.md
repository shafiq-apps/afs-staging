# TypeScript Type Duplication Audit Report

## Executive Summary

This audit identifies all TypeScript type definitions used in GraphQL schemas and storefront code, highlighting duplicated types across files that should be centralized for better type safety and maintainability.

**Total Duplicate Type Groups Found:** 15  
**Files with Duplicate Types:** 25+  
**Recommendation:** Create centralized type definitions in `app/shared/types/` to eliminate duplication.

---

## 1. Product-Related Types

### 1.1 ProductOption
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductOption`)
- `app/shared/storefront/types.ts` (TypeScript: `productOption`)

**Differences:**
- GraphQL: `id: String`, `name: String`, `values: [String!]!`
- TypeScript: `id?: string | null`, `name: string | null`, `values: string[]`

**Recommendation:** Centralize in `app/shared/types/products.types.ts` and use in both GraphQL resolvers and storefront code.

---

### 1.2 ProductVariantOption
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductVariantOption`)
- `app/shared/storefront/types.ts` (TypeScript: `productVariantOption`)

**Differences:**
- GraphQL: `name: String`, `value: String`
- TypeScript: `name: string | null`, `value: string | null`

**Recommendation:** Merge into single type definition.

---

### 1.3 ProductVariant
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductVariant`)
- `app/shared/storefront/types.ts` (TypeScript: `productVariant`)
- `storefront/src/type/index.ts` (TypeScript: `ProductVariantType`)

**Differences:**
- GraphQL schema has 13 fields
- `productVariant` has 15 fields with `[key: string]: any` index signature
- `ProductVariantType` has different field names (e.g., `available` vs `availableForSale`, `price` as `number | string`)

**Recommendation:** Create unified `ProductVariant` type with all fields, use type aliases for GraphQL/Storefront variants.

---

### 1.4 ProductMetafield
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductMetafield`)
- `app/shared/storefront/types.ts` (TypeScript: `productMetafield`)

**Differences:**
- GraphQL: All fields non-nullable
- TypeScript: All fields nullable (`string | null`)

**Recommendation:** Merge with proper nullability handling.

---

### 1.5 ProductCategory
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductCategory`)
- `app/shared/storefront/types.ts` (TypeScript: `productCategory`)

**Differences:**
- GraphQL: `name: String`
- TypeScript: `name?: string | null`

**Recommendation:** Merge into single type.

---

### 1.6 ProductMedia / ProductMediaImage
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductMedia`, `type ProductMediaImage`, `type ProductMediaPreview`)
- `app/shared/storefront/types.ts` (TypeScript: `productMedia`, `productMediaImage`)
- `app/shared/types/shopify-admin.type.ts` (TypeScript: `ShopifyAdminMediaNode`, `ShopifyAdminMediaImageNode`, `ShopifyAdminMediaPreviewNode`)

**Differences:**
- GraphQL schema has nested structure
- TypeScript types have nullable fields
- Shopify Admin types have GraphQL connection structure (edges/nodes)

**Recommendation:** Create base types, extend for GraphQL/Shopify Admin variants.

---

### 1.7 ProductPriceMoney / ProductPriceRangeV2
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductPriceMoney`, `type ProductPriceRangeV2`)
- `app/shared/storefront/types.ts` (TypeScript: `productPriceMoney`, `productPriceRangeV2`)

**Differences:**
- GraphQL: Fields are non-nullable
- TypeScript: Fields are nullable

**Recommendation:** Merge with proper nullability.

---

### 1.8 ProductVariantsCount
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductVariantsCount`)
- `app/shared/storefront/types.ts` (TypeScript: `productVariantsCount`)

**Differences:**
- GraphQL: `count: Int`, `precision: String`
- TypeScript: `count?: number | null`, `precision?: string | null`

**Recommendation:** Merge into single type.

---

### 1.9 Product (Main Type)
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type Product`)
- `app/shared/storefront/types.ts` (TypeScript: `shopifyProduct`, `StorefrontProduct`)
- `storefront/src/type/index.ts` (TypeScript: `ProductType`)

**Differences:**
- GraphQL schema has 27 fields
- `shopifyProduct` has 30+ fields with index signature
- `StorefrontProduct` is `Omit<shopifyProduct, ...>`
- `ProductType` has different field structure (e.g., `gid`, `featuredImage`)

**Recommendation:** Create base `Product` type, extend for GraphQL/Storefront/Shopify variants.

---

## 2. Filter-Related Types

### 2.1 FacetValue
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type FacetValue`)
- `app/shared/storefront/types.ts` (TypeScript: `FacetValue`)
- `storefront/src/type/index.ts` (TypeScript: `FilterValueType`)

**Differences:**
- GraphQL: `value: String!`, `count: Int!`
- TypeScript `FacetValue`: `value: string`, `count: number`, `label: string`
- `FilterValueType`: `value?: string`, `key?: string`, `name?: string`, `label?: string`, `count?: number`

**Recommendation:** Create unified `FacetValue` type, use `FilterValueType` as extended variant if needed.

---

### 2.2 ProductFilters / ProductFilterInput
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type ProductFilters`, `input ProductFilterInput`)
- `app/shared/storefront/types.ts` (TypeScript: `ProductFilters`, `ProductFilterInput`)
- `dashboard/app/utils/filter.constants.ts` (TypeScript: `StorefrontFilterData`)

**Differences:**
- GraphQL `ProductFilterInput`: 9 fields
- TypeScript `ProductFilterInput`: 11 fields (includes `keep`, `cpid`)
- `StorefrontFilterData`: Similar structure but different field names

**Recommendation:** Merge into single type, use GraphQL input as base.

---

### 2.3 ProductSearchInput
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `input ProductSearchInput`)
- `app/shared/storefront/types.ts` (TypeScript: `ProductSearchInput`)
- `app/modules/storefront/search.helper.ts` (TypeScript: `SearchInput extends ProductSearchInput`)

**Differences:**
- GraphQL: 13 fields (includes `cursor`, `limit`, `sort`, `includeFilters`, `fields`)
- TypeScript: 15 fields (includes `page`, `hideOutOfStockItems`, `keep`, `cpid`)

**Recommendation:** Create base `ProductSearchInput`, extend for GraphQL/Storefront variants.

---

### 2.4 Filter (Configuration)
**Duplicated in:**
- `app/modules/graphql/schema/filters.schema.ts` (GraphQL: `type Filter`)
- `app/shared/filters/types.ts` (TypeScript: `Filter`)
- `dashboard/app/routes/app.filters.tsx` (TypeScript: `Filter` - partial)
- `dashboard/app/routes/app._index.tsx` (TypeScript: `Filter` - partial)

**Differences:**
- GraphQL schema: Full type with all fields
- `app/shared/filters/types.ts`: Full TypeScript definition
- Dashboard routes: Partial definitions with `[key: string]: any`

**Recommendation:** Use `app/shared/filters/types.ts` as source of truth, import in dashboard routes.

---

### 2.5 CollectionReference
**Duplicated in:**
- `app/modules/graphql/schema/filters.schema.ts` (GraphQL: `type CollectionReference`, `input CollectionReferenceInput`)
- `app/shared/filters/types.ts` (TypeScript: Inline in `Filter.allowedCollections`)
- `dashboard/app/routes/app.filters.tsx` (TypeScript: `CollectionReference`)

**Differences:**
- GraphQL: `label: String!`, `value: String!`, `id: String!`, `gid: String!`
- TypeScript in `Filter`: `label: string`, `value: string`, `id: string` (no `gid`)
- Dashboard: `label: string`, `value: string`, `id: string` (no `gid`)

**Recommendation:** Create `CollectionReference` type in `app/shared/filters/types.ts`, use everywhere.

---

### 2.6 PriceRange
**Duplicated in:**
- `app/modules/graphql/schema/products.schema.ts` (GraphQL: `type PriceRange`)
- `app/shared/storefront/types.ts` (TypeScript: Inline in `ProductFilters.price`)
- `storefront/src/type/index.ts` (TypeScript: `PriceRangeType`)

**Differences:**
- GraphQL: `min: Float!`, `max: Float!`
- TypeScript inline: `min: number`, `max: number`
- `PriceRangeType`: `min?: number`, `max?: number`

**Recommendation:** Create unified `PriceRange` type.

---

## 3. Search-Related Types

### 3.1 SearchField / SearchConfig
**Duplicated in:**
- `app/modules/graphql/schema/search.schema.ts` (GraphQL: `type SearchField`, `type SearchConfig`)
- `app/shared/search/types.ts` (TypeScript: `SearchField`, `SearchConfig`)
- `dashboard/app/routes/app.search.tsx` (TypeScript: `SearchField`, `SearchConfig`)

**Differences:**
- GraphQL `SearchField`: `field: String!`, `weight: Float!`
- TypeScript `SearchField`: `field: string`, `weight: number`
- GraphQL `SearchConfig`: `id: String!`, `shop: String!`, `fields: [SearchField!]!`, `updatedAt: String`, `createdAt: String!`
- TypeScript `SearchConfig`: Same structure
- Dashboard: Same structure (comment says "Keep in sync with app/shared/search/types.ts")

**Recommendation:** Use `app/shared/search/types.ts` as source of truth, import in dashboard.

---

## 4. Shop-Related Types

### 4.1 Shop
**Duplicated in:**
- `app/modules/graphql/schema/shops.schema.ts` (GraphQL: `type Shop`)
- `app/modules/shops/shops.type.ts` (TypeScript: `Shop`)

**Differences:**
- GraphQL: 20+ fields including session fields
- TypeScript: 8 fields with `[key: string]: any` index signature

**Recommendation:** Create comprehensive `Shop` type, use in both GraphQL and TypeScript code.

---

### 4.2 CreateShopInput / UpdateShopInput
**Duplicated in:**
- `app/modules/graphql/schema/shops.schema.ts` (GraphQL: `input CreateShopInput`, `input UpdateShopInput`)
- `app/modules/shops/shops.type.ts` (TypeScript: `CreateShopInput`, `UpdateShopInput`)

**Differences:**
- GraphQL: Full field definitions
- TypeScript: Partial field definitions

**Recommendation:** Merge into single definitions.

---

### 4.3 IndexingStatus
**Duplicated in:**
- `app/modules/graphql/schema/shops.schema.ts` (GraphQL: `type IndexingStatus`)
- `dashboard/app/routes/app._index.tsx` (TypeScript: `IndexingStatus`)

**Differences:**
- GraphQL: 12 fields (includes `totalLines`, `failedItems`, `lastShopifyUpdatedAt`, `indexExists`, `duration`)
- Dashboard: 8 fields (partial definition)

**Recommendation:** Use GraphQL schema as source of truth, create TypeScript type matching it.

---

## 5. Subscription-Related Types

### 5.1 Money / MoneyInput
**Duplicated in:**
- `app/modules/graphql/schema/subscriptions.schema.ts` (GraphQL: `type Money`, `input MoneyInput`)

**Status:** No TypeScript equivalent found. These are GraphQL-only types.

**Recommendation:** Create TypeScript types if needed for internal use.

---

## 6. Context and Service Types

### 6.1 ShopContext
**Duplicated in:**
- `app/core/context/context.service.ts` (TypeScript: `ShopContext`)
- `app/modules/graphql/core/context/context.service.ts` (TypeScript: `ShopContext`)

**Differences:**
- Both files have identical `ShopContext` interface definitions

**Recommendation:** Move to `app/shared/types/context.types.ts`, import in both files.

---

### 6.2 ShopifyAdminHandlerOptions / ShopifyAdminResponse
**Duplicated in:**
- `app/core/http/shopify-admin.handler.ts` (TypeScript: `ShopifyAdminHandlerOptions`, `ShopifyAdminRequestConfig`, `ShopifyAdminResponse`)
- `app/modules/graphql/core/http/shopify-admin.handler.ts` (TypeScript: Same types)

**Differences:**
- Both files have identical type definitions

**Recommendation:** Move to `app/shared/types/http.types.ts`, import in both files.

---

## 7. Cache Types

### 7.1 CacheServiceOptions / CacheArea
**Duplicated in:**
- `app/core/cache/cache.service.ts` (TypeScript: `CacheServiceOptions`, `CacheArea`, `CacheEntryInfo`)
- `app/modules/graphql/core/cache/cache.service.ts` (TypeScript: Same types)

**Differences:**
- Both files have identical type definitions

**Recommendation:** Move to `app/shared/types/cache.types.ts`, import in both files.

---

## Summary of Recommendations

### High Priority (Type Safety Critical)

1. **Product Types** - Create `app/shared/types/products.types.ts`:
   - `ProductOption`
   - `ProductVariantOption`
   - `ProductVariant`
   - `ProductMetafield`
   - `ProductCategory`
   - `ProductMedia`, `ProductMediaImage`, `ProductMediaPreview`
   - `ProductPriceMoney`, `ProductPriceRangeV2`
   - `ProductVariantsCount`
   - `Product` (base type)
   - `StorefrontProduct` (derived type)

2. **Filter Types** - Enhance `app/shared/filters/types.ts`:
   - Export `CollectionReference` as standalone type
   - Ensure `Filter` type is complete and used everywhere

3. **Search Types** - Use `app/shared/search/types.ts`:
   - Remove duplicate definitions from dashboard routes
   - Import from shared types

4. **Shop Types** - Enhance `app/modules/shops/shops.type.ts`:
   - Make `Shop` type comprehensive
   - Ensure GraphQL schema matches TypeScript types

### Medium Priority (Code Organization)

5. **FacetValue / PriceRange** - Create `app/shared/types/filters.types.ts`:
   - `FacetValue`
   - `PriceRange`
   - `ProductFilters`
   - `ProductFilterInput`
   - `ProductSearchInput`

6. **Context Types** - Create `app/shared/types/context.types.ts`:
   - `ShopContext`

7. **HTTP Types** - Create `app/shared/types/http.types.ts`:
   - `ShopifyAdminHandlerOptions`
   - `ShopifyAdminRequestConfig`
   - `ShopifyAdminResponse`

8. **Cache Types** - Create `app/shared/types/cache.types.ts`:
   - `CacheServiceOptions`
   - `CacheArea`
   - `CacheEntryInfo`

### Low Priority (Storefront-Specific)

9. **Storefront Types** - Review `storefront/src/type/index.ts`:
   - Consider if `ProductType`, `ProductVariantType` can extend shared types
   - Keep storefront-specific types separate but ensure compatibility

---

## Implementation Strategy

### Phase 1: Create Centralized Type Files
1. `app/shared/types/products.types.ts` - All product-related types
2. `app/shared/types/filters.types.ts` - Filter and facet types
3. `app/shared/types/search.types.ts` - Re-export from `app/shared/search/types.ts`
4. `app/shared/types/shops.types.ts` - Enhance existing `app/modules/shops/shops.type.ts`
5. `app/shared/types/context.types.ts` - Context types
6. `app/shared/types/http.types.ts` - HTTP handler types
7. `app/shared/types/cache.types.ts` - Cache types

### Phase 2: Update Imports
1. Update GraphQL resolvers to import from shared types
2. Update storefront code to import from shared types
3. Update dashboard routes to import from shared types
4. Remove duplicate type definitions

### Phase 3: Type Alignment
1. Ensure GraphQL schema types match TypeScript types
2. Add type generation from GraphQL schema (optional, using tools like `graphql-codegen`)
3. Add type validation in resolvers

---

## Files Requiring Updates

### GraphQL Schema Files (Reference Types)
- `app/modules/graphql/schema/products.schema.ts`
- `app/modules/graphql/schema/filters.schema.ts`
- `app/modules/graphql/schema/search.schema.ts`
- `app/modules/graphql/schema/shops.schema.ts`

### TypeScript Type Files (Source of Truth)
- `app/shared/storefront/types.ts` - Merge product types
- `app/shared/filters/types.ts` - Export CollectionReference
- `app/shared/search/types.ts` - Already centralized
- `app/modules/shops/shops.type.ts` - Enhance Shop types

### Dashboard Route Files (Remove Duplicates)
- `dashboard/app/routes/app.search.tsx` - Import SearchField/SearchConfig
- `dashboard/app/routes/app.filters.tsx` - Import Filter/CollectionReference
- `dashboard/app/routes/app._index.tsx` - Import Filter/IndexingStatus

### Service Files (Remove Duplicates)
- `app/core/context/context.service.ts` - Import ShopContext
- `app/modules/graphql/core/context/context.service.ts` - Import ShopContext
- `app/core/http/shopify-admin.handler.ts` - Import HTTP types
- `app/modules/graphql/core/http/shopify-admin.handler.ts` - Import HTTP types
- `app/core/cache/cache.service.ts` - Import cache types
- `app/modules/graphql/core/cache/cache.service.ts` - Import cache types

---

## Benefits of Centralization

1. **Type Safety**: Single source of truth prevents type mismatches
2. **Maintainability**: Changes in one place propagate everywhere
3. **Consistency**: GraphQL and TypeScript types stay aligned
4. **Developer Experience**: Clear import paths, better IDE autocomplete
5. **Reduced Bugs**: Eliminates discrepancies between duplicate definitions
6. **Easier Refactoring**: Changes are localized to type definitions

---

## Notes

- GraphQL schema types are string-based and cannot directly use TypeScript types
- Consider using `graphql-codegen` to generate TypeScript types from GraphQL schemas
- Storefront types may need to remain separate for client-side compatibility
- Some types may need to remain GraphQL-only (e.g., subscription Money types)

---

**Audit Date:** 2024  
**Auditor:** AI Assistant  
**Status:** Audit Only - No Changes Applied



