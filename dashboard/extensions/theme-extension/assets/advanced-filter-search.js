/**
 * Advanced Filter Search - Module Loader
 * 
 * This file loads all modules in the correct order.
 * Due to Shopify's 10KB file size limit, the extension has been split into modules.
 * 
 * Load order is critical - modules must be loaded in sequence.
 */

// This file is now a placeholder/loader
// All actual code has been moved to separate module files:
// - afs-constants.js
// - afs-utils-core.js  
// - afs-logger.js
// - afs-utils.js
// - afs-state.js
// - afs-url.js
// - afs-api.js
// - afs-dom.js
// - afs-filters.js
// - afs-events.js
// - afs-main.js

// In your Shopify theme, load the modules in this order:
/*
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
*/

console.warn('[AFS] This file has been split into modules. Please load the individual module files instead.');
