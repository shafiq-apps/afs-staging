# Filter Query Parameters Guide

## Overview

This guide explains how to use query parameters to filter and search products. The API supports both **option names** (e.g., "Size", "Color") and **short handles/IDs** (e.g., "pr_a3k9x", "op_rok5d") for better performance and shorter URLs.

---

## Query Parameter Formats

### Standard Filters

| Parameter | Format | Example | Description |
|-----------|--------|---------|-------------|
| `shop` | string | `shop.myshopify.com` | **Required** - Shop domain |
| `search` | string | `jacket` | Search query for product titles, vendors, etc. |
| `vendor` / `vendors` | comma-separated | `Nike,Adidas` | Filter by vendor names |
| `productType` / `productTypes` | comma-separated | `Jacket,Shirt` | Filter by product types |
| `tag` / `tags` | comma-separated | `sale,new` | Filter by product tags |
| `collection` / `collections` | comma-separated | `174251016285` | Filter by collection IDs |
| `priceMin` | number | `10.00` | Minimum product price |
| `priceMax` | number | `100.00` | Maximum product price |
| `variantPriceMin` | number | `5.00` | Minimum variant price |
| `variantPriceMax` | number | `50.00` | Maximum variant price |

### Option Filters (Variant Options)

Option filters support **three formats**:

#### 1. Option Names (Traditional)
```
options[Size]=M,XXXL
options[Color]=Dark+Grey,Red
```

#### 2. Option Handles/IDs (Recommended - Shorter URLs)
```
options[pr_a3k9x]=M,XXXL
options[op_rok5d]=Dark+Grey,Red
```

#### 3. Direct Handle/ID Keys (Shortest)
```
pr_a3k9x=M,XXXL
op_rok5d=Dark+Grey,Red
```

**Note:** Handles/IDs are automatically mapped to option names using the active filter configuration. If no filter config is active, option names must be used.

---

## Handle/ID Format

- **Length:** 6-9 characters total
- **Format:** `{prefix}_{random}` (e.g., `pr_a3k9x`, `op_rok5d`)
- **Characters:** Lowercase alphanumeric + underscore only
- **URL-friendly:** No spaces or special characters

### Common Handle Prefixes

| Prefix | Type | Example |
|--------|------|---------|
| `pr_` | Price | `pr_a3k9x` |
| `vn_` | Vendor | `vn_x7m2p` |
| `pt_` | Product Type | `pt_k9m2x` |
| `tg_` | Tags | `tg_m3k9p` |
| `cl_` | Collection | `cl_x7m2k` |
| `op_` | Generic Option | `op_rok5d` |

---

## Complete Example URLs

### Using Option Names (Backward Compatible)
```
GET /storefront/products?shop=shop.myshopify.com&options[Size]=M,XXXL&options[Color]=Dark+Grey
```

### Using Option Handles/IDs (Recommended)
```
GET /storefront/products?shop=shop.myshopify.com&options[pr_a3k9x]=M,XXXL&options[op_rok5d]=Dark+Grey
```

### Using Direct Handles (Shortest)
```
GET /storefront/products?shop=shop.myshopify.com&pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey
```

### Mixed Format (Also Supported)
```
GET /storefront/products?shop=shop.myshopify.com&options[Size]=M&op_rok5d=Dark+Grey
```

---

## Getting Filter Configuration

To get the mapping of handles/IDs to option names, call the storefront filters endpoint:

```
GET /storefront/filters?shop=shop.myshopify.com
```

Response includes `filterConfig.options` with:
- `handle` - The short handle/ID to use in query parameters
- `optionId` - Alternative ID (also supported)
- `label` - Display name
- `optionType` - Full option type identifier
- `variantOptionKey` - The actual option name used for filtering

**Example Response:**
```json
{
  "filterConfig": {
    "options": [
      {
        "handle": "pr_a3k9x",
        "optionId": "op_rok5d",
        "label": "Size",
        "optionType": "Size##6f30",
        "variantOptionKey": "size"
      }
    ]
  }
}
```

---

## Performance Benefits

### Shorter URLs
- **Before:** `options[Size]=M,XXXL&options[Color]=Dark+Grey` (47 chars)
- **After:** `pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey` (33 chars)
- **Savings:** ~30% shorter URLs

### Faster Parsing
- Handles are shorter and easier to parse
- Less URL encoding needed
- Better cache key generation

### Better SEO
- Shorter URLs are more user-friendly
- Less URL bloat in browser history
- Cleaner sharing links

---

## Backward Compatibility

The API maintains **full backward compatibility**:

1. **Option names still work:** `options[Size]=M` continues to work
2. **Automatic mapping:** Handles/IDs are automatically resolved to option names
3. **Fallback:** If handle/ID not found, the original key is used (assumes it's an option name)

---

## Implementation Details

### Mapping Logic

1. Query parameters are parsed (supports all three formats)
2. If filter config is active, handles/IDs are mapped to option names
3. Option names are used for Elasticsearch filtering
4. Results are returned with original query parameter format preserved

### Supported Query Parameter Patterns

The parser recognizes these patterns:
- `options[key]=value` - Standard format
- `option.key=value` - Dot notation
- `option_key=value` - Underscore notation
- `key=value` - Direct key (if it matches a handle/ID pattern)

---

## Best Practices

1. **Use handles/IDs for new implementations** - Shorter URLs, better performance
2. **Cache filter configuration** - Get handle mappings once, reuse them
3. **Support both formats** - For maximum compatibility
4. **Use direct handles for shortest URLs** - `pr_a3k9x=M` instead of `options[pr_a3k9x]=M`

---

## Migration Guide

### For Existing Implementations

No changes required! Option names continue to work.

### For New Implementations

1. Fetch filter configuration from `/storefront/filters`
2. Extract `handle` or `optionId` from each option
3. Use handles/IDs in query parameters instead of option names
4. Enjoy shorter URLs and better performance!

---

## Examples

### Example 1: Basic Filtering
```
GET /storefront/products?shop=shop.myshopify.com&pr_a3k9x=M,XXXL
```

### Example 2: Multiple Filters
```
GET /storefront/products?shop=shop.myshopify.com&pr_a3k9x=M&op_rok5d=Dark+Grey&tags=sale
```

### Example 3: With Search
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket&pr_a3k9x=M
```

### Example 4: Full Featured
```
GET /storefront/products?shop=shop.myshopify.com&search=jacket&pr_a3k9x=M,XXXL&op_rok5d=Dark+Grey&priceMin=10&priceMax=100&page=1&limit=20
```

---

## Error Handling & Sanitization

- **Invalid handles/IDs:** If a handle/ID doesn't match any filter option, it's treated as an option name
- **Missing filter config:** If no filter config is active, option names must be used
- **Malformed parameters:** Invalid formats are ignored (backward compatible)
- **Dangerous characters:** All query parameter keys and values are automatically sanitized to prevent injection attacks
  - Null bytes, control characters, and HTML/script injection chars are removed
  - Option keys are limited to 200 characters
  - Option values are limited to 500 characters
  - Special characters that could break queries are filtered out

---

## How Option Detection Works

The system uses a **two-phase detection** approach:

### Phase 1: Initial Detection (in `parseOptionFilters()`)
This happens **before** we have the filter config, so it uses pattern matching:

1. **Pattern-Based Detection**
   - Keys matching `options[key]=value`, `option.key=value`, or `option_key=value`
   - These are explicitly marked as option filters

2. **Handle/ID Pattern Detection**
   - Direct keys matching `{prefix}_{random}` pattern (e.g., `pr_a3k9x`, `op_rok5d`)
   - Pattern: `^[a-z]{2,3}_[a-z0-9]{3,10}$`
   - These are **candidates** for option filters (validated in Phase 2)

3. **Reserved Parameter Exclusion**
   - Known non-option params are excluded: `shop`, `search`, `vendor`, `productType`, etc.

### Phase 2: Filter Config Validation (in `applyFilterConfigToInput()`)
This happens **after** we have the filter config, using the **actual option definitions**:

1. **Authoritative Validation**
   - Uses `isOptionKey()` to check if a key matches any option in the filter config
   - Checks against `handle`, `optionId`, and `optionType` fields
   - Only **published** options are considered

2. **Mapping to Option Names**
   - Uses `mapOptionKeyToName()` to map handles/IDs to actual option names
   - Returns `variantOptionKey` if available, otherwise `optionType`
   - Keys that don't match any option are filtered out

### Detection Flow Example

```
Query: ?shop=myshop.com&pr_e2e1j=100-500&search=jacket

Phase 1: parseOptionFilters() [No filter config yet]
    ↓
1. shop → Reserved param (skip)
2. pr_e2e1j → Not reserved, matches handle pattern → Add to optionFilters
3. search → Reserved param (skip)
    ↓
Result: optionFilters = { "pr_e2e1j": ["100-500"] }

Phase 2: applyFilterConfigToInput() [Filter config available]
    ↓
1. Get filter config for shop
2. Check: isOptionKey(filterConfig, "pr_e2e1j")?
   - Look in filterConfig.options for:
     * handle === "pr_e2e1j" → Found! (Price option)
     * optionId === "pr_e2e1j" → Not needed (already found)
     * optionType === "pr_e2e1j" → Not needed
    ↓
3. Map: mapOptionKeyToName(filterConfig, "pr_e2e1j")
   - Found option: { handle: "pr_e2e1j", optionType: "Price", variantOptionKey: null }
   - Return: "Price" (using optionType)
    ↓
4. Final result: options = { "Price": ["100-500"] }
    ↓
5. If key didn't match any option → Filtered out (not included in final options)
```

### Key Points

- **Filter Config is Authoritative**: The option object (with `handle`, `optionId`, `optionType`) defines what is a valid option filter
- **Two-Phase Approach**: Initial detection is permissive (pattern-based), final validation is strict (config-based)
- **Only Published Options**: Only options with `status === 'published'` are considered
- **Automatic Filtering**: Keys that don't match any option in the config are automatically filtered out

## Notes

- Handles/IDs are case-sensitive
- Option names are case-insensitive (normalized to lowercase)
- Multiple values are comma-separated
- URL encoding is handled automatically
- All formats can be mixed in the same request
- Direct handle keys are automatically detected (no prefix needed)

