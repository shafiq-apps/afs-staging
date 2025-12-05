# Storefront Filters & Product Search Report

_Last updated: Dec 5, 2025_

## 1. How the Storefront Filters & Products Pipeline Works Today

| Stage | What Happens | Key Implementations |
| --- | --- | --- |
| Query parsing | `buildSearchInput()` / `buildFilterInput()` normalize query params, parse comma lists, detect option handles, and sanitize keys/values to block injection. | `app/modules/products/products.helper.ts`, `app/shared/helpers/query.helper.ts`
| Filter config resolution | `getActiveFilterConfig()` prioritizes published filters (custom → default → any, honoring collection scopes) and `applyFilterConfigToInput()` maps handles to option names, enforces allowed collections, and auto-hides OOS items when configured. | `app/shared/storefront/filter-config.helper.ts`
| Elasticsearch query build | `StorefrontSearchRepository` constructs `bool.must` clauses for search text, vendors, product types, tags, collections, option pairs (`OptionName::Value`), price ranges, variant price/SKU filters, and hide-out-of-stock nested clauses. Sorting defaults to relevance (when searching) or `createdAt desc`. | `app/shared/storefront/repository.ts`
| Aggregations | Enabled aggregations are derived from the filter config so only published filters cost ES time. Variant options are fetched via per-option prefix filters, falling back to `optionPairs` when no config is provided. | `getFacets()` & `searchProducts()` in the same repository
| Response shaping | `StorefrontSearchService` caches results by shop + filter hash, formats aggregations for the storefront, and trims products to requested fields via `filterProductsForStorefront()`. | `app/shared/storefront/service.ts`, `app/shared/storefront/storefront.helper.ts`
| HTTP routes | `/storefront/products` returns products + pagination, optional aggregations, and the active filter config. `/storefront/filters` precomputes filter options + config for UI bootstrapping and mirrors the same query params for contextual counts. | `app/modules/products/routes/products.ts`, `app/modules/products/routes/filters.ts`

## 2. Query Structure Reference

| Category | Parameters | Example | Notes |
| --- | --- | --- | --- |
| Required | `shop` | `shop=myshopify.com` | Validated + normalized.
| Search | `search` | `search=winter+jacket` | Multi-field `multi_match` across `title^3`, `vendor^2`, `productType`, `tags`.
| Standard filters | `vendor(s)`, `productType(s)`, `tag(s)`, `collection(s)` | `vendors=Nike,Adidas` | Case-insensitive; stored as `.keyword` ES fields.
| Price | `priceMin/Max`, `variantPriceMin/Max` | `priceMin=10&priceMax=100` | Product-level uses `minPrice/maxPrice`; variant-level uses nested `variants.price.numeric` range.
| Variant metadata | `variantSku(s)`, `variantKey(s)` | `variantSkus=SKU-1,SKU-2` | SKUs via nested terms; keys limit which option families aggregate.
| Option filters | `options[Size]=M,L`, `options[pr_a3k9x]=M`, or direct handles `op_rok5d=Red` | `pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey` | Values encoded as `OptionName::Value` pairs; handles mapped via filter config.
| Pagination | `page`, `limit (≤100)` | `page=2&limit=24` | Default `page=1`, `limit=20`.
| Sorting | `sort=field:order` | `sort=price:asc` | `price` remaps to `minPrice`; fallback `createdAt desc` when no search.
| Extras | `fields`, `includeFilters=true`, `hideOutOfStockItems` (auto from config) | `fields=id,title,imageUrl` | Field selection trims payload; include filters only when UI needs facets.

## 3. End-to-End Examples

1. **Initial load (products only)**  
   `GET /storefront/products?shop=shop.myshopify.com&page=1&limit=20`

2. **Search + option handles + price range**  
   `GET /storefront/products?shop=shop.myshopify.com&search=jacket&pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey&priceMin=10&priceMax=150&sort=_score:desc&includeFilters=true`

3. **Filters bootstrap with contextual counts**  
   `GET /storefront/filters?shop=shop.myshopify.com&vendor=Nike&collection=174251016285`

4. **Field-optimized listing**  
   `GET /storefront/products?shop=shop.myshopify.com&fields=id,title,imageUrl,variants.id,variants.price`

## 4. Use Cases — Implemented vs. Ideal Usage

| Scenario | Implemented Today | Ideal / Recommended Application |
| --- | --- | --- |
| **Initial storefront render** | Client often calls `/storefront/products` with default filters, then `/storefront/filters` separately. | Call `/storefront/filters` first to cache `filterConfig` + handles, then request `/storefront/products` with direct handles for the shortest URLs. Cache both responses for 1–5 minutes per shop.
| **Search-driven listing** | `search` triggers ES relevance sorting; option handles + standard filters mix freely. | Keep `sort` unset so `_score` stays primary, debounce search input, and limit requested fields to hero data to keep latency low.
| **Collection landing page** | Collection ID passed via `collection` query; filter config auto-switches to collection-scoped filter when available. | Ensure UI sends the collection ID **and** respects returned `filterConfig.allowedCollections`; reject manual filters outside the scope to prevent ES mismatches.
| **Variant-intensive filtering** | All option pairs fetched when no config; otherwise only published options aggregate. | Always publish filter options for every storefront facet so ES can execute per-option prefix aggregations instead of the fallback `optionPairs` sweep (saves cost & time).
| **Inventory-sensitive catalog** | `hideOutOfStockItems` honored only when filter config enables it. | Surface this setting in the merchant UI and encourage enabling it when index data has reliable inventory metrics; pair with variant-level price filters for accurate availability messaging.

## 5. Key Observations & Opportunities

- **Handle-first URLs**: Direct handle keys (e.g., `pr_a3k9x=M`) cut URL length ~30% and avoid nested `options[]` encoding. Always cache the mapping from `filterConfig.options` to keep frontends handle-aware.
- **Option sanitization**: The parser strips quotes and control chars before ES queries. Ensure indexing normalizes variant values the same way (quotes removed) to avoid mismatches.
- **Aggregation throttling**: Because aggregations run only for published options, keeping draft filters unpublished prevents wasted ES load during merchant experimentation.
- **Field selection**: `fields` dramatically shrinks payloads when PLPs need only minimal data (ID, handle, price, primary image). Combine with CDN caching for sub-300 ms responses.
- **Cache invalidation**: Cache keys incorporate the filter-config hash; republishing filters automatically busts relevant cache entries. Align CDN cache TTLs with the 5‑minute config cache to avoid stale handles.
- **GraphQL parity**: GraphQL resolvers rely on the same repository/service stack, so adopting handle-first filters benefits both REST and GraphQL clients without extra work.

## 6. Quick Reference Checklist ("How It Should Be")

1. Fetch `/storefront/filters` on page bootstrap; persist `filterConfig` + option handles.
2. Build product queries using **direct handles** (`pr_*`, `op_*`, etc.) whenever `filterConfig` exists; fall back to `options[Name]` only if config fetch fails.
3. Request `includeFilters=true` only when the UI must refresh facet counts—skip it for infinite scroll to halve ES aggregation cost.
4. Use `fields` to return the smallest viable product payload for each UI surface.
5. Respect `filterConfig.targetScope` & `allowedCollections`; never send filters outside that envelope.
6. Debounce search + filter interactions and batch them so ES receives a single composed query per UI change.

---
**Primary Sources Consulted**: `app/modules/products/routes/products.ts`, `app/modules/products/routes/filters.ts`, `app/modules/products/products.helper.ts`, `app/shared/helpers/query.helper.ts`, `app/shared/storefront/filter-config.helper.ts`, `app/shared/storefront/repository.ts`, `app/shared/storefront/service.ts`, and `STOREFRONT_FILTERS_QUERIES_GUIDELINES.md`.
