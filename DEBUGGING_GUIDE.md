# Debugging Guide - Nothing Showing on Storefront

## Quick Checks

### 1. Check Browser Console
Open browser DevTools (F12) and check the Console tab. You should see logs like:
- `[AFS] Initializing AFS`
- `[AFS] Shop set`
- `[AFS] Loading filters...`
- `[AFS] Filters loaded`
- `[AFS] Loading products...`

### 2. Verify Initialization
Make sure `AFS.init()` is being called with correct parameters:

```javascript
AFS.init({
  shop: 'your-shop.myshopify.com',  // REQUIRED
  apiBaseUrl: 'https://your-api-url.com',  // REQUIRED - your backend API
  container: '[data-afs-container]'  // Optional
});
```

### 3. Check API Configuration
The API baseURL must be set. Common issues:
- ❌ `apiBaseUrl` not provided → Will use default `http://localhost:3554`
- ❌ Wrong API URL → Check your backend server URL
- ❌ CORS issues → Check Network tab for CORS errors

### 4. Check Network Tab
1. Open DevTools → Network tab
2. Look for requests to `/storefront/filters` and `/storefront/products`
3. Check:
   - Are requests being made?
   - What's the response status (200, 404, 500)?
   - What's the response body?

### 5. Common Issues & Fixes

#### Issue: "API baseURL not set"
**Fix:** Make sure you call `AFS.init({ apiBaseUrl: '...' })`

#### Issue: "Shop not set"
**Fix:** Make sure you pass `shop` parameter in `AFS.init()`

#### Issue: "HTTP 404" or "HTTP 500"
**Fix:** 
- Check your API server is running
- Verify the API endpoints exist: `/storefront/filters` and `/storefront/products`
- Check API logs for errors

#### Issue: "Invalid response"
**Fix:** 
- Check API response format matches expected:
  ```json
  {
    "success": true,
    "data": {
      "filters": [...],
      "filterConfig": {...},
      "products": [...],
      "pagination": {...}
    }
  }
  ```

#### Issue: CORS errors
**Fix:** 
- Add CORS headers on your backend
- Or use a proxy

#### Issue: Empty filters/products arrays
**Fix:**
- Check your API is returning data
- Verify shop parameter is correct
- Check if there are products in your database

### 6. Enable Full Logging
Logging is now always enabled. Check console for:
- `[AFS] Initializing AFS` - Initialization started
- `[AFS] Shop set` - Shop configured
- `[AFS] Loading filters...` - Fetching filters
- `[AFS] Filters loaded` - Filters received
- `[AFS] Loading products...` - Fetching products
- `[AFS] Products loaded` - Products received
- `[AFS] Error: ...` - Any errors

### 7. Test API Manually
Test your API endpoints directly:

```bash
# Test filters endpoint
curl "https://your-api.com/storefront/filters?shop=your-shop.myshopify.com"

# Test products endpoint
curl "https://your-api.com/storefront/products?shop=your-shop.myshopify.com&page=1&limit=20"
```

### 8. Check HTML Structure
Make sure your HTML has the container:

```html
<div data-afs-container="true" id="your-container-id">
  <!-- AFS will populate this -->
</div>
```

### 9. Verify Script Loading
1. Check if `advanced-filter-search.js` is loaded
2. Check if `window.AFS` exists: `console.log(window.AFS)`
3. Check for JavaScript errors in console

### 10. Minimal Test
Try this minimal test in browser console:

```javascript
// Check if AFS is loaded
console.log('AFS available:', typeof window.AFS !== 'undefined');

// Try initialization
if (window.AFS) {
  window.AFS.init({
    shop: 'your-shop.myshopify.com',
    apiBaseUrl: 'https://your-api-url.com'
  });
}
```

## Expected Console Output (Success)

```
[AFS] Initializing AFS {shop: "...", apiBaseUrl: "..."}
[AFS] API base URL set {url: "..."}
[AFS] Shop set {shop: "..."}
[AFS] DOM initialized
[AFS] Events attached
[AFS] Loading filters... {shop: "...", filters: {...}}
[AFS] Fetching filters {url: "...", shop: "..."}
[AFS] Fetch success {url: "...", hasData: true}
[AFS] Filters loaded {filtersCount: 5, hasConfig: true}
[AFS] Filters rendered {count: 5}
[AFS] Loading products... {filters: {...}, pagination: {...}}
[AFS] Fetching products {url: "...", shop: "...", page: 1}
[AFS] Products response {productsCount: 20, total: 100, hasFilters: true, hasConfig: true}
[AFS] Products loaded {count: 20, total: 100}
```

## If Still Not Working

1. **Check all console errors** - Copy and share them
2. **Check Network tab** - See what requests are failing
3. **Verify API is accessible** - Test endpoints manually
4. **Check shop parameter** - Make sure it matches your Shopify shop domain
5. **Verify response format** - API must return `{success: true, data: {...}}`

