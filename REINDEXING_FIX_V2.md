# Reindexing Fix V2 - Corrected Approach

## Problem with V1
The initial fix was too aggressive - it prevented normal batch flushing from working, causing MORE products to have empty collections (10000 vs 500 before).

## Root Cause of V1 Issue
- Products were marked with `hasPendingData: true` when created
- Safety check prevented flushing until 1000+ lines passed
- Normal batch processing was blocked
- Collections weren't being found during flush

## V2 Fix - Corrected Approach

### Key Changes:

1. **Normal Batch Flushing Restored**
   - Products flush normally when batch is full (no safety checks)
   - Only memory pressure situations use deferred flushing
   - Duplicate products flush immediately

2. **Smarter Pending Data Tracking**
   - Products start with `hasPendingData: false`
   - Only set to `true` when CollectionProduct rows are seen (these can come much later)
   - Variants, images, options don't set pending flag (they come right after product)

3. **Better Collection Lookup**
   - Tries multiple ID formats when looking up collections
   - Merges collections from Product row AND productCollections map
   - More robust key matching

4. **Reduced Deferral Thresholds**
   - LOOKAHEAD_LINES: 2000 (down from 5000)
   - MIN_LINES_SINCE_PRODUCT: 500 (down from 1000)
   - Only used for memory pressure, not normal flushing

5. **Post-Processing Still Active**
   - Handles collections that arrive after flush
   - Handles orphaned images
   - Validates updates

## Expected Behavior Now

### Normal Flow (Most Products):
1. Product row → stored in memory
2. Variants, images, options arrive → attached immediately
3. CollectionProduct rows arrive → added to productCollections map
4. Batch fills up → product flushed with collections from map
5. ✅ Product indexed with collections

### Edge Case (Products with Late Collections):
1. Product row → stored in memory
2. Variants, images arrive → attached
3. Batch fills up → product flushed (collections might be empty)
4. CollectionProduct rows arrive later → added to productCollections map
5. Post-processing → updates product with collections
6. ✅ Product updated with collections

### Memory Pressure:
1. Too many products in memory (> 1000)
2. Only flush products that are "safe" (no pending collections)
3. Products with pending collections wait
4. Prevents data loss while managing memory

## Monitoring

Watch for these log messages:

**Good signs:**
- `✅ Product X has N collections` - Collections found during flush
- `Post-processing: Updating N products` - Recovering lost collections
- `Successfully updated N products` - Post-processing working

**Warning signs:**
- `⚠️ Product X has NO collections` - Check if post-processing recovers it
- `⚠️ Product X flushed early` - Should be handled by post-processing
- `Memory threshold reached but no products are safe to flush` - May need to adjust thresholds

## If Issues Persist

If you still see many products with empty collections:

1. **Check logs** for collection lookup failures
2. **Verify** post-processing is running and succeeding
3. **Check** if CollectionProduct rows are in the JSONL file
4. **Consider** reducing MIN_LINES_SINCE_PRODUCT further (to 200-300)
5. **Verify** ID normalization is working correctly

## Rollback Plan

If this still causes issues, we can:
1. Remove deferred flushing entirely (only use post-processing)
2. Revert to original code + improved post-processing only
3. Use a two-pass approach (collect all relationships first, then index)

