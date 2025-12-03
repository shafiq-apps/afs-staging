# Advanced Filter Search - Theme App Extension Guide

## Overview
This extension follows Shopify's [Theme App Extension](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration) structure and best practices.

## File Structure

```
theme-extension/
├── assets/                    # CSS, JavaScript, and static files
│   ├── advanced-filter-search.css
│   ├── afs-constants.js       # Constants (1KB)
│   ├── afs-utils-core.js      # Core utilities (4KB)
│   ├── afs-logger.js          # Logger (2KB)
│   ├── afs-utils.js           # Main utilities (10KB)
│   ├── afs-state.js           # State manager (4KB)
│   ├── afs-url.js             # URL manager (3KB)
│   ├── afs-api.js             # API client (needs splitting)
│   ├── afs-dom.js             # DOM renderer (needs splitting)
│   ├── afs-filters.js         # Filter manager
│   ├── afs-events.js          # Event handlers (needs splitting)
│   └── afs-main.js            # Main instance
├── blocks/                    # App blocks
│   ├── advanced-filter-search.liquid  # Main filter block
│   └── afs-logger-config.liquid      # Logger config (app embed)
├── snippets/                  # Liquid snippets
│   └── advanced-filter-search-init.liquid
├── locales/                   # Translation files
├── shopify.extension.toml    # Extension configuration
└── package.json
```

## File Size Limits

According to [Shopify documentation](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#file-and-content-size-limits):

| Content | Limit | Status |
|---------|-------|--------|
| All files in extension | 10 MB | ✅ Enforced |
| JS (compressed) per file | 10 KB | ⚠️ Suggested |
| CSS (compressed) | 100 KB | ✅ Suggested |
| Liquid across all files | 100 KB | ✅ Enforced |

**Note**: Some modules may exceed 10KB and need further splitting.

## App Blocks

### 1. Advanced Filter Search Block
- **File**: `blocks/advanced-filter-search.liquid`
- **Target**: `section` (can be added to theme sections)
- **Settings**: API URL, container selectors, pagination
- **Assets**: Loads CSS via schema, JS modules manually

### 2. AFS Logger Config (App Embed Block)
- **File**: `blocks/afs-logger-config.liquid`
- **Target**: `body` (loads on all pages)
- **Settings**: Enable logging, log level
- **Purpose**: Configure logging globally

## How It Works

### For Merchants (Theme Editor)

1. **Add Logger Config Block** (optional):
   - Go to Theme Editor > Theme Settings > Apps
   - Enable "AFS Logger Config" app embed block
   - Configure logging settings

2. **Add Filter Block**:
   - Go to any section in Theme Editor
   - Click "Add block" > "Advanced Filter Search"
   - Configure API URL and container selectors
   - Save

### Module Loading

Modules are loaded in this order:
1. Constants
2. Utils Core (FilterConfigIndex, MemoCache, HashUtils)
3. Logger
4. Utils (main utilities)
5. State Manager
6. URL Manager
7. API Client
8. DOM Renderer
9. Filter Manager
10. Event Handlers
11. Main Instance

## Logger Configuration

### Via App Embed Block (Recommended)
1. Enable "AFS Logger Config" in Theme Settings > Apps
2. Toggle "Enable Debug Logging"
3. Select log level
4. Save

### Manual Configuration
The logger checks for `window.AFS_LOGGER_ENABLED` flag:
```liquid
<script>
  window.AFS_LOGGER_ENABLED = true;
  window.AFS_LOG_LEVEL = 'debug';
</script>
```

## Block Settings

### Advanced Filter Search Block Settings:
- **API Base URL**: Your API endpoint
- **Shop Domain**: Auto-filled from `{{ shop.permanent_domain }}`
- **Container Selectors**: CSS selectors for containers
- **Products Per Page**: Pagination size

### Logger Config Block Settings:
- **Enable Debug Logging**: Toggle logging on/off
- **Log Level**: error, warn, info, or debug

## Best Practices

1. ✅ **Keep logging disabled in production**
2. ✅ **Use app embed blocks for global scripts** (like logger config)
3. ✅ **Use app blocks for page-specific content** (like filter block)
4. ✅ **Load assets via `asset_url` filter** (as per docs)
5. ✅ **Keep individual JS files under 10KB** (split if needed)
6. ✅ **Use schema attributes for single-file assets** when possible

## References

- [Shopify Theme App Extensions Documentation](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration)
- [File Size Limits](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#file-and-content-size-limits)
- [App Blocks](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-blocks-for-themes)
- [App Embed Blocks](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-embed-blocks)

