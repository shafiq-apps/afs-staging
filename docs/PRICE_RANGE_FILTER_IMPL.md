Elasticsearch Product Price Filtering & Aggregations

This document explains how product price filtering and aggregations work in Elasticsearch when using minPrice and maxPrice fields. It includes real-world examples, overlap logic, and explanations of related code snippets.

1. Product Price Overlap Logic

We store products with two fields:
- minPrice -> lowest possible price of the product
- maxPrice -> highest possible price of the product

Overlap Rule
A product matches a user-selected price range [filterMin, filterMax] if its price range overlaps with the filter range:

product.maxPrice >= filterMin AND product.minPrice <= filterMax

Example
Product | minPrice | maxPrice | User Range | Overlap?
X | 10 | 20 | 6 – 19 | Yes
Y | 15 | 25 | 6 – 19 | Yes
Z | 0 | 5 | 6 – 19 | No

Visual:
Filter: |---------|
X:      |------|
Y:         |------|
Z: |----|

Key Intuition
- product.maxPrice >= filter.minPrice -> product is not completely below filter
- product.minPrice <= filter.maxPrice -> product is not completely above filter
- Both conditions must be true for an overlap

2. Elasticsearch Query Snippets Explained

2.1 Price Filter Query (Node.js Example)
if (!isNaN(sanitizedFilters?.priceMin) || !isNaN(sanitizedFilters?.priceMax)) {
  const priceMustQueries = [];

  if (sanitizedFilters.priceMin !== undefined) {
    priceMustQueries.push({
      range: { [ES_FIELDS.MAX_PRICE]: { gte: sanitizedFilters.priceMin } },
    });
  }

  if (sanitizedFilters.priceMax !== undefined) {
    priceMustQueries.push({
      range: { [ES_FIELDS.MIN_PRICE]: { lte: sanitizedFilters.priceMax } },
    });
  }

  if (priceMustQueries.length > 0) {
    mustQueries.push({
      bool: { must: priceMustQueries },
    });
  }
}

Explanation:
- Checks if the filter range is defined (priceMin or priceMax)
- Adds a range query for maxPrice >= min filter and minPrice <= max filter
- Wraps them in a bool.must, both must hold
- Correctly implements price range overlap

2.2 Alternate Snippet (with excludeFilterType guard)
if (excludeFilterType !== 'price' && (sanitizedFilters?.priceMin !== undefined || sanitizedFilters?.priceMax !== undefined)) {
  const rangeMust = [];
  if (sanitizedFilters.priceMin !== undefined && !isNaN(sanitizedFilters.priceMin)) {
    rangeMust.push({
      range: { [ES_FIELDS.MAX_PRICE]: { gte: sanitizedFilters.priceMin } },
    });
  }
  if (sanitizedFilters.priceMax !== undefined && !isNaN(sanitizedFilters.priceMax)) {
    rangeMust.push({
      range: { [ES_FIELDS.MIN_PRICE]: { lte: sanitizedFilters.priceMax } },
    });
  }
  if (rangeMust.length > 0) {
    baseMustQueries.push({ bool: { must: rangeMust } });
  }
}

Explanation:
- Similar logic with excludeFilterType check
- Builds the must queries only if priceMin or priceMax are valid
- Pushes them to baseMustQueries
- Still enforces overlap logic

3. Aggregations for Price Range

allAggregations.minPrice = { min: { field: ES_FIELDS.MIN_PRICE } };
allAggregations.maxPrice = { max: { field: ES_FIELDS.MAX_PRICE } };

Explanation:
- minPrice -> lowest minPrice among all products
- maxPrice -> highest maxPrice among all products
- Example:
Product | minPrice | maxPrice
X | 10 | 20
Y | 15 | 25
Z | 0 | 5
Aggregation results: minPrice = 0, maxPrice = 25
- Does not guarantee a product is priced exactly at extremes, summarizes the range

4. Real-Time Example (Movie Analogy)
Products = Movies with showtime ranges
- Movie X: 10:00–20:00
- Movie Y: 15:00–25:00
- Movie Z: 0:00–5:00
User free time: 4:00–9:00
- Movie Z overlaps -> Yes 4:00–5:00
- Movie X starts after -> No
- Movie Y starts after -> No
Takeaway: Same logic as price ranges, overlap matters, not containment

5. Summary / Best Practices
1. Use range overlap logic for minPrice/maxPrice filtering
2. Wrap in bool.must or bool.filter (filter is better for performance if scoring not needed)
3. Aggregate minPrice/maxPrice for UI slider boundaries
4. Be aware of edge cases (NaN values, inverted ranges)
5. For exact price distribution, consider storing variant-level prices or nested arrays

This setup provides a robust, performant approach for filtering products in Elasticsearch based on price ranges while correctly handling partial overlaps.

End of document