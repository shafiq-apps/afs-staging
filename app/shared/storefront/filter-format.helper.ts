/**
 * Product Filters Format Helper
 * Utility functions for formatting filter aggregations
 */

import { FacetAggregations, FacetValue, StorefrontFilterDescriptor } from './types';
import { PRODUCT_OPTION_PAIR_SEPARATOR } from '@shared/constants/products.constants';
import { Filter } from '@shared/filters/types';

const normalizeString = (value?: string | null) => (value ?? '').trim();
const normalizeKey = (value?: string | null) => normalizeString(value).toLowerCase();
const isPublishedStatus = (status?: string | null) => normalizeKey(status) === 'published';

/**
 * Normalize Elasticsearch aggregation buckets to FacetValue array
 */
export function normalizeBuckets(agg?: { buckets?: Array<{ key: string; doc_count: number }> }): FacetValue[] {
  return (agg?.buckets ?? [])
    .filter((bucket) => bucket.key)
    .map((bucket) => ({
      value: bucket.key, // Original value for filtering
      count: bucket.doc_count,
      label: bucket.key, // Label for display (initially same as value, can be transformed later)
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
      value: optionValue, // Original value for filtering
      count: bucket.doc_count,
      label: optionValue, // Label for display (initially same as value, will be transformed in applyOptionSettings)
    });
  }

  // Sort by count descending
  for (const entry of Object.values(optionEntries)) {
    entry.sort((a, b) => b.count - a.count);
  }

  return optionEntries;
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
      return value
        .split(' ')
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
        .join(' ');
    default:
      return value;
  }
}

/**
 * Group similar values (case-insensitive) and sum their counts.
 * - Keeps the first label
 * - Merges values into a comma-separated string
 */
function groupSimilarValues(items: FacetValue[]): FacetValue[] {
  const grouped = new Map<
    string,
    { values: Set<string>; count: number; label: string }
  >();

  for (const item of items) {
    const rawValue = String(item.value ?? '').trim();
    const normalizedKey = rawValue.toLowerCase();
    const label = String(item.label ?? rawValue);

    const existing = grouped.get(normalizedKey);

    if (existing) {
      existing.count += item.count ?? 0;
      existing.values.add(rawValue);
    } else {
      grouped.set(normalizedKey, {
        values: new Set([rawValue]),
        count: item.count ?? 0,
        label,
      });
    }
  }

  return Array.from(grouped.values()).map((g) => ({
    value: Array.from(g.values).join(','),
    count: g.count,
    label: g.label,
  }));
}



function applyOptionSettings(
  optionItems: FacetValue[],
  configOption?: Filter['options'][number]
): FacetValue[] {
  if (!configOption) {
    return [...optionItems];
  }

  let filteredItems = optionItems;
  if (
    Array.isArray(configOption.allowedOptions) &&
    configOption.allowedOptions.length > 0
  ) {
    const allowedSet = new Set(configOption.allowedOptions.map((value) => normalizeKey(value)));
    console.log("allowedSet", allowedSet);
    filteredItems = optionItems.filter((item) => allowedSet.has(normalizeKey(item.value)));
  }
  
  
  console.log("filteredItems",configOption);

  const optionSettings = configOption.optionSettings || {};
  const processedItems: FacetValue[] = [];

  for (const item of filteredItems) {
    // Keep original value unchanged for filtering
    const originalValue = String(item.value ?? '').trim();
    if (!originalValue) continue;

    // Apply transformations to label (for display), not value (for filtering)
    let label = String(item.label ?? item.value ?? '').trim();

    // Remove prefix from label
    if (Array.isArray(optionSettings.removePrefix)) {
      for (const prefix of optionSettings.removePrefix) {
        const normalizedPrefix = String(prefix).toLowerCase();
        if (label.toLowerCase().startsWith(normalizedPrefix)) {
          label = label.substring(String(prefix).length).trim();
          break;
        }
      }
    }

    // Remove suffix from label
    if (Array.isArray(optionSettings.removeSuffix)) {
      for (const suffix of optionSettings.removeSuffix) {
        const normalizedSuffix = String(suffix).toLowerCase();
        if (label.toLowerCase().endsWith(normalizedSuffix)) {
          label = label.substring(0, label.length - String(suffix).length).trim();
          break;
        }
      }
    }

    // Replace text in label
    if (Array.isArray(optionSettings.replaceText)) {
      for (const replacement of optionSettings.replaceText) {
        if (
          replacement &&
          typeof replacement === 'object' &&
          replacement.from &&
          replacement.to
        ) {
          const regex = new RegExp(replacement.from, 'gi');
          label = label.replace(regex, replacement.to);
        }
      }
    }

    // Filter by prefix - check original value (for filtering accuracy)
    if (Array.isArray(optionSettings.filterByPrefix) && optionSettings.filterByPrefix.length > 0) {
      const matches = optionSettings.filterByPrefix.some((prefix: string) =>
        originalValue.toLowerCase().startsWith(String(prefix).toLowerCase())
      );
      if (!matches) continue;
    }

    processedItems.push({
      value: originalValue, // Original value for filtering (unchanged)
      count: item.count,
      label: label, // Transformed label for display
    });
  }

  let groupedItems: FacetValue[] = processedItems;
  if (optionSettings.groupBySimilarValues === true) {
    groupedItems = groupSimilarValues(processedItems);
  }

  // Apply text transformation to label (for display), keep value unchanged (for filtering)
  let finalItems = groupedItems.map((item) => ({
    value: item.value, // Original value for filtering (unchanged)
    count: item.count,
    label: applyTextTransform(item.label || item.value, optionSettings.textTransform), // Transform label for display
  }));

  if (
    Array.isArray(optionSettings.manualSortedValues) &&
    optionSettings.manualSortedValues.length > 0
  ) {
    // Sort by original value (for filtering accuracy)
    const sortOrder = optionSettings.manualSortedValues.map((value) => value.toLowerCase().trim());
    finalItems.sort((a, b) => {
      const aIndex = sortOrder.indexOf(String(a.value || '').toLowerCase().trim());
      const bIndex = sortOrder.indexOf(String(b.value || '').toLowerCase().trim());

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });
  } else if (optionSettings.sortBy) {
    const sortBy = optionSettings.sortBy.toUpperCase();
    if (sortBy === 'ASCENDING' || sortBy === 'ASC') {
      // Sort by label for display, but use value for comparison if label is missing
      finalItems.sort((a, b) => {
        const aLabel = String(a.label || a.value || '').toLowerCase();
        const bLabel = String(b.label || b.value || '').toLowerCase();
        return aLabel.localeCompare(bLabel);
      });
    } else if (sortBy === 'DESCENDING' || sortBy === 'DESC') {
      finalItems.sort((a, b) => {
        const aLabel = String(a.label || a.value || '').toLowerCase();
        const bLabel = String(b.label || b.value || '').toLowerCase();
        return bLabel.localeCompare(aLabel);
      });
    } else if (sortBy === 'COUNT_ASC') {
      finalItems.sort((a, b) => (a.count || 0) - (b.count || 0));
    } else if (sortBy === 'COUNT' || sortBy === 'COUNT_DESC') {
      finalItems.sort((a, b) => (b.count || 0) - (a.count || 0));
    }
  }

  return finalItems;
}

function findMatchingOptionKey(
  optionsMap: Record<string, FacetValue[]>,
  candidates: Array<string | undefined>
): string | null {
  const optionKeys = Object.keys(optionsMap);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    if (!normalizedCandidate) continue;

    const match = optionKeys.find((key) => normalizeKey(key) === normalizedCandidate);
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Map standard filter optionType to aggregation type and query key
 */
function getStandardFilterMapping(
  optionType?: string | null
): { type: StorefrontFilterDescriptor['type']; queryKey: string; aggregationKey: keyof FacetAggregations } | null {
  if (!optionType) return null;

  const normalized = normalizeKey(optionType);
  const standardFilterMapping: Record<string, { type: StorefrontFilterDescriptor['type']; queryKey: string; aggregationKey: keyof FacetAggregations }> = {
    vendor: { type: 'vendor', queryKey: 'vendors', aggregationKey: 'vendors' },
    vendors: { type: 'vendor', queryKey: 'vendors', aggregationKey: 'vendors' },
    producttype: { type: 'productType', queryKey: 'productTypes', aggregationKey: 'productTypes' },
    'product-type': { type: 'productType', queryKey: 'productTypes', aggregationKey: 'productTypes' },
    'product type': { type: 'productType', queryKey: 'productTypes', aggregationKey: 'productTypes' },
    product_types: { type: 'productType', queryKey: 'productTypes', aggregationKey: 'productTypes' },
    tags: { type: 'tag', queryKey: 'tags', aggregationKey: 'tags' },
    tag: { type: 'tag', queryKey: 'tags', aggregationKey: 'tags' },
    collection: { type: 'collection', queryKey: 'collections', aggregationKey: 'collections' },
    collections: { type: 'collection', queryKey: 'collections', aggregationKey: 'collections' },
  };

  return standardFilterMapping[normalized] || null;
}

/**
 * Create base filter structure with common fields
 */
function createBaseFilter(
  key: string,
  type: StorefrontFilterDescriptor['type'],
  queryKey: string,
  label: string,
  handle: string,
  position: number,
): Partial<StorefrontFilterDescriptor> {
  return {
    key,
    queryKey,
    label,
    handle,
    position,
    optionType: type,
    optionKey: queryKey,
    displayType: 'LIST',
    selectionType: 'MULTIPLE',
    collapsed: false,
    searchable: false,
    showTooltip: false,
    tooltipContent: '',
    showCount: true,
    showMenu: false,
    status: 'PUBLISHED',
    allowedOptions: [],
  };
}

/**
 * Format filter aggregations into array of descriptors
*/
export function formatFilters(
  aggregations?: FacetAggregations,
  filterConfig?: Filter | null
): StorefrontFilterDescriptor[] {
  if (!aggregations) {
    return [];
  }


  if (!filterConfig || !Array.isArray(filterConfig.options) || filterConfig.options.length === 0) {
    // Returning empty to enforce "handles only from filterConfig" rule.
    return [];
  }

  const filters: StorefrontFilterDescriptor[] = [];
  const rawOptions = formatOptionPairs(aggregations.optionPairs?.buckets);
  const usedOptionKeys = new Set<string>();

  // Process configured option filters (including standard filters)
  const sortedOptions = [...filterConfig.options]
    .filter((option) => isPublishedStatus(option.status))
    .sort((a, b) => {
      const posA = a.position !== undefined ? Number(a.position) : 999;
      const posB = b.position !== undefined ? Number(b.position) : 999;
      return posA - posB;
    });

  for (const option of sortedOptions) {
    // Enforce strict rule: option.handle MUST exist
    if (!option.handle) {
      // Skip any configured filter that does not include a handle
      continue;
    }

    // Check if this is a standard filter (collections, vendors, tags, productTypes)
    const standardFilterMapping = getStandardFilterMapping(option.optionType);

    if (standardFilterMapping) {
      // Process as standard filter
      // Check if there's a handle-specific aggregation for this option (for contextual counts)
      const handleSpecificAggregations = (aggregations as any).__handleSpecificAggregations || {};
      let aggregation = handleSpecificAggregations[option.handle];
      
      // Fall back to standard aggregation if no handle-specific one exists
      if (!aggregation) {
        aggregation = aggregations[standardFilterMapping.aggregationKey];
      }
      
      // Type guard: standard filters are TermsAggregation (have buckets property)
      if (!aggregation || !('buckets' in aggregation)) continue;

      const values = normalizeBuckets(aggregation);
      if (!values || values.length === 0) continue;

      const processedValues = applyOptionSettings(values, option);
      if (!processedValues.length) continue;

      const label = option.label || option.optionType || standardFilterMapping.queryKey;

      const baseFilter = createBaseFilter(
        `${standardFilterMapping.type}:${option.handle}`,
        standardFilterMapping.type,
        standardFilterMapping.queryKey,
        label,
        option.handle,
        filters.length
      );

      filters.push({
        ...baseFilter,
        handle: option.handle,
        position: option.position,
        optionType: option.optionType,
        optionKey: standardFilterMapping.queryKey,
        displayType: option.displayType || baseFilter.displayType || 'LIST',
        selectionType: option.selectionType || baseFilter.selectionType || 'MULTIPLE',
        allowedOptions: option.allowedOptions,
        collapsed: option.collapsed ?? baseFilter.collapsed ?? false,
        searchable: option.searchable ?? baseFilter.searchable ?? false,
        showTooltip: option.showTooltip ?? baseFilter.showTooltip ?? false,
        tooltipContent: option.tooltipContent || baseFilter.tooltipContent || '',
        showCount: option.showCount !== undefined ? option.showCount : (baseFilter.showCount ?? true),
        showMenu: option.showMenu ?? baseFilter.showMenu ?? false,
        status: option.status || baseFilter.status || 'PUBLISHED',
        values: processedValues,
      } as StorefrontFilterDescriptor);
    } else {
      // Process as regular option filter
      // Derive variantOptionKey at runtime to ensure perfect ES matching
      const optionSettings = option.optionSettings || {};
      const baseOptionType = optionSettings.baseOptionType?.trim().toUpperCase();
      const derivedVariantOptionKey = baseOptionType === 'OPTION' 
        ? (optionSettings.variantOptionKey || option.optionType?.trim() || null)
        : optionSettings.variantOptionKey || null;
      
      const matchedKey = findMatchingOptionKey(rawOptions, [
        derivedVariantOptionKey,
        option.optionType,
        option.label,
      ]);

      if (!matchedKey) continue;
      const optionValues = rawOptions[matchedKey];
      if (!optionValues || optionValues.length === 0) continue;

      usedOptionKeys.add(matchedKey);
      const processedValues = applyOptionSettings(optionValues, option);
      if (!processedValues.length) continue;

      const label = option.label || option.optionType || matchedKey;

      const baseFilter = createBaseFilter(
        `option:${option.handle}`,
        'option',
        matchedKey,
        label,
        option.handle,
        filters.length
      );

      filters.push({
        ...baseFilter,
        handle: option.handle,
        position: option.position,
        optionType: option.optionType,
        optionKey: matchedKey,
        displayType: option.displayType || baseFilter.displayType || 'LIST',
        selectionType: option.selectionType || baseFilter.selectionType || 'MULTIPLE',
        allowedOptions: option.allowedOptions,
        collapsed: option.collapsed ?? baseFilter.collapsed ?? false,
        searchable: option.searchable ?? baseFilter.searchable ?? false,
        showTooltip: option.showTooltip ?? baseFilter.showTooltip ?? false,
        tooltipContent: option.tooltipContent || baseFilter.tooltipContent || '',
        showCount: option.showCount !== undefined ? option.showCount : (baseFilter.showCount ?? true),
        showMenu: option.showMenu ?? baseFilter.showMenu ?? false,
        status: option.status || baseFilter.status || 'PUBLISHED',
        values: processedValues,
      } as StorefrontFilterDescriptor);
    }
  }

  return filters;
}
