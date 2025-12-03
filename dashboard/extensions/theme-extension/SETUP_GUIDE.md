# Advanced Filter Search - Setup Guide

## Logger Configuration

### Overview
- ✅ **Logs are DISABLED by default** for production performance
- ✅ Enable/disable via **Shopify Theme Editor** settings
- ✅ Configurable log levels (error, warn, info, debug)

## Quick Setup

### Step 1: Add Logger Config to theme.liquid

Add this snippet **BEFORE** all AFS module scripts in your `theme.liquid` file:

```liquid
<!-- Logger Configuration (must be before AFS modules) -->
{% render 'afs-logger-config' %}
```

### Step 2: Load AFS Modules

Add all AFS modules in order (also in `theme.liquid`):

```liquid
<!-- Load AFS modules in order -->
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
```

### Step 3: Initialize AFS

Add initialization snippet **AFTER** all modules:

```liquid
{% render 'afs-init' %}
```

## Enable Logging via Theme Editor

1. Go to **Online Store > Themes > Customize**
2. Click **Theme Settings** (or search for "Advanced Filter Search")
3. Find **"Advanced Filter Search"** section
4. Toggle **"Enable Debug Logging"** to **ON**
5. Select **"Log Level"**:
   - **Errors Only**: Only critical errors
   - **Warnings and Errors**: Warnings + errors
   - **Info, Warnings, and Errors**: Info + warnings + errors
   - **All Logs (Debug)**: Everything including performance metrics
6. **Save** the theme

## Log Levels Explained

| Level | Shows | Use Case |
|-------|-------|----------|
| **error** | Critical errors only | Production monitoring |
| **warn** | Warnings + errors | Staging/testing |
| **info** | Info + warnings + errors | Development |
| **debug** | All logs + performance | Deep debugging |

## Production Best Practices

### ✅ DO:
- Keep logging **disabled** in production
- Enable only when debugging issues
- Use "error" level for production monitoring
- Use "debug" only during active development

### ❌ DON'T:
- Leave logging enabled in production
- Use "debug" level in production
- Enable logging for all users without reason

## Manual Configuration (Alternative)

If you prefer to enable logging manually without theme settings:

```liquid
<!-- In theme.liquid, before AFS modules -->
<script>
  // Enable logging
  window.AFS_LOGGER_ENABLED = true;
  // Set log level (optional)
  window.AFS_LOG_LEVEL = 'debug'; // or 'error', 'warn', 'info'
</script>
```

## Verify Logging is Working

1. Enable logging in theme settings
2. Open browser console (F12)
3. Look for `[AFS]` prefixed messages
4. You should see: `[AFS] [Info] Logger enabled {level: "debug"}`

## Example Console Output

When enabled, you'll see logs like:

```
[AFS] [Info] Logger enabled {level: "debug"}
[AFS] [Info] Initializing Advanced Filter Search
[AFS] [Debug] Applying filters {vendor: [], tags: []}
[AFS] [Performance] renderProducts: 45.23ms
[AFS] [Info] Products fetched successfully {count: 20}
```

## Troubleshooting

**Q: Logs not showing?**
- Check if `window.AFS_LOGGER_ENABLED` is `true` in console
- Verify `afs-logger-config.liquid` snippet is loaded before modules
- Check browser console for JavaScript errors
- Ensure theme settings are saved

**Q: Too many logs?**
- Lower the log level in theme settings
- Use "warn" or "error" instead of "debug"

**Q: Want to disable quickly?**
- Uncheck "Enable Debug Logging" in theme settings
- Or set `window.AFS_LOGGER_ENABLED = false` in console

## Files Created

- ✅ `snippets/afs-logger-config.liquid` - Logger configuration snippet
- ✅ `snippets/afs-init.liquid` - AFS initialization snippet
- ✅ `config/settings_schema.json` - Theme settings configuration
- ✅ `assets/afs-logger.js` - Updated logger (disabled by default)

