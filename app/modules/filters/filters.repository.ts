/**
 * Filters Repository
 * Handles Elasticsearch operations for filter configurations
 * Uses camelCase for all database field names (following coding standards)
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import { Filter, CreateFilterInput, UpdateFilterInput } from '@shared/filters/types';
import { getCacheService } from '@core/cache';
import { FILTERS_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('filters-repository');

export class FiltersRepository {
  constructor(private esClient: Client) {}

  /**
   * Normalize filter data from Elasticsearch
   * Converts snake_case (legacy) to camelCase if needed
   * Supports both formats for backward compatibility
   * Always normalizes to ensure consistent camelCase output
   */
  private normalizeFilter(data: any): Filter {
    // Always normalize, checking both camelCase and snake_case formats
    // Use nullish coalescing to handle null values properly
    return {
      id: data.id,
      shop: data.shop,
      title: data.title,
      description: data.description ?? undefined,
      filterType: data.filterType ?? data.filter_type ?? data.type ?? 'custom',
      targetScope: data.targetScope ?? data.target_scope ?? data.target_selection ?? 'all',
      allowedCollections: data.allowedCollections ?? data.allowed_collections ?? data.entitled_collections ?? [],
      options: (data.options ?? []).map((opt: any) => {
        // Extract optionSettings if present (new schema) or build from legacy fields
        const optionSettings = opt.optionSettings || {};
        
        return {
          handle: opt.handle,
          position: opt.position,
          label: opt.label,
          optionType: opt.optionType ?? opt.option_type ?? opt.type ?? '',
          displayType: opt.displayType ?? opt.display_type ?? 'LIST',
          selectionType: opt.selectionType ?? opt.selection_type ?? 'MULTIPLE',
          allowedOptions: opt.allowedOptions ?? opt.allowed_options ?? opt.entitled_options ?? [],
          
          // Display Options (top-level)
          collapsed: opt.collapsed ?? false,
          searchable: opt.searchable ?? false,
          showTooltip: opt.showTooltip ?? false,
          tooltipContent: opt.tooltipContent ?? opt.tooltip_content ?? '',
          showCount: opt.showCount ?? false,
          showMenu: opt.showMenu ?? opt.show_menu ?? false,
          status: opt.status ?? 'PUBLISHED',
          
          // Option Settings (nested object per new schema)
          optionSettings: {
            // Value Selection & Filtering (from optionSettings or legacy top-level)
            baseOptionType: optionSettings.baseOptionType ?? opt.baseOptionType,
            removeSuffix: optionSettings.removeSuffix ?? opt.removeSuffix ?? [],
            replaceText: optionSettings.replaceText ?? opt.replaceText ?? [],
            
            // Value Grouping & Normalization
            valueNormalization: optionSettings.valueNormalization ?? opt.valueNormalization,
            groupBySimilarValues: optionSettings.groupBySimilarValues ?? opt.groupBySimilarValues ?? opt.group_by_similar_values ?? false,
            
            // Filtering & Prefixes
            removePrefix: optionSettings.removePrefix ?? opt.removePrefix ?? opt.remove_prefix ?? [],
            filterByPrefix: optionSettings.filterByPrefix ?? opt.filterByPrefix ?? opt.filter_by_prefix ?? [],
            
            // Sorting
            sortBy: optionSettings.sortBy ?? opt.sortBy ?? opt.sort_by ?? 'ASCENDING',
            manualSortedValues: optionSettings.manualSortedValues ?? opt.manualSortedValues ?? opt.manual_sorted_values ?? [],
            
            // Advanced
            groups: optionSettings.groups ?? opt.groups ?? [],
            menus: optionSettings.menus ?? opt.menus ?? [],
            textTransform: optionSettings.textTransform ?? opt.textTransform ?? opt.text_transform ?? 'NONE',
            paginationType: optionSettings.paginationType ?? opt.paginationType ?? opt.pagination_type ?? 'SCROLL',
            
            // Performance Optimization: Pre-computed variant option keys
            variantOptionKey: optionSettings.variantOptionKey ?? opt.variantOptionKey ?? opt.variant_option_key,
          },
        };
      }),
      status: data.status ?? 'PUBLISHED',
      deploymentChannel: data.deploymentChannel ?? data.deployment_channel ?? data.channel ?? 'APP',
      settings: data.settings ? {
        // Legacy fields
        displayQuickView: data.settings.displayQuickView ?? data.settings.display_quick_view ?? undefined,
        displayItemsCount: data.settings.displayItemsCount ?? data.settings.display_items_count ?? undefined,
        displayVariantInsteadOfProduct: data.settings.displayVariantInsteadOfProduct ?? data.settings.display_variant_instead_of_product ?? undefined,
        defaultView: data.settings.defaultView ?? data.settings.default_view ?? undefined,
        filterOrientation: data.settings.filterOrientation ?? data.settings.filter_orientation ?? undefined,
        displayCollectionImage: data.settings.displayCollectionImage ?? data.settings.display_collection_image ?? undefined,
        hideOutOfStockItems: data.settings.hideOutOfStockItems ?? data.settings.hide_out_of_stock_items ?? undefined,
        onLaptop: data.settings.onLaptop ?? data.settings.on_laptop ?? undefined,
        onTablet: data.settings.onTablet ?? data.settings.on_tablet ?? undefined,
        onMobile: data.settings.onMobile ?? data.settings.on_mobile ?? undefined,
        
        // New nested structure
        productDisplay: data.settings.productDisplay,
        pagination: data.settings.pagination,
        showFilterCount: data.settings.showFilterCount,
        showActiveFilters: data.settings.showActiveFilters,
        showResetButton: data.settings.showResetButton,
        showClearAllButton: data.settings.showClearAllButton,
      } : undefined,
      tags: data.tags ?? [],
      isActive: data.isActive ?? data.is_active ?? true,
      version: data.version ?? data.__v ?? 0,
      updatedAt: data.updatedAt ?? data.updated_at ?? null,
      createdAt: data.createdAt ?? data.created_at ?? new Date().toISOString(),
    };
  }

  /**
   * Get filter by ID for a specific shop
   * Uses shop field to filter in single index for all shops
   * Verifies that the filter belongs to the specified shop
   * Uses must with term queries for exact matching
   */
  async getFilter(shop: string, id: string): Promise<Filter | null> {
    try {
      const index = FILTERS_INDEX_NAME;
      
      // Use must with term queries for exact shop and id matching
      // Try both shop.keyword (if keyword subfield exists) and shop (direct keyword field)
      // This ensures exact matching regardless of field mapping
      const response = await this.esClient.search({
        index,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { 'shop.keyword': shop } },  // Try keyword subfield first
                    { term: { shop: shop } }  // Fallback to direct keyword field
                  ],
                  minimum_should_match: 1
                }
              },
              {
                bool: {
                  should: [
                    { term: { 'id.keyword': id } },  // Try keyword subfield first
                    { term: { id: id } }  // Fallback to direct keyword field
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        },
        size: 1,
      });

      if (response.hits.hits.length > 0 && response.hits.hits[0]._source) {
        const source = response.hits.hits[0]._source as any;
        const normalized = this.normalizeFilter(source);
        return normalized;
      }

      return null;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      logger.error('Error getting filter', { shop, id, error: error?.message || error });
      throw error;
    }
  }

  /**
   * List all filters for a shop
   * Filters by shop field in single index for all shops
   * Uses must with term query for exact shop matching
   * 
   * Caching: Results are cached based on shop + cpid (collection page ID)
   * If cpid changes and there are multiple filters, cache is invalidated and rechecked
   * 
   * @param shop - Shop domain
   * @param cpid - Optional collection page ID for cache key generation
   */
  async listFilters(shop: string, cpid?: string): Promise<{ filters: Filter[]; total: number }> {
    try {
      const cacheService = getCacheService();
      
      // Try to get from cache first
      const cached = cacheService.getFilterList(shop, cpid);
      if (cached) {
        logger.info('Filter list cache hit', { shop, cpid: cpid || 'none', count: cached.filters.length });
        return cached;
      }

      // If cpid is provided, check if we have a cached result for 'all' (no cpid)
      // If there's only 1 filter, we can reuse that cache regardless of cpid
      if (cpid) {
        const cachedAll = cacheService.getFilterList(shop);
        if (cachedAll && cachedAll.filters.length === 1) {
          // Only one filter exists, cache is valid for all cpids
          logger.info('Reusing single filter cache for different cpid', { 
            shop, 
            cpid, 
            filterId: cachedAll.filters[0].id 
          });
          // Cache this result for the specific cpid too
          cacheService.setFilterList(shop, cachedAll, undefined, cpid);
          return cachedAll;
        }
        // If there are multiple filters and cpid changed, we need to recheck
        // (cache miss will trigger ES query below)
      }

      const index = FILTERS_INDEX_NAME;
      
      logger.info('Listing filters for shop', { shop, index, cpid: cpid || 'none' });
      
      // Use must with term query for exact shop matching
      // Try both shop.keyword (if keyword subfield exists) and shop (direct keyword field)
      // This ensures exact matching regardless of field mapping
      const response = await this.esClient.search({
        index,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { 'shop.keyword': shop } },  // Try keyword subfield first
                    { term: { shop: shop } }  // Fallback to direct keyword field
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        },
        size: 100, // Get all filters for this shop
        // Don't sort - let the application sort after normalization if needed
        // This avoids issues with missing field mappings
      });

      const total = typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value || 0;

      const filters = response.hits.hits.map((hit) => 
        this.normalizeFilter(hit._source)
      );

      // Sort by createdAt (descending) after normalization
      // This ensures we have camelCase fields to sort on
      filters.sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate; // Descending order (newest first)
      });

      // Log sample shop values from results for debugging
      const sampleShops = response.hits.hits.slice(0, 3).map((hit: any) => hit._source?.shop).filter(Boolean);
      
      logger.info('Filters list result', { 
        shop, 
        count: filters.length, 
        total,
        sampleIds: filters.slice(0, 3).map(f => f.id),
        sampleShops,
        queryShop: shop,
        cpid: cpid || 'none'
      });
      
      const result = { filters, total };
      
      // Cache the result based on shop + cpid
      // If there are multiple filters and cpid is provided, we cache it
      // If cpid changes later, the cache will be invalidated and rechecked
      cacheService.setFilterList(shop, result, undefined, cpid);
      
      // If there's only 1 filter, also cache it without cpid (for 'all')
      // This allows reusing the cache when cpid changes but there's only one filter
      if (filters.length === 1) {
        cacheService.setFilterList(shop, result, undefined);
        logger.info('Single filter cached for all cpids', { shop, filterId: filters[0].id });
      }
      
      return result;
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Index doesn't exist yet, return empty
        logger.info('Filters index does not exist', { shop, index: FILTERS_INDEX_NAME });
        return { filters: [], total: 0 };
      }
      logger.error('Error listing filters', { shop, error: error?.message || error, stack: error?.stack });
      throw error;
    }
  }

  /**
   * Create a new filter
   * Always uses the shop parameter (never trusts input.shop) for security
   * Stores in single index with shop field for identification
   */
  async createFilter(shop: string, input: CreateFilterInput): Promise<Filter> {
    try {
      const index = FILTERS_INDEX_NAME;
      const id = uuidv4();
      
      const now = new Date().toISOString();
      // Always use the shop from the function parameter (not from input) for security
      // Store shop as-is from Shopify (e.g., "digitalcoo-filter-demo-10.myshopify.com")
      const filterShop = shop;
      const filter: Filter = {
        id,
        shop: filterShop, // Always use the shop parameter, never trust input.shop
        title: input.title,
        description: input.description,
        filterType: input.filterType || 'custom',
        targetScope: input.targetScope || 'all',
        allowedCollections: input.allowedCollections || [],
        options: input.options.map((opt) => {
          // Extract optionSettings if present (new schema) or use empty object
          const optionSettings = opt.optionSettings || {};
          
          return {
            handle: opt.handle,
            position: opt.position,
            label: opt.label,
            optionType: opt.optionType,
            displayType: opt.displayType || 'LIST',
            selectionType: opt.selectionType || 'MULTIPLE',
            allowedOptions: opt.allowedOptions || [],
            
            // Display Options (top-level)
            collapsed: opt.collapsed ?? false,
            searchable: opt.searchable ?? false,
            showTooltip: opt.showTooltip ?? false,
            tooltipContent: opt.tooltipContent ?? '',
            showCount: opt.showCount ?? false,
            showMenu: opt.showMenu ?? false,
            status: opt.status || 'PUBLISHED',
            
            // Option Settings (nested object per new schema)
            optionSettings: {
              // Value Selection & Filtering
              baseOptionType: optionSettings.baseOptionType,
              removeSuffix: optionSettings.removeSuffix || [],
              replaceText: optionSettings.replaceText || [],
              
              // Value Grouping & Normalization
              valueNormalization: optionSettings.valueNormalization,
              groupBySimilarValues: optionSettings.groupBySimilarValues ?? false,
              
              // Filtering & Prefixes
              removePrefix: optionSettings.removePrefix || [],
              filterByPrefix: optionSettings.filterByPrefix || [],
              
              // Sorting
              sortBy: optionSettings.sortBy || 'ASCENDING',
              manualSortedValues: optionSettings.manualSortedValues || [],
              
              // Advanced
              groups: optionSettings.groups || [],
              menus: optionSettings.menus || [],
              textTransform: optionSettings.textTransform || 'NONE',
              paginationType: optionSettings.paginationType || 'SCROLL',
              
              // Performance Optimization: Pre-computed variant option keys
              variantOptionKey: optionSettings.variantOptionKey,
            },
          };
        }),
        status: input.status || 'PUBLISHED',
        deploymentChannel: input.deploymentChannel || 'APP',
        settings: input.settings,
        tags: input.tags || [],
        // Note: isActive is no longer stored - use status === 'published' instead
        // Keeping isActive undefined/null to avoid storing redundant data
        createdAt: now,
        updatedAt: null,
        version: 0,
      };

      await this.esClient.index({
        index,
        id,
        document: filter, // Store directly in camelCase
      });

      // Invalidate cache instantly when filter is created
      // This ensures filter list and filter results cache are always up-to-date
      try {
        const cacheService = getCacheService();
        cacheService.invalidateShop(shop);
        logger.info('Filter created and cache invalidated', { shop, id, title: filter.title, status: filter.status });
      } catch (cacheError: any) {
        // Log cache invalidation error but don't fail the filter creation
        logger.warn('Failed to invalidate cache after filter creation', {
          shop,
          id,
          error: cacheError?.message || cacheError,
        });
      }

      return filter;
    } catch (error: any) {
      logger.error('Error creating filter', { shop, error: error?.message || error });
      throw error;
    }
  }

  /**
   * Update an existing filter
   * Ensures the filter belongs to the specified shop before updating
   * Uses shop field to filter in single index for all shops
   */
  async updateFilter(shop: string, id: string, input: UpdateFilterInput): Promise<Filter> {
    try {
      const index = FILTERS_INDEX_NAME;
      
      // Get existing filter (this already verifies shop ownership)
      const existing = await this.getFilter(shop, id);
      if (!existing) {
        throw new Error(`Filter with id ${id} not found for shop ${shop}`);
      }
      
      // Double-check shop ownership
      if (existing.shop !== shop) {
        throw new Error(`Filter ${id} does not belong to shop ${shop}`);
      }

      // Merge updates
      const finalStatus = input.status !== undefined ? input.status : existing.status;
      const updated: Filter = {
        ...existing,
        ...input,
        options: input.options || existing.options, // Ensure options array is not replaced if empty
        allowedCollections: input.allowedCollections || existing.allowedCollections, // Ensure array is not replaced if empty
        tags: input.tags || existing.tags, // Ensure array is not replaced if empty
        status: finalStatus,
        updatedAt: new Date().toISOString(),
        version: (existing.version || 0) + 1,
      };
      
      // Remove isActive field - no longer stored, use status === 'published' instead
      delete (updated as any).isActive;

      await this.esClient.index({
        index,
        id,
        document: updated, // Store directly in camelCase
      });

      // Invalidate cache instantly when filter is updated
      // This ensures filter list and filter results cache are always up-to-date
      try {
        const cacheService = getCacheService();
        cacheService.invalidateShop(shop);
        logger.info('Filter updated and cache invalidated', { 
          shop, 
          id, 
          title: updated.title,
          status: updated.status,
          version: updated.version,
          updatedAt: updated.updatedAt,
        });
      } catch (cacheError: any) {
        // Log cache invalidation error but don't fail the filter update
        logger.warn('Failed to invalidate cache after filter update', {
          shop,
          id,
          error: cacheError?.message || cacheError,
        });
      }

      return updated;
    } catch (error: any) {
      logger.error('Error updating filter', { shop, id, error: error?.message || error });
      throw error;
    }
  }

  /**
   * Delete a filter
   * Verifies the filter belongs to the specified shop before deleting
   * Uses shop field to filter in single index for all shops
   */
  async deleteFilter(shop: string, id: string): Promise<boolean> {
    try {
      const index = FILTERS_INDEX_NAME;
      
      // Verify filter exists and belongs to this shop before deleting
      const existing = await this.getFilter(shop, id);
      if (!existing) {
        logger.warn('Filter not found for deletion', { shop, id });
        return false; // Filter doesn't exist or doesn't belong to this shop
      }
      
      // Double-check shop ownership
      if (existing.shop !== shop) {
        logger.error('Attempted to delete filter from wrong shop', {
          requestedShop: shop,
          filterShop: existing.shop,
          id,
        });
        throw new Error(`Filter ${id} does not belong to shop ${shop}`);
      }
      
      await this.esClient.delete({
        index,
        id,
      });

      // Invalidate cache when filter is deleted (always invalidate to be safe)
      try {
        const cacheService = getCacheService();
        cacheService.invalidateShop(shop);
        logger.info('Filter deleted and cache invalidated', { shop, id });
      } catch (cacheError: any) {
        // Log cache invalidation error but don't fail the filter deletion
        logger.warn('Failed to invalidate cache after filter deletion', {
          shop,
          id,
          error: cacheError?.message || cacheError,
        });
      }

      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false; // Already deleted
      }
      logger.error('Error deleting filter', { shop, id, error: error?.message || error });
      throw error;
    }
  }

  /**
   * Delete all filters for a shop
   * Used during app uninstallation to clean up all filter data
   */
  async deleteAllFilters(shop: string): Promise<number> {
    try {
      const index = FILTERS_INDEX_NAME;
      
      logger.info('Deleting all filters for shop', { shop });
      
      // Use delete by query to remove all filters for this shop
      const response = await this.esClient.deleteByQuery({
        index,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { 'shop.keyword': shop } },
                    { term: { shop: shop } }
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        },
        refresh: true,
      });

      const deletedCount = response.deleted || 0;
      
      // Invalidate cache when filters are deleted
      try {
        const cacheService = getCacheService();
        cacheService.invalidateShop(shop);
        logger.info('All filters deleted and cache invalidated', { shop, deletedCount });
      } catch (cacheError: any) {
        // Log cache invalidation error but don't fail the deletion
        logger.warn('Failed to invalidate cache after deleting all filters', {
          shop,
          deletedCount,
          error: cacheError?.message || cacheError,
        });
      }

      return deletedCount;
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Index doesn't exist, no filters to delete
        logger.info('Filters index does not exist', { shop });
        return 0;
      }
      logger.error('Error deleting all filters for shop', { shop, error: error?.message || error });
      throw error;
    }
  }
}
