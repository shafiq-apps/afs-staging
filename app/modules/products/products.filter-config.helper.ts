/**
 * Product Filter Configuration Helper
 * Gets active filter configuration for a shop and applies it to product search
 */

import { Filter } from '@modules/filters/filters.type';
import { FiltersRepository } from '@modules/filters/filters.repository';
import { ProductFilterInput, ProductSearchInput } from './products.type';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('products-filter-config-helper');
import crypto from 'crypto';
import { NO_FILTER_CONFIG_HASH } from '@core/cache/cache.key';

/**
 * Get active filter configuration for a shop
 * Returns the first active filter with deploymentChannel 'app' or 'theme'
 */
export async function getActiveFilterConfig(
  filtersRepository: FiltersRepository,
  shop: string
): Promise<Filter | null> {
  try {
    const { filters } = await filtersRepository.listFilters(shop);
    
    // Find UNPUBLISHED and PUBLISHED filter for storefront (app or theme deployment)
    // Note: status === 'PUBLISHED' is the single source of truth for active filters
    const activeFilter = filters.find(
      (f) =>
        f.status === 'PUBLISHED' &&
        (f.deploymentChannel === 'app' || f.deploymentChannel === 'theme')
    );

    if (activeFilter) {
      logger.log('Active filter configuration found', {
        shop,
        filterId: activeFilter.id,
        title: activeFilter.title,
        optionsCount: activeFilter.options?.length || 0,
      });
      return activeFilter;
    }

    logger.log('No active filter configuration found', { shop });
    return null;
  } catch (error: any) {
    logger.error('Error getting active filter configuration', {
      shop,
      error: error?.message || error,
    });
    return null;
  }
}

/**
 * Check if a key matches any option in the filter configuration
 * This is the authoritative way to determine if a query parameter is an option filter
 * 
 * @param filterConfig - The filter configuration containing option definitions
 * @param key - The query parameter key to check
 * @returns True if the key matches any option's handle, or optionType
 */
export function isOptionKey(filterConfig: Filter | null, key: string): boolean {
  if (!filterConfig || !filterConfig.options || !key) {
    return false;
  }

  // Check if key matches any published option's handle, or optionType
  return filterConfig.options.some(
    (opt) =>
      opt.status === 'PUBLISHED' &&
      (opt.handle === key ||
       opt.optionType?.toLowerCase() === key.toLowerCase())
  );
}

/**
 * Map option handles/IDs to option names using filter configuration
 * This allows query parameters to use short handles/IDs instead of full option names
 * 
 * @param filterConfig - The filter configuration containing option mappings
 * @param optionKey - The handle, ID, or option name from query parameters
 * @returns The actual option name to use for filtering, or the original key if not found
 */
export function mapOptionKeyToName(filterConfig: Filter | null, optionKey: string): string {
  if (!filterConfig || !filterConfig.options) {
    return optionKey; // Return as-is if no filter config
  }

  // Find option by handle, or optionType
  const option = filterConfig.options.find(
    (opt) =>
      opt.status === 'PUBLISHED' &&
      (opt.handle === optionKey ||
       opt.optionType?.toLowerCase() === optionKey.toLowerCase())
  );

  if (option) {
    // Return the variantOptionKey if available, otherwise use optionType
    const optionSettings = option.optionSettings || {};
    const baseName = optionSettings.variantOptionKey || 
                     option.optionType?.trim() || 
                     optionKey;
    return baseName;
  }

  // If not found, return original key (might be a direct option name)
  return optionKey;
}

/**
 * Apply filter configuration options to product search/filter input
 * This applies settings like allowedOptions, targetScope, hideOutOfStockItems, etc.
 * Also maps option handles/IDs to actual option names for filtering.
 */
export function applyFilterConfigToInput(
  filterConfig: Filter | null,
  input: ProductFilterInput | ProductSearchInput,
  currentCollection?: string
): ProductFilterInput | ProductSearchInput {
  if (!filterConfig) {
    return input;
  }

  const result = { ...input };
  
  // Apply filter settings
  if (filterConfig.settings?.hideOutOfStockItems && 'hideOutOfStockItems' in result) {
    (result as ProductSearchInput).hideOutOfStockItems = true;
  }

  // Apply targetScope restrictions
  if (filterConfig.targetScope === 'entitled' && filterConfig.allowedCollections?.length > 0) {
    // If filter is scoped to specific collections, ensure we're filtering by those collections
    const allowedCollectionIds = filterConfig.allowedCollections.map((c) => c.id);
    
    if (currentCollection) {
      // If a specific collection is requested, check if it's allowed
      if (!allowedCollectionIds.includes(currentCollection)) {
        // Collection not allowed, return empty result by filtering to non-existent collection
        result.collections = ['__none__'];
      }
    } else if (!result.collections || result.collections.length === 0) {
      // No collection specified, but filter is scoped - apply allowed collections
      result.collections = allowedCollectionIds;
    } else {
      // Collection specified - filter to only allowed ones
      result.collections = result.collections.filter((c) => allowedCollectionIds.includes(c));
    }
  }

  // Map option handles/IDs to actual option names
  // Query parameters may use handles/IDs (e.g., "pr_a3k9x") instead of option names (e.g., "Size")
  // Also filter out any keys that don't match actual options in the filter config
  if (result.options) {
    const mappedOptions: Record<string, string[]> = {};
    
    for (const [queryKey, values] of Object.entries(result.options)) {
      // Check if this key matches an actual option in the filter config
      // This ensures we only process valid option filters
      // Note: 'price' is a special case that might not have a filter option but is still valid
      
      // Map handle/ID to actual option name
      const optionName = mapOptionKeyToName(filterConfig, queryKey);
      
      // Only include if we got a valid mapping or it's a known option name
      if (optionName) {
        // Merge values if the option name already exists (can happen with different handles mapping to same name)
        if (mappedOptions[optionName]) {
          mappedOptions[optionName] = [...new Set([...mappedOptions[optionName], ...values])];
        } else {
          mappedOptions[optionName] = values;
        }
      }
    }
    
    result.options = mappedOptions;
  }

  // Convert standard filter types from options to their proper fields
  // This handles cases where filter config defines vendor/productType/etc as options
  // Standard filters should query their dedicated ES fields (vendor.keyword, productType.keyword, etc.)
  // instead of being treated as variant options (optionPairs.keyword)
  if (result.options) {
    const STANDARD_FILTER_MAPPING: Record<string, keyof ProductFilterInput> = {
      'vendor': 'vendors',
      'vendors': 'vendors',
      'producttype': 'productTypes',
      'product-type': 'productTypes',
      'product type': 'productTypes',
      'product_type': 'productTypes',
      'tags': 'tags',
      'tag': 'tags',
      'collection': 'collections',
      'collections': 'collections',
    };

    const remainingOptions: Record<string, string[]> = {};
    
    for (const [optionName, values] of Object.entries(result.options)) {
      if (!values || values.length === 0) continue;
      
      const normalizedName = optionName.toLowerCase().trim();
      const standardField = STANDARD_FILTER_MAPPING[normalizedName];
      
      if (standardField) {
        // Move to standard filter field
        if (standardField === 'vendors' || standardField === 'productTypes' || 
            standardField === 'tags' || standardField === 'collections') {
          const existing = result[standardField] || [];
          result[standardField] = [...new Set([...existing, ...values])];
          
          logger.debug('Converted standard filter from options to dedicated field', {
            optionName,
            standardField,
            values,
            existingCount: existing.length,
            newCount: result[standardField].length,
          });
        }
        // Don't add to remainingOptions - it's been moved to standard filter field
      } else {
        // Keep as option filter (variant option like Size, Color, etc.)
        remainingOptions[optionName] = values;
      }
    }
    
    // Update options - only keep non-standard filters
    result.options = Object.keys(remainingOptions).length > 0 ? remainingOptions : undefined;
  }

  // Apply option-level restrictions
  if (filterConfig.options) {
    const optionRestrictions: Record<string, string[]> = {};
    
    for (const option of filterConfig.options) {
      // Skip if option is not published
      if (option.status !== 'PUBLISHED') continue;

      // Get the actual option name (variantOptionKey or optionType)
      const optionSettings = option.optionSettings || {};
      const optionName = optionSettings.variantOptionKey || 
                         option.optionType?.trim() || 
                         option.handle;
      
      // Apply targetScope for this option
      if (option.targetScope === 'entitled' && option.allowedOptions?.length > 0) {
        // If this option has allowedOptions, restrict the input
        if (result.options && result.options[optionName]) {
          // Filter input options to only allowed ones
          result.options[optionName] = result.options[optionName].filter((val) =>
            option.allowedOptions!.includes(val)
          );
        } else {
          // Store allowed options for this filter option
          optionRestrictions[optionName] = option.allowedOptions;
        }
      }

      // Apply selectedValues if baseOptionType is used
      if (optionSettings.baseOptionType && optionSettings.selectedValues?.length > 0) {
        // This is a derived option - map to base option type
        const baseName = optionSettings.baseOptionType.trim();
        if (result.options && result.options[baseName]) {
          // Filter to only selected values
          result.options[baseName] = result.options[baseName].filter((val) =>
            optionSettings.selectedValues!.includes(val)
          );
        }
      }
    }

    // Apply option restrictions if any
    if (Object.keys(optionRestrictions).length > 0) {
      if (!result.options) {
        result.options = {};
      }
      // Merge restrictions (don't override existing filters, just restrict them)
      for (const [optionName, allowed] of Object.entries(optionRestrictions)) {
        if (result.options[optionName]) {
          result.options[optionName] = result.options[optionName].filter((val) => allowed.includes(val));
        }
      }
    }
  }

  return result;
}

/**
 * Generate a hash of filter configuration for cache invalidation
 * 
 * This hash changes when filter config changes, ensuring cache is invalidated.
 * The hash includes all fields that affect aggregation results:
 * - Filter ID, version, and timestamps
 * - Published options with their configuration
 * - Option-level settings that affect aggregations (allowedOptions, selectedValues, targetScope)
 * - Option status changes (published/draft)
 * 
 * @param filterConfig - The filter configuration to hash, or null if no filter
 * @returns A hash string representing the filter configuration state
 */
export function getFilterConfigHash(filterConfig: Filter | null): string {
  if (!filterConfig) {
    return NO_FILTER_CONFIG_HASH;
  }
  
  // Ensure we have a valid timestamp (fallback to current time if both are missing)
  const updatedAt = filterConfig.updatedAt || filterConfig.createdAt || new Date().toISOString();
  
  // Create a comprehensive hash based on filter config that affects aggregations
  // Include all fields that could change aggregation results
  const hashData = {
    id: filterConfig.id,
    version: filterConfig.version || 0,
    updatedAt,
    // Include filter-level settings that affect aggregations
    targetScope: filterConfig.targetScope,
    // Include all options with their full configuration that affects aggregations
    // Sort by handle for consistent hashing
    options: filterConfig.options
      ?.map(opt => {
        const optionSettings = opt.optionSettings || {};
        return {
          handle: opt.handle,
          optionType: opt.optionType,
          status: opt.status,
          variantOptionKey: optionSettings.variantOptionKey || undefined, // Keep original case
          targetScope: opt.targetScope,
          allowedOptions: opt.allowedOptions && opt.allowedOptions.length > 0 
            ? [...opt.allowedOptions].sort() 
            : undefined,
          selectedValues: optionSettings.selectedValues && optionSettings.selectedValues.length > 0
            ? [...optionSettings.selectedValues].sort()
            : undefined,
          baseOptionType: optionSettings.baseOptionType,
        };
      })
      .sort((a, b) => a.handle.localeCompare(b.handle)) || [],
  };
  
  const hashString = JSON.stringify(hashData);
  const hash = crypto.createHash('md5').update(hashString).digest('hex').substring(0, 12);
  
  logger.debug('Filter config hash generated', {
    filterId: filterConfig.id,
    hash,
    version: filterConfig.version,
    optionsCount: filterConfig.options?.length || 0,
    publishedOptionsCount: filterConfig.options?.filter(opt => opt.status === 'PUBLISHED').length || 0,
  });
  
  return hash;
}

/**
 * Format filter configuration for storefront response
 * Returns only the fields needed by the storefront script
 * Includes all settings and configuration required for rendering filters on storefront
 */
export function formatFilterConfigForStorefront(filterConfig: Filter | null): any {
  if (!filterConfig) {
    return null;
  }

  return {
    id: filterConfig.id,
    title: filterConfig.title,
    description: filterConfig.description,
    filterType: filterConfig.filterType,
    targetScope: filterConfig.targetScope,
    allowedCollections: filterConfig.allowedCollections || [],
    options: filterConfig.options
      ?.filter((opt) => opt.status === 'PUBLISHED') // Only include published options
      .map((opt) => {
        const optionSettings = opt.optionSettings || {};
        return {
          handle: opt.handle,
          position: opt.position,
          label: opt.label,
          optionType: opt.optionType,
          status: opt.status,
          displayType: opt.displayType || 'list',
          selectionType: opt.selectionType || 'multiple',
          targetScope: opt.targetScope || 'all',
          allowedOptions: opt.allowedOptions || [],
          
          // Display Options
          collapsed: opt.collapsed || false,
          searchable: opt.searchable || false,
          showTooltip: opt.showTooltip || false,
          tooltipContent: opt.tooltipContent || '',
          showCount: opt.showCount || false,
          showMenu: opt.showMenu || false,
          
          // Option Settings (nested per new schema)
          optionSettings: {
            // Value Selection & Filtering
            baseOptionType: optionSettings.baseOptionType,
            selectedValues: optionSettings.selectedValues || [],
            removeSuffix: optionSettings.removeSuffix || [],
            replaceText: optionSettings.replaceText || [],
            
            // Value Grouping & Normalization
            valueNormalization: optionSettings.valueNormalization,
            groupBySimilarValues: optionSettings.groupBySimilarValues || false,
            
            // Filtering & Prefixes
            removePrefix: optionSettings.removePrefix || [],
            filterByPrefix: optionSettings.filterByPrefix || [],
            
            // Sorting
            sortBy: optionSettings.sortBy || 'ascending',
            manualSortedValues: optionSettings.manualSortedValues || [],
            
            // Advanced
            groups: optionSettings.groups || [],
            menus: optionSettings.menus || [],
            textTransform: optionSettings.textTransform || 'none',
            paginationType: optionSettings.paginationType || 'scroll',
            
            // Performance Optimization: Include variant option key for frontend use
            variantOptionKey: optionSettings.variantOptionKey,
          },
        };
      })
      .sort((a, b) => a.position - b.position) || [], // Sort by position
    settings: {
      displayQuickView: filterConfig.settings?.displayQuickView,
      displayItemsCount: filterConfig.settings?.displayItemsCount,
      displayVariantInsteadOfProduct: filterConfig.settings?.displayVariantInsteadOfProduct,
      defaultView: filterConfig.settings?.defaultView,
      filterOrientation: filterConfig.settings?.filterOrientation,
      displayCollectionImage: filterConfig.settings?.displayCollectionImage,
      hideOutOfStockItems: filterConfig.settings?.hideOutOfStockItems,
      onLaptop: filterConfig.settings?.onLaptop,
      onTablet: filterConfig.settings?.onTablet,
      onMobile: filterConfig.settings?.onMobile,
      productDisplay: filterConfig.settings?.productDisplay || {},
      pagination: filterConfig.settings?.pagination || {},
      showFilterCount: filterConfig.settings?.showFilterCount,
      showActiveFilters: filterConfig.settings?.showActiveFilters,
      showResetButton: filterConfig.settings?.showResetButton,
      showClearAllButton: filterConfig.settings?.showClearAllButton,
    },
    deploymentChannel: filterConfig.deploymentChannel,
    status: filterConfig.status,
  };
}

