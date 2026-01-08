# Cache TTL Cleanup Audit Report

## Issue: Filters cache does not clear after TTL

## Findings

### 1. **Logger Disabled** ⚠️ CRITICAL
- **Location**: `app/core/cache/cache.service.ts:12` and `app/core/cache/cache.manager.ts:8`
- **Issue**: Cache logger is set to `{disabled: true}`, making it impossible to see:
  - If cleanup is running
  - How many entries are being cleaned
  - Any errors during cleanup
- **Impact**: No visibility into cache cleanup operations

### 2. **Cleanup Interval Configuration** ✅ OK
- **Location**: `app/core/cache/cache.manager.ts:34`
- **Status**: Default value of 60 seconds (1 minute) is properly set
- **Note**: If `checkInterval` is explicitly set to 0, it could cause issues

### 3. **Cleanup Mechanism** ✅ FUNCTIONAL
- **Location**: `app/core/cache/cache.manager.ts:179-216`
- **Status**: Cleanup logic is correct:
  - Runs every `checkInterval` (default: 1 minute)
  - Checks all entries for expiration
  - Removes expired entries
  - Logs cleanup results (but logger is disabled)

### 4. **TTL Configuration** ⚠️ POTENTIAL ISSUE
- **Location**: `app/core/cache/cache.service.ts:38-50`
- **Issue**: CacheService passes `cacheOptions` with potentially undefined values:
  ```typescript
  const cacheOptions: CacheOptions = {
    ttl: options.ttl,  // Could be undefined
    maxSize: options.maxSize || parseInt(process.env.CACHE_MAX_SIZE || '2000'),
    checkInterval: options.checkInterval,  // Could be undefined
  };
  ```
- **Impact**: 
  - If `checkInterval` is explicitly `undefined`, CacheManager will use default (OK)
  - If `checkInterval` is `0` or `null`, cleanup might not work properly
  - CacheManager's `defaultTTL` is set from `options.ttl`, but entries use `filterTTL` (10 min) - this is OK as entries override default

### 5. **Entry Expiration Check** ✅ FUNCTIONAL
- **Location**: `app/core/cache/cache.manager.ts:47-66`
- **Status**: `get()` method properly checks expiration and removes expired entries
- **Note**: This is a lazy cleanup (on access), but periodic cleanup should also work

## Root Causes

1. **No visibility**: Logger is disabled, so we can't verify if cleanup is working
2. **Potential edge case**: If `checkInterval` is explicitly set to 0, cleanup won't work
3. **No error handling**: If cleanup throws an error, the interval might stop

## Recommendations

1. ✅ Enable cache logging (at least for cleanup operations)
2. ✅ Add error handling to cleanup process
3. ✅ Validate checkInterval is not 0 or negative
4. ✅ Add monitoring/logging to verify cleanup is running
5. ✅ Consider adding a manual cleanup trigger for debugging

## Fixes Applied

1. ✅ **Enabled cache logging** - Changed from `{disabled: true}` to `{disabled: process.env.CACHE_LOG_DISABLED === 'true'}` 
   - Cache logging is now enabled by default
   - Can be disabled by setting `CACHE_LOG_DISABLED=true` environment variable
   - This provides visibility into cleanup operations

2. ✅ **Added error handling to cleanup process** - Wrapped cleanup in try-catch
   - Prevents cleanup interval from stopping if an error occurs
   - Logs errors for debugging

3. ✅ **Added validation for checkInterval** - Ensures checkInterval is always > 0
   - Prevents invalid intervals that could break cleanup
   - Defaults to 60 seconds if invalid value is provided

4. ✅ **Enhanced cleanup logging** - Added detailed logging:
   - Logs number of entries removed
   - Logs total entries before/after cleanup
   - Periodic logging even when no cleanup is needed (every 10th run)

5. ✅ **Added manual cleanup method** - `forceCleanup()` method for debugging/testing
   - Allows manual trigger of cleanup
   - Returns number of entries cleaned

## Testing Recommendations

1. **Monitor logs** - Check for "Cache cleanup completed" messages every minute
2. **Verify TTL** - Set a short TTL (e.g., 1 minute) and verify entries are removed
3. **Check stats** - Use `getStats()` to see expired entry counts
4. **Manual cleanup** - Call `forceCleanup()` to test cleanup manually

## Environment Variables

- `CACHE_LOG_DISABLED=true` - Disable cache logging (default: enabled)
- `CACHE_MAX_SIZE` - Maximum cache entries (default: 2000)
- `CACHE_SEARCH_TTL` - Search cache TTL in ms (default: 300000 = 5 min)
- `CACHE_FILTER_TTL` - Filter cache TTL in ms (default: 600000 = 10 min)
- `CACHE_FILTER_LIST_TTL` - Filter list cache TTL in ms (default: 600000 = 10 min)

