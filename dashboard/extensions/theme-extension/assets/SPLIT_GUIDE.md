# Module Splitting Guide

## Overview
The `advanced-filter-search.js` file (133KB) has been split into smaller modules to comply with Shopify's 10KB file size limit per script.

## Created Modules

### ✅ Completed:
1. **afs-constants.js** (~1KB) - Configuration constants
2. **afs-utils-core.js** (~4KB) - FilterConfigIndex, MemoCache, HashUtils
3. **afs-logger.js** (~2KB) - Logger utility

### ⚠️ To Be Created:
4. **afs-utils.js** (~8KB) - Main Utils object with query string parsing
5. **afs-state.js** (~5KB) - StateManager
6. **afs-url.js** (~4KB) - URLManager
7. **afs-api.js** (~15KB) - APIClient (may need splitting into afs-api-part1.js and afs-api-part2.js)
8. **afs-dom.js** (~25KB) - DOMRenderer (needs splitting into multiple parts)
9. **afs-filters.js** (~8KB) - FilterManager
10. **afs-events.js** (~12KB) - EventHandlers (may need splitting)
11. **afs-main.js** (~8KB) - Main AFS instance

## Module Pattern

Each module follows this pattern:

```javascript
/**
 * Advanced Filter Search - [Module Name]
 */
(function(global) {
  'use strict';
  
  // Dependencies (access from global.AFS)
  const CONSTANTS = global.AFS?.CONSTANTS || {};
  const Logger = global.AFS?.Logger || {};
  // ... other dependencies
  
  // Module code here
  const ModuleName = {
    // ... module implementation
  };
  
  // Expose to global namespace
  if (typeof window !== 'undefined') {
    window.AFS = window.AFS || {};
    window.AFS.ModuleName = ModuleName;
  } else if (typeof global !== 'undefined') {
    global.AFS = global.AFS || {};
    global.AFS.ModuleName = ModuleName;
  }
  
})(typeof window !== 'undefined' ? window : this);
```

## Next Steps

1. Extract remaining modules from `advanced-filter-search.js`
2. Ensure each module is under 10KB
3. Split large modules (afs-api.js, afs-dom.js) if needed
4. Test module loading order
5. Update theme files to load modules in correct order

## Testing

After creating all modules, test by:
1. Loading modules in order
2. Verifying `window.AFS` namespace is populated
3. Testing initialization: `window.AFS.AFS.init({...})`

