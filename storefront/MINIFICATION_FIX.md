# Minification Issues and Fixes

## Common Reasons Minification Breaks Code

1. **Dynamic Property Access**: Code like `params[key]` or `filters[k]` should work, but minification can cause variable name conflicts
2. **Custom DOM Properties**: Properties like `element._items`, `dialog._slider` must be preserved
3. **Reserved Words**: Minification might use reserved words as variable names
4. **Scope Issues**: Variable renaming can break closures
5. **Function/Class Names**: Code that relies on function names can break

## Current Fix Applied

- Added `keepNames: true` when minifying to preserve function/class names
- esbuild does NOT mangle property names by default, so `obj.property` and `obj[key]` are safe
- Dynamic property access like `params[key]` should work correctly

## To Enable Minification

Set environment variable: `MINIFY=true npm run build`

Or change `BUILD_MINIFY` in `build.ts` to `true`

## If Issues Persist

1. Check browser console for specific errors
2. Verify dynamic property access patterns
3. Ensure no reserved words are used
4. Check for scope/closure issues

