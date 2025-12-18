/**
 * Product Filter Configuration Helper
 * Gets active filter configuration for a shop and applies it to product search
 */

import { Filter } from '@shared/filters/types';
import { ProductFilterInput, ProductSearchInput } from './types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('products-filter-config-helper');
import crypto from 'crypto';
import { NO_FILTER_CONFIG_HASH } from '@core/cache/cache.key';

const STANDARD_FILTER_MAPPING: Record<string, keyof ProductFilterInput> = {
  vendor: 'vendors',
  vendors: 'vendors',
  producttype: 'productTypes',
  'product-type': 'productTypes',
  'product type': 'productTypes',
  product_types: 'productTypes',
  tags: 'tags',
  tag: 'tags',
  collection: 'collections',
  collections: 'collections',
  sku: 'skus',
  skus: 'skus',
};

function normalizeStandardKey(key: string): string {
  return (key || '').toLowerCase().trim().replace(/[\s_-]+/g, '');
}

function parseMinMaxRange(value: string): { min?: number; max?: number } | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Accept "min-max" (floats ok). Also tolerate "min-" or "-max".
  const idx = trimmed.indexOf('-');
  if (idx === -1) return null;

  const left = trimmed.slice(0, idx).trim();
  const right = trimmed.slice(idx + 1).trim();

  const min = left ? parseFloat(left) : undefined;
  const max = right ? parseFloat(right) : undefined;

  const out: { min?: number; max?: number } = {};
  if (min !== undefined && !isNaN(min) && min >= 0) out.min = min;
  if (max !== undefined && !isNaN(max) && max >= 0) out.max = max;

  if (out.min === undefined && out.max === undefined) return null;
  if (out.min !== undefined && out.max !== undefined && !(out.max > out.min)) return null;

  return out;
}

const normalizeStatus = (status?: string | null) => (status || '').toUpperCase();
const normalizeChannel = (channel?: string | null) => (channel || '').toLowerCase();
const normalizeString = (value?: string | null) => (value || '').toLowerCase();
const isPublishedStatus = (status?: string | null) => normalizeStatus(status) === 'PUBLISHED';
const isSupportedDeployment = (channel?: string | null) => {
  const normalizedChannel = normalizeChannel(channel);
  return normalizedChannel === 'app' || normalizedChannel === 'theme';
};

/**
 * Derive variantOptionKey at runtime from filter config option
 * This ensures perfect matching with ES storage where optionPairs are stored as "OptionName::Value"
 * 
 * Logic:
 * 1. If variantOptionKey is explicitly set, use it (exact match with ES)
 * 2. If baseOptionType === "OPTION" (variant option), use optionType (matches ES storage)
 * 3. For standard filters, variantOptionKey is not applicable
 * 
 * @param option - Filter config option
 * @returns The variantOptionKey to use for ES queries and matching
 */
function deriveVariantOptionKey(option: Filter['options'][number]): string | null {
  const optionSettings = option.optionSettings || {};
  
  // Priority 1: If variantOptionKey is explicitly set, use it (exact match with ES)
  if (optionSettings.variantOptionKey) {
    return optionSettings.variantOptionKey.trim();
  }
  
  // Priority 2: If baseOptionType === "OPTION", use optionType (matches ES storage)
  // ES stores optionPairs as "OptionName::Value" where OptionName is from product data
  // For variant options, optionType is the exact name that matches ES storage
  const baseOptionType = optionSettings.baseOptionType?.trim().toUpperCase();
  if (baseOptionType === 'OPTION') {
    const optionType = option.optionType?.trim();
    if (optionType) {
      return optionType; // This matches ES storage exactly
    }
  }
  
  // For standard filters (VENDOR, PRODUCT_TYPE, etc.), variantOptionKey is not applicable
  return null;
}

/**
 * Get active filter configuration for a shop
 * Implements priority system:
 * 1. Custom published filter (filterType: "custom")
 * 2. Default published filter (filterType: "default")
 * 3. Any published filter
 * 4. If collection is in query params, prioritize filters where collection ID is in allowedCollections
 * 
 * @param filtersRepository - The filters repository
 * @param shop - Shop domain
 * @param collectionId - Optional collection ID from query params for priority matching
 * @returns The selected filter configuration or null
 */
export interface FilterConfigRepository {
  listFilters(shop: string, cpid?: string): Promise<{ filters: Filter[] }>;
}

export async function getActiveFilterConfig(
  filtersRepository: FilterConfigRepository,
  shop: string,
  collectionId?: string,
  cpid?: string
): Promise<Filter | null> {
  try {
    // Pass cpid to listFilters for cache key generation
    // If cpid changes and there are multiple filters, cache will be invalidated
    const { filters } = await filtersRepository.listFilters(shop, cpid);
    
    // Filter to only published filters with supported deployment channels
    const publishedFilters = (filters || []).filter(
      (f) => isPublishedStatus(f.status) && isSupportedDeployment(f.deploymentChannel)
    );

    if (publishedFilters.length === 0) {
      logger.log('No published filter configuration found', { shop });
      return null;
    }

    // Priority 1: If collection ID is provided, find filters where collection is in allowedCollections
    if (collectionId) {
      const collectionSpecificFilters = publishedFilters.filter((f) => {
        const isEntitled = normalizeString(f.targetScope) === 'entitled';
        if (isEntitled && f.allowedCollections?.length > 0) {
          return f.allowedCollections.some((c) => c.id === collectionId);
        }
        return false;
      });

      if (collectionSpecificFilters.length > 0) {
        // Among collection-specific filters, prioritize by filterType
        const customFilter = collectionSpecificFilters.find((f) => normalizeString(f.filterType) === 'custom');
        if (customFilter) {
          logger.log('Collection-specific custom filter found', {
            shop,
            collectionId,
            filterId: customFilter.id,
            title: customFilter.title,
          });
          return customFilter;
        }

        const defaultFilter = collectionSpecificFilters.find((f) => normalizeString(f.filterType) === 'default');
        if (defaultFilter) {
          logger.log('Collection-specific default filter found', {
            shop,
            collectionId,
            filterId: defaultFilter.id,
            title: defaultFilter.title,
          });
          return defaultFilter;
        }

        // Return first collection-specific filter
        logger.log('Collection-specific filter found', {
          shop,
          collectionId,
          filterId: collectionSpecificFilters[0].id,
          title: collectionSpecificFilters[0].title,
        });
        return collectionSpecificFilters[0];
      }
    }

    // Priority 2: Custom published filter
    const customFilter = publishedFilters.find((f) => normalizeString(f.filterType) === 'custom');
    if (customFilter) {
      logger.log('Custom published filter found', {
        shop,
        filterId: customFilter.id,
        title: customFilter.title,
        optionsCount: customFilter.options?.length || 0,
      });
      return customFilter;
    }

    // Priority 3: Default published filter
    const defaultFilter = publishedFilters.find((f) => normalizeString(f.filterType) === 'default');
    if (defaultFilter) {
      logger.log('Default published filter found', {
        shop,
        filterId: defaultFilter.id,
        title: defaultFilter.title,
        optionsCount: defaultFilter.options?.length || 0,
      });
      return defaultFilter;
    }

    // Priority 4: Any published filter (fallback)
    const anyFilter = publishedFilters[0];
    logger.log('Using first available published filter', {
      shop,
      filterId: anyFilter.id,
      title: anyFilter.title,
      filterType: anyFilter.filterType,
      optionsCount: anyFilter.options?.length || 0,
    });
    return anyFilter;
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
 * @param key - The query parameter key to check (can be handle, optionType, or variantOptionKey)
 * @returns True if the key matches any option's handle, optionType, or variantOptionKey
 */
export function isOptionKey(filterConfig: Filter | null, key: string): boolean {
  if (!filterConfig || !filterConfig.options || !key) {
    return false;
  }

  const lowerKey = key.toLowerCase();
  
  // Check if key matches any published option's handle, optionType, or variantOptionKey
  return filterConfig.options.some(
    (opt) => {
      if (!isPublishedStatus(opt.status)) return false;
      
      // Check handle (exact match, case-sensitive)
      if (opt.handle === key) return true;
      
      // Check optionType (case-insensitive)
      if (opt.optionType?.toLowerCase() === lowerKey) return true;
      
      // Check derived variantOptionKey (case-insensitive) - ensures perfect ES matching
      const derivedVariantOptionKey = deriveVariantOptionKey(opt);
      if (derivedVariantOptionKey?.toLowerCase() === lowerKey) return true;
      
      // Also check explicit variantOptionKey for backward compatibility
      const optionSettings = opt.optionSettings || {};
      if (optionSettings.variantOptionKey?.toLowerCase() === lowerKey) return true;
      
      return false;
    }
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

  const lowerKey = optionKey.toLowerCase();
  
  // Find option by handle (exact match, case-sensitive), optionType, or variantOptionKey (both case-insensitive)
  const option = filterConfig.options.find(
    (opt) => {
      if (!isPublishedStatus(opt.status)) return false;
      
      // Check handle (exact match, case-sensitive - handles are unique identifiers)
      if (opt.handle === optionKey) return true;
      
      // Check optionType (case-insensitive)
      if (opt.optionType?.toLowerCase() === lowerKey) return true;
      
      // Check derived variantOptionKey (case-insensitive) - ensures perfect ES matching
      const derivedVariantOptionKey = deriveVariantOptionKey(opt);
      if (derivedVariantOptionKey?.toLowerCase() === lowerKey) return true;
      
      // Also check explicit variantOptionKey for backward compatibility
      const optionSettings = opt.optionSettings || {};
      if (optionSettings.variantOptionKey?.toLowerCase() === lowerKey) return true;
      
      return false;
    }
  );

  if (option) {
    // Derive variantOptionKey at runtime to ensure perfect ES matching
    const derivedVariantOptionKey = deriveVariantOptionKey(option);
    
    // Use derived variantOptionKey if available, otherwise fall back to optionType
    // This ensures we use the exact name that matches ES storage
    const baseName = derivedVariantOptionKey || 
                     option.optionType?.trim() || 
                     optionKey;
    return baseName;
  }

  // If not found, return original key (might be a direct option name)
  return optionKey;
}

/**
 * Map option names back to handles using filter configuration
 * This is used to check keep (which use handles) against option names (from mapped filters)
 * 
 * @param filterConfig - The filter configuration containing option mappings
 * @param optionName - The option name (e.g., "Size", "Color")
 * @returns The handle for this option, or null if not found
 */
export function mapOptionNameToHandle(filterConfig: Filter | null, optionName: string): string | null {
  if (!filterConfig || !filterConfig.options || !optionName) {
    return null;
  }

  const lowerName = optionName.toLowerCase();
  
  // Find option by optionType (case-insensitive)
  const option = filterConfig.options.find(
    (opt) => {
      if (!isPublishedStatus(opt.status)) return false;
      
      // Check optionType (case-insensitive)
      if (opt.optionType?.toLowerCase() === lowerName) return true;
      
      // Also check derived variantOptionKey for matching
      const derivedVariantOptionKey = deriveVariantOptionKey(opt);
      if (derivedVariantOptionKey?.toLowerCase() === lowerName) return true;
      
      return false;
    }
  );

  if (option && option.handle) {
    return option.handle;
  }

  return null;
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

  // Default to preserving option aggregations unless explicitly disabled
  // Apply targetScope restrictions
  if (filterConfig.targetScope === 'entitled' && filterConfig.allowedCollections?.length > 0) {
    // If filter is scoped to specific collections, ensure we're filtering by those collections
    const allowedCollectionIds = filterConfig.allowedCollections.map((c) => c.id);
    
    if (currentCollection) {
      // If a specific collection is requested, check if it's allowed
      if (!allowedCollectionIds.includes(currentCollection)) {
        // Collection not allowed, return empty result by filtering to non-existent collection
        if (result.cpid) {
          result.collections = [result.cpid];
        }
        else {
          result.collections = ['__none__'];
        }
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
  // Query parameters may use handles/IDs (e.g., "pr_a3k9x", "ti7u71") instead of option names (e.g., "Size")
  // Also filter out any keys that don't match actual options in the filter config
  // IMPORTANT: Track handles by base field to apply correct AND/OR logic:
  // - Same handle with multiple values = OR (merge into array)
  // Initialize __handleMapping to ensure it always exists (prevents undefined errors)
  if (!(result as any).__handleMapping) {
    (result as any).__handleMapping = {
      handleToBaseField: {},
      baseFieldToHandles: {},
      handleToValues: {},
      standardFieldToHandles: {},
    };
  }

  // - Different handles mapping to same base field = AND (keep separate)
  if (result.options) {
    const mappedOptions: Record<string, string[]> = {};
    // Track which handles map to which base fields for AND logic
    const handleToBaseField: Record<string, string> = {};
    const baseFieldToHandles: Record<string, string[]> = {};
    // Track which values came from which handle (for contextual aggregations)
    const handleToValues: Record<string, string[]> = {};
    
    for (const [queryKey, values] of Object.entries(result.options)) {
      // Check if this key (handle or option name) matches an actual option in the filter config
      const matchesFilterConfig = isOptionKey(filterConfig, queryKey);
      
      if (matchesFilterConfig) {
        // Key matches filter config - map handle/ID to actual option name
        const optionName = mapOptionKeyToName(filterConfig, queryKey);
        
        // Find the base field this option maps to
        let baseField: string | null = null;
        if (filterConfig.options) {
          const option = filterConfig.options.find(opt => {
            if (!isPublishedStatus(opt.status)) return false;
            const derivedVariantOptionKey = deriveVariantOptionKey(opt);
            const mappedName = derivedVariantOptionKey || opt.optionType?.trim() || opt.handle;
            return mappedName === optionName || opt.handle === queryKey;
          });
          
          if (option?.optionSettings?.baseOptionType) {
            baseField = option.optionSettings.baseOptionType.trim().toUpperCase();
          }
        }
        
        logger.debug('Mapping option key to name', {
          queryKey,
          optionName,
          values,
          baseField,
          matchesFilterConfig,
        });
        
        if (optionName && optionName !== queryKey) {
          // This was a handle that got mapped to an option name
          // Track handle-to-baseField mapping
          if (baseField) {
            handleToBaseField[queryKey] = baseField;
            if (!baseFieldToHandles[baseField]) {
              baseFieldToHandles[baseField] = [];
            }
            if (!baseFieldToHandles[baseField].includes(queryKey)) {
              baseFieldToHandles[baseField].push(queryKey);
            }
          }
          
          // Track which values came from this handle (for contextual aggregations)
          handleToValues[queryKey] = values;
          
          // For same handle: merge values (OR logic)
          // For different handles mapping to same base field: keep separate (AND logic will be applied in repository)
          if (mappedOptions[optionName]) {
            // Check if this is the same handle or different handle mapping to same option name
            // If same handle, merge (OR). If different handle, we need to track separately.
            // For now, we'll merge but mark that AND logic is needed if multiple handles map to same base field
            mappedOptions[optionName] = [...new Set([...mappedOptions[optionName], ...values])];
          } else {
            mappedOptions[optionName] = values;
          }
        } else if (optionName === queryKey) {
          // This is already an option name (not a handle) - use it directly
          mappedOptions[optionName] = values;
        }
      } else {
        logger.debug('Skipping option key - not in filter config', {
          queryKey,
          values,
        });
      }
      // Strict enforcement: If option doesn't match filter config, skip it
      // This ensures only configured options can be used for filtering
    }
    
    // Store handle mapping info for repository to use AND logic and contextual aggregations
    // We'll use a special structure: add metadata to track which handles contributed to which fields
    // Merge with existing __handleMapping if it exists (from earlier initialization)
    const existingMapping = (result as any).__handleMapping || {};
    (result as any).__handleMapping = {
      ...existingMapping,
      handleToBaseField: { ...existingMapping.handleToBaseField, ...handleToBaseField },
      baseFieldToHandles: { ...existingMapping.baseFieldToHandles, ...baseFieldToHandles },
      handleToValues: { ...existingMapping.handleToValues, ...handleToValues },
      // Preserve standardFieldToHandles if it exists
      standardFieldToHandles: existingMapping.standardFieldToHandles || {},
    };
    
    result.options = mappedOptions;
  }

  // Convert standard filter types from options to their proper fields
  // This handles cases where filter config defines vendor/productType/etc as options
  // Standard filters should query their dedicated ES fields (vendor.keyword, productType.keyword, etc.)
  // instead of being treated as variant options (optionPairs.keyword)
  if (result.options) {
    const remainingOptions: Record<string, string[]> = {};
    
    for (const [optionName, values] of Object.entries(result.options)) {
      if (!values || values.length === 0) continue;
      
      const normalizedName = normalizeStandardKey(optionName);

      // Special-case: handle-driven price range filters (e.g. pr_xxx=10-100)
      // These come through as option filters (handles) but should be applied via dedicated numeric fields.
      if (normalizedName === 'price' || normalizedName === 'pricerange') {
        const first = typeof values[0] === 'string' ? values[0] : '';
        const parsed = parseMinMaxRange(first);
        if (parsed) {
          if (parsed.min !== undefined) (result as any).priceMin = parsed.min;
          if (parsed.max !== undefined) (result as any).priceMax = parsed.max;
          logger.debug('Converted price range option to priceMin/priceMax', {
            optionName,
            value: first,
            priceMin: (result as any).priceMin,
            priceMax: (result as any).priceMax,
          });
        }
        // Don't keep as optionPairs filter
        continue;
      }

      const standardField = STANDARD_FILTER_MAPPING[normalizedName as keyof typeof STANDARD_FILTER_MAPPING];
      
      if (standardField) {
        // Move to standard filter field
        if (standardField === 'vendors' || standardField === 'productTypes' || 
            standardField === 'tags' || standardField === 'collections' ||
            standardField === 'skus') {
          // For collections, preserve cpid if it exists (cpid takes precedence)
          if (standardField === 'collections' && result.cpid) {
            // cpid already set collections - don't overwrite it
            // Extract collection ID from cpid to verify it matches
            const cpidCollectionId = result.cpid.startsWith('gid://') 
              ? result.cpid.split('/').pop() || result.cpid
              : result.cpid;
            
            logger.debug('Skipping collection option conversion - cpid takes precedence', {
              optionName,
              cpid: result.cpid,
              cpidCollectionId,
              optionValues: values,
              existingCollections: result.collections,
            });
            // Still remove from options since it's a standard filter
          } else {
            // Track which handles contributed to this standard field
            const handleMapping = (result as any).__handleMapping || {};
            const handleToBaseField = handleMapping.handleToBaseField || {};
            
            // Find which handles map to this option name and base field
            const contributingHandles: string[] = [];
            if (filterConfig.options) {
              for (const option of filterConfig.options) {
                if (!isPublishedStatus(option.status)) continue;
                const derivedVariantOptionKey = deriveVariantOptionKey(option);
                const mappedName = derivedVariantOptionKey || option.optionType?.trim() || option.handle;
                if (mappedName === optionName) {
                  const baseField = option.optionSettings?.baseOptionType?.trim().toUpperCase();
                  // Check if this handle's base field matches the standard field
                  const standardFieldUpper = standardField.toUpperCase();
                  if (baseField === 'TAGS' && standardField === 'tags') {
                    contributingHandles.push(option.handle);
                  } else if (baseField === 'VENDOR' && standardField === 'vendors') {
                    contributingHandles.push(option.handle);
                  } else if (baseField === 'PRODUCT_TYPE' && standardField === 'productTypes') {
                    contributingHandles.push(option.handle);
                  } else if (baseField === 'COLLECTION' && standardField === 'collections') {
                    contributingHandles.push(option.handle);
                  } else if (baseField === 'SKUS' && standardField === 'skus') {
                    contributingHandles.push(option.handle);
                  }
                }
              }
            }
            
            // Track handles for AND logic
            if (contributingHandles.length > 0) {
              if (!handleMapping.standardFieldToHandles) {
                handleMapping.standardFieldToHandles = {};
              }
              const baseFieldKey = standardField === 'tags' ? 'TAGS' :
                                  standardField === 'vendors' ? 'VENDOR' :
                                  standardField === 'productTypes' ? 'PRODUCT_TYPE' :
                                  standardField === 'collections' ? 'COLLECTION' :
                                  standardField === 'skus' ? 'SKUS' : null;
              if (baseFieldKey) {
                if (!handleMapping.standardFieldToHandles[baseFieldKey]) {
                  handleMapping.standardFieldToHandles[baseFieldKey] = [];
                }
                // Add handles that aren't already tracked
                for (const handle of contributingHandles) {
                  if (!handleMapping.standardFieldToHandles[baseFieldKey].includes(handle)) {
                    handleMapping.standardFieldToHandles[baseFieldKey].push(handle);
                  }
                }
                // Merge back into result, preserving existing properties
                const existingMapping = (result as any).__handleMapping || {};
                (result as any).__handleMapping = {
                  ...existingMapping,
                  ...handleMapping,
                  // Preserve nested objects
                  handleToBaseField: { ...existingMapping.handleToBaseField, ...handleMapping.handleToBaseField },
                  baseFieldToHandles: { ...existingMapping.baseFieldToHandles, ...handleMapping.baseFieldToHandles },
                  handleToValues: { ...existingMapping.handleToValues, ...handleMapping.handleToValues },
                  standardFieldToHandles: { ...existingMapping.standardFieldToHandles, ...handleMapping.standardFieldToHandles },
                };
              }
            }
            
            const existing = result[standardField] || [];
            result[standardField] = [...new Set([...existing, ...values])];
            
            logger.debug('Converted standard filter from options to dedicated field', {
              optionName,
              standardField,
              values,
              contributingHandles,
              existingCount: existing.length,
              newCount: result[standardField].length,
            });
          }
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
      if (!isPublishedStatus(option.status)) continue;

      // Get the actual option name using derived variantOptionKey for perfect ES matching
      const derivedVariantOptionKey = deriveVariantOptionKey(option);
      const optionName = derivedVariantOptionKey || 
                         option.optionType?.trim() || 
                         option.handle;
      
      // Get optionSettings for processing (keep it available throughout the function)
      const optionSettings = option.optionSettings || {};
      
      // Apply targetScope for this option
      if (option.allowedOptions?.length > 0) {
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

  // Keep keep as handles (don't map to option names)
  // This allows keep to work with handles like "pr_a3k9x", "sd5d3s" etc.
  // Standard filters (vendors, productTypes, tags, collections) are still mapped for consistency
  if (result.keep && result.keep.length > 0) {
    const mappedKeep = new Set<string>();
    for (const rawKey of result.keep) {
      const key = rawKey?.trim();
      if (!key) continue;

      const lowerKey = key.toLowerCase();
      if (lowerKey === '__all__') {
        mappedKeep.add('__all__');
        break;
      }

      // Map standard filter names (vendors, productTypes, etc.) for consistency
      const standardField = STANDARD_FILTER_MAPPING[lowerKey];
      if (standardField) {
        mappedKeep.add(standardField.toLowerCase());
        continue;
      }

      // For option filters, keep the handle as-is (don't map to option name)
      // This allows keep to work with handles like "pr_a3k9x", "sd5d3s"
      // Just validate that it's a valid option handle
      if (isOptionKey(filterConfig, key)) {
        mappedKeep.add(key.toLowerCase());
      }
    }

    result.keep = Array.from(mappedKeep);
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
 * - Option-level settings that affect aggregations (allowedOptions)
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
          variantOptionKey: optionSettings.variantOptionKey || undefined,
          allowedOptions: opt.allowedOptions && opt.allowedOptions.length > 0 
            ? [...opt.allowedOptions].sort() 
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
    publishedOptionsCount: filterConfig.options?.filter(opt => isPublishedStatus(opt.status)).length || 0,
  });
  
  return hash;
}

/**
 * Format filter configuration for storefront response
 * Returns only the fields needed by the storefront script
 * Includes all settings and configuration required for rendering filters on storefront
 * Matches the format from default_filter_format.json
 */
export function formatFilterConfigForStorefront(filterConfig: Filter | null): any {
  if (!filterConfig) {
    return null;
  }

  // Helper to clean optionSettings - includes all fields that exist (matches default_filter_format.json)
  // Only excludes undefined/null/empty arrays to minimize payload while maintaining format compatibility
  function cleanOptionSettings(optionSettings: any): any {
    if (!optionSettings) return {};
    
    const cleaned: any = {};
    
    // Always include baseOptionType if it exists (required field)
    if (optionSettings.baseOptionType) {
      cleaned.baseOptionType = optionSettings.baseOptionType;
    }
    
    if (Array.isArray(optionSettings.removeSuffix) && optionSettings.removeSuffix.length > 0) {
      cleaned.removeSuffix = optionSettings.removeSuffix;
    }
    
    if (Array.isArray(optionSettings.replaceText) && optionSettings.replaceText.length > 0) {
      cleaned.replaceText = optionSettings.replaceText;
    }
    
    if (Array.isArray(optionSettings.removePrefix) && optionSettings.removePrefix.length > 0) {
      cleaned.removePrefix = optionSettings.removePrefix;
    }
    
    if (Array.isArray(optionSettings.filterByPrefix) && optionSettings.filterByPrefix.length > 0) {
      cleaned.filterByPrefix = optionSettings.filterByPrefix;
    }
    
    if (Array.isArray(optionSettings.manualSortedValues) && optionSettings.manualSortedValues.length > 0) {
      cleaned.manualSortedValues = optionSettings.manualSortedValues;
    }
    
    if (Array.isArray(optionSettings.groups) && optionSettings.groups.length > 0) {
      cleaned.groups = optionSettings.groups;
    }
    
    if (Array.isArray(optionSettings.menus) && optionSettings.menus.length > 0) {
      cleaned.menus = optionSettings.menus;
    }
    
    // Include boolean only if true (false is the default, so exclude to minimize payload)
    if (optionSettings.groupBySimilarValues === true) {
      cleaned.groupBySimilarValues = true;
    }
    
    // Include string enums if they exist (include even if default to match format, but we'll minimize)
    // For sortBy, textTransform, paginationType: include if they exist and are not default values
    // This matches the format file where defaults are shown but we minimize payload
    if (optionSettings.sortBy) {
      cleaned.sortBy = optionSettings.sortBy;
    }
    
    if (optionSettings.textTransform) {
      cleaned.textTransform = optionSettings.textTransform;
    }
    
    if (optionSettings.paginationType) {
      cleaned.paginationType = optionSettings.paginationType;
    }
    
    // Include variantOptionKey if it exists (for variant options)
    if (optionSettings.variantOptionKey) {
      cleaned.variantOptionKey = optionSettings.variantOptionKey;
    }
    
    // Include valueNormalization if it exists and has values
    if (optionSettings.valueNormalization && typeof optionSettings.valueNormalization === 'object') {
      const normKeys = Object.keys(optionSettings.valueNormalization);
      if (normKeys.length > 0) {
        cleaned.valueNormalization = optionSettings.valueNormalization;
      }
    }
    
    return cleaned;
  }

  // Helper to clean settings object
  function cleanSettings(settings: any): any {
    if (!settings) return {};
    
    const cleaned: any = {};
    
    // Include all settings fields (they may be used by storefront)
    if (settings.displayQuickView !== undefined) cleaned.displayQuickView = settings.displayQuickView;
    if (settings.displayItemsCount !== undefined) cleaned.displayItemsCount = settings.displayItemsCount;
    if (settings.displayVariantInsteadOfProduct !== undefined) cleaned.displayVariantInsteadOfProduct = settings.displayVariantInsteadOfProduct;
    if (settings.defaultView) cleaned.defaultView = settings.defaultView;
    if (settings.filterOrientation) cleaned.filterOrientation = settings.filterOrientation;
    if (settings.displayCollectionImage !== undefined) cleaned.displayCollectionImage = settings.displayCollectionImage;
    if (settings.hideOutOfStockItems !== undefined) cleaned.hideOutOfStockItems = settings.hideOutOfStockItems;
    if (settings.onLaptop) cleaned.onLaptop = settings.onLaptop;
    if (settings.onTablet) cleaned.onTablet = settings.onTablet;
    if (settings.onMobile) cleaned.onMobile = settings.onMobile;
    
    // Clean productDisplay
    if (settings.productDisplay) {
      const productDisplay: any = {};
      if (settings.productDisplay.gridColumns !== undefined) productDisplay.gridColumns = settings.productDisplay.gridColumns;
      if (settings.productDisplay.showProductCount !== undefined) productDisplay.showProductCount = settings.productDisplay.showProductCount;
      if (settings.productDisplay.showSortOptions !== undefined) productDisplay.showSortOptions = settings.productDisplay.showSortOptions;
      if (settings.productDisplay.defaultSort) productDisplay.defaultSort = settings.productDisplay.defaultSort;
      if (Object.keys(productDisplay).length > 0) cleaned.productDisplay = productDisplay;
    }
    
    // Clean pagination
    if (settings.pagination) {
      const pagination: any = {};
      if (settings.pagination.type) pagination.type = settings.pagination.type;
      if (settings.pagination.itemsPerPage !== undefined) pagination.itemsPerPage = settings.pagination.itemsPerPage;
      if (settings.pagination.showPageInfo !== undefined) pagination.showPageInfo = settings.pagination.showPageInfo;
      if (settings.pagination.pageInfoFormat) pagination.pageInfoFormat = settings.pagination.pageInfoFormat;
      if (Object.keys(pagination).length > 0) cleaned.pagination = pagination;
    }
    
    if (settings.showFilterCount !== undefined) cleaned.showFilterCount = settings.showFilterCount;
    if (settings.showActiveFilters !== undefined) cleaned.showActiveFilters = settings.showActiveFilters;
    if (settings.showResetButton !== undefined) cleaned.showResetButton = settings.showResetButton;
    if (settings.showClearAllButton !== undefined) cleaned.showClearAllButton = settings.showClearAllButton;
    
    return cleaned;
  }

  return {
    id: filterConfig.id,
    shop: filterConfig.shop,
    title: filterConfig.title,
    description: filterConfig.description || undefined,
    filterType: filterConfig.filterType,
    targetScope: filterConfig.targetScope,
    allowedCollections: filterConfig.allowedCollections || [],
    options: filterConfig.options
      ?.filter((opt) => isPublishedStatus(opt.status)) // Only include published options
      .map((opt) => {
        const optionSettings = opt.optionSettings || {};
        const cleanedSettings = cleanOptionSettings(optionSettings);
        
        const option: any = {
          handle: opt.handle,
          position: opt.position,
          label: opt.label,
          optionType: opt.optionType,
          displayType: opt.displayType,
          selectionType: opt.selectionType,
          allowedOptions: opt.allowedOptions || [],
          collapsed: opt.collapsed || false,
          searchable: opt.searchable || false,
          showTooltip: opt.showTooltip || false,
          tooltipContent: opt.tooltipContent || '',
          showCount: opt.showCount !== undefined ? opt.showCount : true,
          showMenu: opt.showMenu || false,
          status: opt.status,
        };
        
        // Include optionSettings only if it has values
        if (Object.keys(cleanedSettings).length > 0) {
          option.optionSettings = cleanedSettings;
        }
        
        return option;
      })
      .sort((a, b) => (a.position || 0) - (b.position || 0)) || [], // Sort by position
    status: filterConfig.status,
    deploymentChannel: filterConfig.deploymentChannel,
    // Remove settings from response to reduce payload size
    // Settings are not needed by storefront for rendering filters
    tags: filterConfig.tags && filterConfig.tags.length > 0 ? filterConfig.tags : [],
    createdAt: filterConfig.createdAt,
    updatedAt: filterConfig.updatedAt || null,
    version: filterConfig.version || 0,
  };
}

