# Filter State Optimization Proposal

## Current Flow (Inefficient)

```
URL: ?ef4gd=red&pr_a3k9x=M
  ↓ (parse with handleMap lookup)
State: { options: { Color: ["red"], Size: ["M"] } }
  ↓ (convert with optionMap lookup)
API: ?options[Color]=red&options[Size]=M
  ↓ (server maps back to handles)
ES Query: optionPairs.keyword = ["Color|red", "Size|M"]
```

**Issues:**
- 2 conversion steps (handle → option name → handle)
- Requires handleMap/optionMap lookups
- State structure doesn't match URL structure
- Slower rendering due to conversions

## Proposed Flow (Optimized)

```
URL: ?ef4gd=red&pr_a3k9x=M
  ↓ (direct parse, no conversion)
State: { ef4gd: ["red"], pr_a3k9x: ["M"], vendor: [], ... }
  ↓ (direct send, no conversion)
API: ?ef4gd=red&pr_a3k9x=M
  ↓ (server maps handles to option names)
ES Query: optionPairs.keyword = ["Color|red", "Size|M"]
```

**Benefits:**
- 0 conversion steps in frontend
- No handleMap/optionMap needed for state management
- State structure matches URL structure (1:1)
- Faster rendering (direct access)
- Simpler code

## New State Structure

```javascript
const State = {
  filters: {
    // Standard filters (fixed keys)
    vendor: [],
    productType: [],
    tags: [],
    collections: [],
    search: '',
    priceRange: null,
    
    // Dynamic option filters (handles as keys)
    // ef4gd: ["red", "blue"],  // Color filter
    // pr_a3k9x: ["M", "L"],    // Size filter
    // ... any handle from ES
  },
  
  // Metadata (for rendering only, not filtering)
  filterMetadata: {
    // Map of handle -> { label, type, values }
    ef4gd: { label: "Color", type: "option", values: [...] },
    pr_a3k9x: { label: "Size", type: "option", values: [...] }
  }
}
```

## Implementation Changes

### 1. URL Parsing (Simplified)
```javascript
UrlManager.parse() {
  const params = {};
  url.searchParams.forEach((value, key) => {
    if (EXCLUDED_QUERY_PARAMS.has(key)) return;
    
    // Standard filters
    if (key === 'vendor' || key === 'vendors') {
      params.vendor = $.split(value);
    }
    // ... other standard filters
    
    // Everything else is a handle (dynamic filter)
    else {
      params[key] = $.split(value); // Direct assignment
    }
  });
  return params;
}
```

### 2. State Management (Direct)
```javascript
// Toggle filter - no conversion needed
Filters.toggle(handle, value) {
  const current = State.filters[handle] || [];
  const isActive = current.includes(value);
  State.filters[handle] = isActive
    ? current.filter(v => v !== value)
    : [...current, value];
  
  // Direct update, no mapping
  UrlManager.update(State.filters, ...);
  this.apply();
}
```

### 3. API Request (Direct)
```javascript
API.products(filters, ...) {
  const params = new URLSearchParams();
  params.set('shop', State.shop);
  
  Object.keys(filters).forEach(key => {
    const value = filters[key];
    if (Array.isArray(value) && value.length > 0) {
      params.set(key, value.join(',')); // Direct send
    }
    // ... handle other types
  });
  
  // URL: ?ef4gd=red&pr_a3k9x=M (handles directly)
}
```

### 4. Filter Rendering (Metadata Only)
```javascript
// Use filterMetadata for display labels
DOM.renderFilters(filters) {
  filters.forEach(filter => {
    const handle = filter.handle; // ef4gd
    const label = filter.label;   // "Color"
    
    // Store metadata for rendering
    State.filterMetadata[handle] = {
      label: filter.label,
      type: filter.type,
      values: filter.values
    };
    
    // Render using handle as key
    const isChecked = (State.filters[handle] || []).includes(value);
  });
}
```

## Performance Comparison

| Operation | Current | Proposed | Improvement |
|-----------|---------|----------|-------------|
| URL Parse | 2 lookups | 0 lookups | 2x faster |
| State Update | 1 conversion | 0 conversions | Instant |
| API Request | 1 conversion | 0 conversions | Instant |
| Filter Check | 1 lookup | Direct access | 2x faster |

## Migration Path

1. **Phase 1**: Support both formats (backward compatible)
   - Accept handles in URL
   - Store in state as handles
   - Convert only when sending to API (if needed)

2. **Phase 2**: Remove conversions
   - Server already accepts handles
   - Remove handleMap/optionMap from state management
   - Keep only for display metadata

3. **Phase 3**: Optimize state structure
   - Flatten dynamic filters into main filters object
   - Use metadata object for display only

## Answer to Your Questions

### Can you use handles as param keys and values?
**YES!** The server's `parseOptionFilters` accepts any key that's not reserved. Handles work directly.

### What should be the flow?
1. **URL**: Use handles directly (`?ef4gd=red`)
2. **State**: Store handles directly (`{ ef4gd: ["red"] }`)
3. **API**: Send handles directly (`?ef4gd=red`)
4. **Server**: Maps handles to option names internally
5. **Rendering**: Use metadata for labels only

### How to maintain state and render fastest?
- **State**: Flat structure, handles as keys
- **No conversions**: Direct URL ↔ State ↔ API
- **Metadata**: Separate object for display (labels, types)
- **Caching**: Cache filter metadata, not conversions

