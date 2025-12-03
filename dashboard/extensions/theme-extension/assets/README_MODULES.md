# Advanced Filter Search - Module Structure

## Overview
The original `advanced-filter-search.js` (134KB) has been split into smaller modules to comply with Shopify's 10KB file size limit per script.

## Module Files

### Core Modules (Load First)
1. **afs-constants.js** (~1KB) - Configuration constants
2. **afs-utils-core.js** (~4KB) - FilterConfigIndex, MemoCache, HashUtils
3. **afs-logger.js** (~2KB) - Logger utility

### Main Modules
4. **afs-utils.js** (~10KB) - Main utilities (query string parsing, error handling)
5. **afs-state.js** (~5KB) - StateManager
6. **afs-url.js** (~4KB) - URLManager
7. **afs-api.js** (~15KB) - APIClient (may need splitting into 2 parts)
8. **afs-dom.js** (~25KB) - DOMRenderer (needs splitting into 3+ parts)
9. **afs-filters.js** (~8KB) - FilterManager
10. **afs-events.js** (~12KB) - EventHandlers (may need splitting into 2 parts)
11. **afs-main.js** (~8KB) - Main AFS instance

## Usage in Shopify Theme

Add these script tags to your theme (in the correct order):

```liquid
<!-- Load modules in order -->
<script src="{{ 'afs-constants.js' | asset_url }}" defer></script>
<script src="{{ 'afs-utils-core.js' | asset_url }}" defer></script>
<script src="{{ 'afs-logger.js' | asset_url }}" defer></script>
<script src="{{ 'afs-utils.js' | asset_url }}" defer></script>
<script src="{{ 'afs-state.js' | asset_url }}" defer></script>
<script src="{{ 'afs-url.js' | asset_url }}" defer></script>
<script src="{{ 'afs-api.js' | asset_url }}" defer></script>
<script src="{{ 'afs-dom.js' | asset_url }}" defer></script>
<script src="{{ 'afs-filters.js' | asset_url }}" defer></script>
<script src="{{ 'afs-events.js' | asset_url }}" defer></script>
<script src="{{ 'afs-main.js' | asset_url }}" defer></script>

<!-- Initialize after DOM is ready -->
<script>
  document.addEventListener('DOMContentLoaded', function() {
    if (window.AFS && window.AFS.AFS) {
      window.AFS.AFS.init({
        shop: '{{ shop.permanent_domain }}',
        container: '[data-afs-container]',
        filtersContainer: '.afs-filters-container',
        productsContainer: '.afs-products-container',
        apiBaseUrl: 'https://fstaging.digitalcoo.com' // Optional
      });
    }
  });
</script>
```

## Module Dependencies

Each module accesses dependencies via `global.AFS` namespace:
- `CONSTANTS` - from afs-constants.js
- `FilterConfigIndex`, `MemoCache`, `HashUtils` - from afs-utils-core.js
- `Logger` - from afs-logger.js
- `Utils` - from afs-utils.js
- `StateManager` - from afs-state.js
- `URLManager` - from afs-url.js
- `APIClient` - from afs-api.js
- `DOMRenderer` - from afs-dom.js
- `FilterManager` - from afs-filters.js
- `EventHandlers` - from afs-events.js
- `AFS` (main instance) - from afs-main.js

## File Size Status

⚠️ **Note**: Some modules may still exceed 10KB:
- `afs-utils.js` (~10KB) - May need minor optimization
- `afs-api.js` (~15KB) - Needs splitting into 2 parts
- `afs-dom.js` (~25KB) - Needs splitting into 3+ parts  
- `afs-events.js` (~12KB) - May need splitting into 2 parts

## Next Steps

1. ✅ Created: afs-constants.js, afs-utils-core.js, afs-logger.js, afs-utils.js
2. ⏳ To Create: afs-state.js, afs-url.js, afs-api.js, afs-dom.js, afs-filters.js, afs-events.js, afs-main.js
3. ⚠️ To Split: Large modules that exceed 10KB need further splitting

## Testing

After all modules are created:
1. Load modules in order
2. Verify `window.AFS` namespace is populated
3. Test initialization
4. Check browser console for errors
5. Verify filter functionality works

