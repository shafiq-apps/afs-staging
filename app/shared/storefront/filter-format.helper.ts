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
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    default:
      return value;
  }
}

/**
 * Group similar values (case-insensitive) and sum their counts
 * Preserves original value for filtering, uses first label for display
 */
function groupSimilarValues(items: FacetValue[]): FacetValue[] {
  const grouped = new Map<string, { value: string; count: number; label: string }>();

  for (const item of items) {
    const normalizedKey = String(item.value || '').toLowerCase().trim();
    const existing = grouped.get(normalizedKey);

    if (existing) {
      existing.count = (existing.count || 0) + (item.count || 0);
    } else {
      grouped.set(normalizedKey, {
        value: String(item.value || ''), // Original value for filtering
        count: item.count || 0,
        label: String(item.label || item.value || ''), // Use label if available, fallback to value
      });
    }
  }

  return Array.from(grouped.values()).map((g) => ({
    value: g.value,
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
    normalizeKey(configOption.targetScope) === 'entitled' &&
    Array.isArray(configOption.allowedOptions) &&
    configOption.allowedOptions.length > 0
  ) {
    const allowedSet = new Set(configOption.allowedOptions.map((value) => normalizeKey(value)));
    filteredItems = optionItems.filter((item) => allowedSet.has(normalizeKey(item.value)));
  }

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

function buildStandardFilter(
  key: string,
  type: StorefrontFilterDescriptor['type'],
  label: string,
  values: FacetValue[]
): StorefrontFilterDescriptor | null {
  if (!values || values.length === 0) {
    return null;
  }

  return {
    key,
    type,
    queryKey: key,
    label,
    displayType: 'LIST',
    selectionType: 'MULTIPLE',
    collapsed: false,
    searchable: true,
    showTooltip: false,
    tooltipContent: '',
    showCount: true,
    showMenu: false,
    status: 'PUBLISHED',
    values,
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

  const filters: StorefrontFilterDescriptor[] = [];
  const rawOptions = formatOptionPairs(aggregations.optionPairs?.buckets);
  const usedOptionKeys = new Set<string>();

  if (filterConfig?.options?.length) {
    const sortedOptions = [...filterConfig.options]
      .filter((option) => isPublishedStatus(option.status))
      .sort((a, b) => {
        const posA = a.position !== undefined ? Number(a.position) : 999;
        const posB = b.position !== undefined ? Number(b.position) : 999;
        return posA - posB;
      });

    for (const option of sortedOptions) {
      const matchedKey = findMatchingOptionKey(rawOptions, [
        option.optionSettings?.variantOptionKey,
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
      filters.push({
        key: `option:${option.handle || matchedKey}`,
        type: 'option',
        queryKey: matchedKey,
        label,
        handle: option.handle,
        position: option.position,
        optionType: option.optionType,
        optionKey: matchedKey,
        displayType: option.displayType || 'LIST',
        selectionType: option.selectionType || 'MULTIPLE',
        targetScope: option.targetScope,
        allowedOptions: option.allowedOptions,
        collapsed: option.collapsed || false,
        searchable: option.searchable || false,
        showTooltip: option.showTooltip || false,
        tooltipContent: option.tooltipContent || '',
        showCount: option.showCount !== undefined ? option.showCount : true,
        showMenu: option.showMenu || false,
        status: option.status,
        values: processedValues,
      });
    }
  }

  const leftoverOptionKeys = Object.keys(rawOptions).filter((key) => !usedOptionKeys.has(key));
  leftoverOptionKeys.sort((a, b) => a.localeCompare(b));

  for (const optionName of leftoverOptionKeys) {
    const optionValues = rawOptions[optionName];
    if (!optionValues || optionValues.length === 0) continue;

    filters.push({
      key: `option:${optionName}`,
      type: 'option',
      queryKey: optionName,
      label: optionName,
      optionType: optionName,
      optionKey: optionName,
      displayType: 'LIST',
      selectionType: 'MULTIPLE',
      collapsed: false,
      searchable: false,
      showTooltip: false,
      tooltipContent: '',
      showCount: true,
      showMenu: false,
      status: 'PUBLISHED',
      values: optionValues,
    });
  }

  const vendors = normalizeBuckets(aggregations.vendors);
  const productTypes = normalizeBuckets(aggregations.productTypes);
  const tags = normalizeBuckets(aggregations.tags);
  const collections = normalizeBuckets(aggregations.collections);

  const standardFilters: Array<StorefrontFilterDescriptor | null> = [
    buildStandardFilter('vendors', 'vendor', 'Vendor', vendors),
    buildStandardFilter('productTypes', 'productType', 'Product Type', productTypes),
    buildStandardFilter('tags', 'tag', 'Tag', tags),
    buildStandardFilter('collections', 'collection', 'Collection', collections),
  ];

  for (const standard of standardFilters) {
    if (standard) {
      filters.push(standard);
    }
  }

  if (
    aggregations.priceRange &&
    (aggregations.priceRange.min !== null || aggregations.priceRange.max !== null)
  ) {
    filters.push({
      key: 'priceRange',
      type: 'priceRange',
      queryKey: 'priceRange',
      label: 'Price',
      displayType: 'RANGE',
      selectionType: 'RANGE',
      collapsed: false,
      searchable: false,
      showTooltip: false,
      tooltipContent: '',
      showCount: true,
      showMenu: false,
      status: 'PUBLISHED',
      range: {
        min: aggregations.priceRange.min ?? 0,
        max: aggregations.priceRange.max ?? 0,
      },
    });
  }

  if (
    aggregations.variantPriceRange &&
    (aggregations.variantPriceRange.min !== null || aggregations.variantPriceRange.max !== null)
  ) {
    filters.push({
      key: 'variantPriceRange',
      type: 'variantPriceRange',
      queryKey: 'variantPriceRange',
      label: 'Variant Price',
      displayType: 'RANGE',
      selectionType: 'RANGE',
      collapsed: false,
      searchable: false,
      showTooltip: false,
      tooltipContent: '',
      showCount: true,
      showMenu: false,
      status: 'PUBLISHED',
      range: {
        min: aggregations.variantPriceRange.min ?? 0,
        max: aggregations.variantPriceRange.max ?? 0,
      },
    });
  }

  return filters;
}

