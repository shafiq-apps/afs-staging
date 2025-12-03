# Advanced Filter Search - Module Load Order

Due to Shopify's 10KB file size limit, the extension has been split into multiple modules.
Load them in the following order:

## Load Order:

1. `afs-constants.js` - Configuration constants (~1KB)
2. `afs-utils-core.js` - Core utilities: FilterConfigIndex, MemoCache, HashUtils (~4KB)
3. `afs-logger.js` - Logging utility (~2KB)
4. `afs-utils.js` - Main utilities: Utils object (~8KB)
5. `afs-state.js` - StateManager (~5KB)
6. `afs-url.js` - URLManager (~4KB)
7. `afs-api.js` - APIClient (~15KB - may need further splitting)
8. `afs-dom.js` - DOMRenderer (~25KB - needs splitting)
9. `afs-filters.js` - FilterManager (~8KB)
10. `afs-events.js` - EventHandlers (~12KB - may need splitting)
11. `afs-main.js` - Main AFS instance (~8KB)

## Usage in Shopify Theme:

```liquid
<!-- Load in order -->
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

<!-- Initialize -->
<script>
  document.addEventListener('DOMContentLoaded', function() {
    if (window.AFS && window.AFS.AFS) {
      window.AFS.AFS.init({
        shop: '{{ shop.permanent_domain }}',
        container: '[data-afs-container]',
        filtersContainer: '.afs-filters-container',
        productsContainer: '.afs-products-container'
      });
    }
  });
</script>
```

## Note:

Some modules (afs-api.js, afs-dom.js, afs-events.js) may exceed 10KB and need further splitting.
If a module exceeds 10KB, split it into multiple files (e.g., afs-dom-part1.js, afs-dom-part2.js).

