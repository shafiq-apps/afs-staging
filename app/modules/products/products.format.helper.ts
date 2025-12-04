/**
 * Product Filters Format Helper
 * Utility functions for formatting filter aggregations
 */

import { FacetAggregations, FacetValue } from './products.type';
import { PRODUCT_OPTION_PAIR_SEPARATOR } from '@shared/constants/products.constants';
import { Filter } from '@modules/filters/filters.type';

/**
 * Normalize Elasticsearch aggregation buckets to FacetValue array
 */
export function normalizeBuckets(agg?: { buckets?: Array<{ key: string; doc_count: number }> }): FacetValue[] {
  return (agg?.buckets ?? [])
    .filter((bucket) => bucket.key)
    .map((bucket) => ({
      value: bucket.key,
      count: bucket.doc_count,
    }));
}

/**
 * Format option pairs from aggregations
 */
export function formatOptionPairs(optionPairsBuckets?: Array<{ key: string; doc_count: number }>): Record<string, FacetValue[]> {
  const optionEntries: Record<string, FacetValue[]> = {};
  const buckets = optionPairsBuckets ?? [];

  for (const bucket of buckets) {
    const key = bucket.key || '';
    if (!key.includes(PRODUCT_OPTION_PAIR_SEPARATOR)) continue;
    const [optionName, optionValue] = key.split(PRODUCT_OPTION_PAIR_SEPARATOR);
    if (!optionName || !optionValue) continue;

    if (!optionEntries[optionName]) {
      optionEntries[optionName] = [];
    }

    optionEntries[optionName].push({
      value: optionValue,
      count: bucket.doc_count,
    });
  }

  // Sort by count descending
  for (const entry of Object.values(optionEntries)) {
    entry.sort((a, b) => b.count - a.count);
  }

  return optionEntries;
}

/**
 * Remove empty arrays and objects from response
 * Optimizes response size by removing unnecessary data
 */
function removeEmptyValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return undefined;
    }
    return obj;
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};
    let hasValues = false;

    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = removeEmptyValues(value);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
        hasValues = true;
      }
    }

    return hasValues ? cleaned : undefined;
  }

  return obj;
}

/**
 * Apply text transformation to a value
 */
function applyTextTransform(value: string, transform: string | undefined): string {
  if (!value || !transform || transform === 'none') {
    return value;
  }

  switch (transform.toLowerCase()) {
    case 'capitalize':
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    case 'title':
      return value.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    default:
      return value;
  }
}

/**
 * Group similar values (case-insensitive) and sum their counts
 */
function groupSimilarValues(items: FacetValue[]): FacetValue[] {
  const grouped = new Map<string, { value: string; count: number }>();

  for (const item of items) {
    const normalizedKey = String(item.value || '').toLowerCase().trim();
    const existing = grouped.get(normalizedKey);

    if (existing) {
      // Sum counts
      existing.count = (existing.count || 0) + (item.count || 0);
    } else {
      // Use the first occurrence's value (preserves original casing)
      grouped.set(normalizedKey, {
        value: String(item.value || ''),
        count: item.count || 0,
      });
    }
  }

  return Array.from(grouped.values()).map(g => ({
    value: g.value,
    count: g.count,
  }));
}

/**
 * Process options based on filterConfig settings
 * Applies all filter option settings: targetScope, allowedOptions, groupBySimilarValues,
 * textTransform, showCount, removeSuffix, replaceText, removePrefix, filterByPrefix
 */
function processOptions(
  options: Record<string, FacetValue[]>,
  filterConfig: Filter | null
): Record<string, FacetValue[]> {
  if (!filterConfig || !filterConfig.options || Object.keys(options).length === 0) {
    return options;
  }

  // Sort filterConfig options by position
  const sortedConfigOptions = [...filterConfig.options]
    .filter(opt => opt.status === 'published')
    .sort((a, b) => {
      const posA = a.position !== undefined ? Number(a.position) : 999;
      const posB = b.position !== undefined ? Number(b.position) : 999;
      return posA - posB;
    });

  const processedOptions: Record<string, FacetValue[]> = {};

  // Process options in position order
  for (const configOption of sortedConfigOptions) {
    // Get the option name to look up in options
    const optionSettings = configOption.optionSettings || {};
    // Keep original case for matching (ES stores in original case)
    const variantKey = optionSettings.variantOptionKey?.trim();
    const optionType = configOption.optionType?.trim();
    const label = configOption.label?.trim();

    // Find matching option in options object (case-insensitive matching)
    let matchedKey: string | null = null;
    let optionItems: FacetValue[] | null = null;

    // Try case-insensitive match with variantOptionKey (most reliable)
    if (variantKey) {
      const variantKeyLower = variantKey.toLowerCase();
      for (const key of Object.keys(options)) {
        if (key.toLowerCase().trim() === variantKeyLower) {
          matchedKey = key;
          optionItems = options[key];
          break;
        }
      }
    }

    // Try case-insensitive match with optionType
    if (!matchedKey && optionType) {
      const optionTypeLower = optionType.toLowerCase();
      for (const key of Object.keys(options)) {
        if (key.toLowerCase().trim() === optionTypeLower) {
          matchedKey = key;
          optionItems = options[key];
          break;
        }
      }
    }

    // Try case-insensitive match with label
    if (!matchedKey && label) {
      const labelLower = label.toLowerCase();
      for (const key of Object.keys(options)) {
        if (key.toLowerCase().trim() === labelLower) {
          matchedKey = key;
          optionItems = options[key];
          break;
        }
      }
    }

    if (matchedKey && optionItems && Array.isArray(optionItems) && optionItems.length > 0) {
      // Step 1: Apply targetScope filtering (only include allowedOptions if entitled)
      let filteredItems = optionItems;
      if (configOption.targetScope === 'entitled' && configOption.allowedOptions && Array.isArray(configOption.allowedOptions)) {
        // Create a set of allowed values (normalized to lowercase for comparison)
        const allowedSet = new Set(configOption.allowedOptions.map(v => String(v).toLowerCase().trim()));
        filteredItems = optionItems.filter(item => {
          const itemValue = String(item.value || '').toLowerCase().trim();
          return allowedSet.has(itemValue);
        });
      }

      // Step 2: Process each item (apply removePrefix, removeSuffix, replaceText, filterByPrefix)
      // Note: We DON'T apply textTransform here yet - we'll do it after grouping
      const processedItems: FacetValue[] = [];
      for (const item of filteredItems) {
        let value = String(item.value || '').trim();
        if (!value) continue;

        // Apply removePrefix
        if (optionSettings.removePrefix && Array.isArray(optionSettings.removePrefix)) {
          for (const prefix of optionSettings.removePrefix) {
            if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
              value = value.substring(prefix.length).trim();
              break;
            }
          }
        }

        // Apply removeSuffix
        if (optionSettings.removeSuffix && Array.isArray(optionSettings.removeSuffix)) {
          for (const suffix of optionSettings.removeSuffix) {
            if (value.toLowerCase().endsWith(suffix.toLowerCase())) {
              value = value.substring(0, value.length - suffix.length).trim();
              break;
            }
          }
        }

        // Apply replaceText
        if (optionSettings.replaceText && Array.isArray(optionSettings.replaceText)) {
          for (const replacement of optionSettings.replaceText) {
            if (typeof replacement === 'object' && replacement.from && replacement.to) {
              const regex = new RegExp(replacement.from, 'gi');
              value = value.replace(regex, replacement.to);
            }
          }
        }

        // Apply filterByPrefix
        if (optionSettings.filterByPrefix && Array.isArray(optionSettings.filterByPrefix) && optionSettings.filterByPrefix.length > 0) {
          const originalValue = String(item.value || '').trim();
          const matches = optionSettings.filterByPrefix.some((prefix: string) =>
            originalValue.toLowerCase().startsWith(prefix.toLowerCase())
          );
          if (!matches) continue; // Skip this value
        }

        processedItems.push({
          value,
          count: item.count,
        });
      }

      // Step 3: Group similar values if enabled (case-insensitive grouping)
      // This groups BEFORE textTransform so "Black", "BLACK", "black" all group together
      let groupedItems: FacetValue[] = processedItems;
      if (optionSettings.groupBySimilarValues === true) {
        groupedItems = groupSimilarValues(processedItems);
      }

      // Step 4: Apply textTransform AFTER grouping
      let finalItems = groupedItems.map(item => ({
        ...item,
        value: applyTextTransform(item.value, optionSettings.textTransform),
      }));

      // Step 5: Remove count if showCount is false
      if (configOption.showCount === false) {
        finalItems = finalItems.map(item => {
          const { count, ...rest } = item;
          return rest as FacetValue;
        });
      }

      // Only add if there are items after all processing
      if (finalItems.length > 0) {
        processedOptions[matchedKey] = finalItems;
      }
    }
  }

  // Include any options not in filterConfig (only if they have data and weren't processed)
  for (const [optionName, optionItems] of Object.entries(options)) {
    if (!processedOptions[optionName] && optionItems && optionItems.length > 0) {
      processedOptions[optionName] = optionItems;
    }
  }

  return processedOptions;
}

/**
 * Format filter aggregations to ProductFilters format
 * Optimized: Removes empty arrays/objects and applies filterConfig settings
 */
export function formatFilters(aggregations?: FacetAggregations, filterConfig?: Filter | null) {
  if (!aggregations) {
    return {};
  }

  const formatted: any = {};

  // Process standard filters
  const vendors = normalizeBuckets(aggregations.vendors);
  if (vendors.length > 0) {
    formatted.vendors = vendors;
  }

  const productTypes = normalizeBuckets(aggregations.productTypes);
  if (productTypes.length > 0) {
    formatted.productTypes = productTypes;
  }

  const tags = normalizeBuckets(aggregations.tags);
  if (tags.length > 0) {
    formatted.tags = tags;
  }

  const collections = normalizeBuckets(aggregations.collections);
  if (collections.length > 0) {
    formatted.collections = collections;
  }

  // Process options with filterConfig settings
  const rawOptions = formatOptionPairs(aggregations.optionPairs?.buckets);
  const processedOptions = processOptions(rawOptions, filterConfig || null);
  if (Object.keys(processedOptions).length > 0) {
    formatted.options = processedOptions;
  }

  // Price ranges (only include if they have valid values)
  if (aggregations.priceRange && (aggregations.priceRange.min !== null || aggregations.priceRange.max !== null)) {
    formatted.priceRange = aggregations.priceRange;
  }

  if (aggregations.variantPriceRange && (aggregations.variantPriceRange.min !== null || aggregations.variantPriceRange.max !== null)) {
    formatted.variantPriceRange = aggregations.variantPriceRange;
  }

  // Remove any remaining empty values
  return removeEmptyValues(formatted);
}

