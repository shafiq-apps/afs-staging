# Filter Aggregation Auto-Exclude Approach

## Problem
Selecting a filter value removes other values from that filter, preventing OR operations (e.g., selecting Vendor XYZ hides other vendors).

## Solution
Auto-exclude each filter from its own aggregation while keeping other filters active.

## How It Works
- **Single Elasticsearch query** with `post_filter` structure
- Each filter excluded from its own aggregation (via `post_filter`)
- Other filters still affect aggregations (via `must` queries)
- Aggregations show all values for that filter type, filtered by other selections

## Example Flow
1. User selects **Vendor: XYZ**
   - Vendor aggregation: Shows all vendors (XYZ, JKL, MNP, etc.)
   - Size aggregation: Shows sizes available in XYZ products
   - Color aggregation: Shows colors available in XYZ products

2. User adds **Vendor: JKL**
   - Vendor aggregation: Still shows all vendors
   - Size aggregation: Shows sizes in XYZ OR JKL products
   - Color aggregation: Shows colors in XYZ OR JKL products

## Performance
- **Single query** - no performance degradation
- Elasticsearch handles `post_filter` efficiently
- Minimal overhead (~50-100ms if any)

## Implementation
- Modify `repository.ts` to auto-exclude each filter from its own aggregation
- Use `post_filter` for the filter being aggregated
- Use `must` queries for all other active filters
- Keep `keep` parameter for special cases (backward compatibility)

## Result
- OR operations enabled by default for all filters
- Standard e-commerce behavior (filters narrow each other)
- Fast, single-query performance

