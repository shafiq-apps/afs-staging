# Search Module Audit Report

## Critical Issues Found

### 1. **CRITICAL: Storefront Repository Still References `enabled` Field** ⚠️
**Location:** `app/shared/storefront/repository.ts:1526`
**Issue:** Code still filters by `field.enabled` which was removed from the SearchField interface
```typescript
const phrasePrefixFields = searchConfig.fields
  .filter(field => field.enabled)  // ❌ field.enabled no longer exists!
```
**Impact:** This will cause a runtime error when building phrase prefix queries
**Fix:** Remove the filter since all fields in the array are active

### 2. **CRITICAL: Default Config Mismatch** ⚠️
**Location:** `app/modules/search/search.repository.ts:88-92`
**Issue:** Default config uses old weights (5, 3, 2, 1) but frontend uses new weights (10, 2, 1, 5)
**Impact:** New shops will get different defaults than what the UI expects
**Fix:** Update default config to match frontend defaults

### 3. **CRITICAL: Storefront Repository Default Fallback Mismatch** ⚠️
**Location:** `app/shared/storefront/repository.ts:1522`
**Issue:** Fallback uses old weights `['title^5', 'vendor^3', 'productType^2', 'tags^1']` but should match new defaults
**Impact:** If search config fails to load, fallback uses wrong weights
**Fix:** Update fallback to match new default weights

### 4. **CRITICAL: Storefront Repository Phrase Prefix Fallback Mismatch** ⚠️
**Location:** `app/shared/storefront/repository.ts:1536`
**Issue:** Fallback uses old weights `['title^4', 'vendor^2', 'productType']` but should match new defaults
**Impact:** If search config fails, autocomplete uses wrong weights
**Fix:** Update fallback to match new default weights

## Medium Priority Issues

### 5. **Unused Function: `invalidateSearchConfigCache`**
**Location:** `app/shared/storefront/repository.ts:281-283`
**Issue:** Function is defined but never called anywhere
**Impact:** Search config cache is never invalidated when config is updated
**Fix:** Either call this function when search config is updated, or remove it if cache invalidation is handled elsewhere

### 6. **Repository Instance Not Reset Between Requests**
**Location:** `app/modules/graphql/resolvers/search.resolvers.ts:15,35-38`
**Issue:** `searchRepo` is module-level and reused, but should be per-request
**Impact:** Potential memory leaks and incorrect state sharing between requests
**Fix:** Create new instance per request or use proper request-scoped pattern

### 7. **Missing Input Validation**
**Location:** `app/modules/search/search.repository.ts:103-121`
**Issue:** No validation for:
  - Empty fields array
  - Invalid field names
  - Weight values outside valid range (1-10)
  - Duplicate fields
**Impact:** Invalid data can be saved
**Fix:** Add validation before saving

### 8. **GraphQL Query Missing Error Handling**
**Location:** `dashboard/app/routes/app.search.tsx:88-100`
**Issue:** If GraphQL returns errors, it still tries to use `result?.searchConfig` which may be undefined
**Impact:** Potential runtime errors
**Fix:** Check for errors before accessing data

## Low Priority Issues

### 9. **Outdated Information Section**
**Location:** `dashboard/app/routes/app.search.tsx:393-414`
**Issue:** Information section still mentions old weight ranges (0.1-0.9, 5-10) but new weights are 1-10
**Impact:** Confusing documentation
**Fix:** Update information text to match new weight system

### 10. **Type Duplication**
**Location:** `dashboard/app/routes/app.search.tsx:12-23`
**Issue:** SearchField and SearchConfig interfaces are duplicated in frontend instead of importing from shared types
**Impact:** Type drift if shared types change
**Fix:** Import types from `@shared/search/types`

### 11. **Missing Cache Invalidation on Config Update**
**Location:** `app/modules/search/search.repository.ts:129-140`
**Issue:** Only invalidates shop cache, but doesn't invalidate searchConfigCache in StorefrontSearchRepository
**Impact:** StorefrontSearchRepository may serve stale cached config
**Fix:** Need a way to notify StorefrontSearchRepository to invalidate its cache

## Unused Code/Variables

### 12. **Unused: `invalidateSearchConfigCache` method**
**Location:** `app/shared/storefront/repository.ts:281-283`
**Status:** Defined but never called
**Action:** Remove or implement proper usage

### 13. **Unused: Module-level `searchRepo` variable**
**Location:** `app/modules/graphql/resolvers/search.resolvers.ts:15`
**Status:** Should be request-scoped, not module-level
**Action:** Refactor to create per-request instances

## Fix Plan

### Phase 1: Critical Fixes (Must Fix Immediately)
1. ✅ Remove `field.enabled` filter from storefront repository (line 1526)
2. ✅ Update default config in search repository to match frontend (10, 2, 1, 5)
3. ✅ Update fallback weights in storefront repository to match new defaults
4. ✅ Fix phrase prefix fallback weights

### Phase 2: Important Fixes
5. ✅ Fix repository instance scoping (per-request instead of module-level)
6. ✅ Add input validation in search repository
7. ✅ Improve error handling in frontend GraphQL queries
8. ✅ Implement proper cache invalidation for search config

### Phase 3: Code Cleanup
9. ✅ Remove unused `invalidateSearchConfigCache` or implement proper usage
10. ✅ Update information section with correct weight ranges
11. ✅ Import types from shared module instead of duplicating
12. ✅ Add proper TypeScript types throughout

## Files to Modify

1. `app/shared/storefront/repository.ts` - Fix enabled filter, update defaults
2. `app/modules/search/search.repository.ts` - Update defaults, add validation
3. `app/modules/graphql/resolvers/search.resolvers.ts` - Fix instance scoping
4. `dashboard/app/routes/app.search.tsx` - Fix types, error handling, update docs

