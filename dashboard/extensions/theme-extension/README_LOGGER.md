# Advanced Filter Search - Logger Configuration

## Overview
The logger is **disabled by default** for production performance. You can enable it via Shopify theme settings for debugging purposes.

## Setup Instructions

### Step 1: Add Theme Settings
The `settings_schema.json` file has been created with logger settings. This allows merchants/developers to enable logging from the Shopify theme editor.

### Step 2: Add Logger Config Snippet
Add the logger configuration snippet to your theme's `theme.liquid` file, **BEFORE** the AFS module scripts:

```liquid
<!-- In theme.liquid, before AFS scripts -->
{% render 'afs-logger-config' %}

<!-- Then load AFS modules -->
<script src="{{ 'afs-constants.js' | asset_url }}" defer></script>
<script src="{{ 'afs-utils-core.js' | asset_url }}" defer></script>
<!-- ... other modules ... -->
```

### Step 3: Enable in Theme Editor
1. Go to **Online Store > Themes > Customize**
2. Navigate to **Theme Settings** (or use the search)
3. Find **"Advanced Filter Search"** section
4. Toggle **"Enable Debug Logging"** to ON
5. Select desired **"Log Level"**:
   - **Errors Only**: Only show errors
   - **Warnings and Errors**: Show warnings and errors
   - **Info, Warnings, and Errors**: Show info, warnings, and errors
   - **All Logs (Debug)**: Show everything including performance metrics

### Step 4: Save and Test
1. Save the theme
2. Open browser console (F12)
3. You should see `[AFS]` prefixed logs if enabled

## Manual Configuration (Alternative)

If you prefer to enable logging manually without theme settings:

```liquid
<!-- In theme.liquid, before AFS scripts -->
<script>
  // Enable logging
  window.AFS_LOGGER_ENABLED = true;
  // Optional: Set log level ('error', 'warn', 'info', 'debug')
  window.AFS_LOG_LEVEL = 'debug';
</script>
```

## Log Levels

- **error**: Only critical errors
- **warn**: Warnings and errors
- **info**: Informational messages, warnings, and errors
- **debug**: All logs including performance metrics

## Production Best Practices

✅ **DO:**
- Keep logging **disabled** in production
- Enable only when debugging issues
- Use "error" or "warn" level in staging
- Use "debug" only during development

❌ **DON'T:**
- Leave logging enabled in production
- Use "debug" level in production
- Enable logging for all users

## Example Console Output

When enabled, you'll see logs like:
```
[AFS] [Info] Initializing Advanced Filter Search
[AFS] [Debug] Applying filters {vendor: [], tags: []}
[AFS] [Performance] renderProducts: 45.23ms
[AFS] [Info] Products fetched successfully {count: 20}
```

## Troubleshooting

**Logs not showing?**
1. Check if `window.AFS_LOGGER_ENABLED` is set to `true`
2. Verify the snippet is loaded before AFS modules
3. Check browser console for any errors
4. Ensure theme settings are saved

**Too many logs?**
- Lower the log level in theme settings
- Use "warn" or "error" instead of "debug"

