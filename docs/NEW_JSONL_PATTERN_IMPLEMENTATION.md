# New JSONL Pattern Implementation

## Pattern Understanding

Based on the sample file, the new JSONL format follows a **guaranteed sequential pattern**:

```
Product Row (gid://shopify/Product/...)
  ↓
MediaImage rows (with __parentId → Product)
  ↓
ProductVariant rows (with __parentId → Product)
  ↓
Collection rows (with __parentId → Product) - represents product-to-collection relationships
  ↓
NEXT Product Row (gid://shopify/Product/...) ← Previous product is COMPLETE
```

**Key Insight**: When we see a new Product row, we know **all data for the previous product has been collected**. This makes flushing safe and predictable.

## Implementation Changes

### 1. **Simplified Tracking**
- Removed complex `productPendingData` tracking
- Removed `LOOKAHEAD_LINES` and `MIN_LINES_SINCE_PRODUCT` thresholds
- Added simple `currentProductId` tracking
- Added `completeProducts` Set to track products ready to flush

### 2. **Pattern-Based Flushing**
```typescript
if (type === "Product") {
  // When we see a new Product row, flush the previous one
  if (currentProductId && products[currentProductId]) {
    await flushProduct(currentProductId); // Safe - all data collected
  }
  // Start collecting new product
  currentProductId = pid;
  products[pid] = { ...row, images: [], variants: [], collections: [] };
}
```

### 3. **Collection Handling**
In the new format, Collection rows with `__parentId` pointing to a Product represent product-to-collection relationships:

```typescript
if (type === "Collection") {
  const parentId = row.__parentId;
  if (parentId && extractShopifyResourceType(parentId) === "Product") {
    // This is a product-to-collection relationship
    const collectionId = normalizeShopifyId(row.id);
    productCollections[productId].add(collectionId);
  }
}
```

### 4. **Batch Full Handling**
When batch is full:
- Only flush **complete products** (not the current one being collected)
- Current product stays in memory until we see the next Product row
- This ensures no data loss even when batch fills up mid-product

### 5. **Memory Pressure Handling**
When memory threshold is reached:
- Only flush complete products (excluding `currentProductId`)
- Current product is protected from premature flushing
- Prevents data loss while managing memory

## Benefits

1. **No Data Loss**: Products are only flushed when complete (next Product row seen)
2. **Simpler Logic**: No complex lookahead or timing calculations
3. **Predictable**: Pattern is guaranteed by the JSONL format
4. **Efficient**: No unnecessary deferrals or post-processing for normal cases
5. **Safe Batching**: Batch can fill up without losing data

## Edge Cases Handled

1. **Orphaned Data**: If related rows arrive for products not in memory (shouldn't happen in new format), they're stored for post-processing
2. **End of File**: Final product is flushed when file ends
3. **Memory Pressure**: Only complete products are flushed, current product is protected
4. **Duplicate Products**: Handled by flushing existing product before starting new one

## Testing

Monitor logs for:
- `✅ Product X has N collections` - Collections found during flush
- `⚠️ Product X has NO collections` - Should be rare in new format
- `Flushing final product X at end of file` - End-of-file handling
- `Memory threshold reached` - Memory pressure handling

## Expected Results

- **Zero data loss** for products in the new JSONL format
- **All collections attached** when products are flushed
- **All variants and images attached** when products are flushed
- **No post-processing needed** for normal cases (only for edge cases)

