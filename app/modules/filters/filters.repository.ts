/**
 * Filters Repository
 * Handles Elasticsearch operations for filter configurations
 * Uses camelCase for all database field names (following coding standards)
 */

import { Client } from '@elastic/elasticsearch';
import { FILTERS_INDEX_NAME } from '@shared/constants/filters.constants';
import { createModuleLogger } from '@shared/utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import { Filter, CreateFilterInput, UpdateFilterInput } from './filters.type';
import { getCacheService } from '@core/cache';

const logger = createModuleLogger('filters-repository');

export class FiltersRepository {
  constructor(private esClient: Client) {}

  /**
   * Get index name for a shop
   */
  private getIndexName(shop: string): string {
    return FILTERS_INDEX_NAME(shop);
  }

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
      options: (data.options ?? []).map((opt: any) => ({
        handle: opt.handle,
        position: opt.position,
        optionId: opt.optionId ?? opt.option_id ?? opt.uid ?? '',
        label: opt.label,
        optionType: opt.optionType ?? opt.option_type ?? opt.type ?? '',
        displayType: opt.displayType ?? opt.display_type ?? 'list',
        selectionType: opt.selectionType ?? opt.selection_type ?? 'multiple',
        targetScope: opt.targetScope ?? opt.target_scope ?? opt.target_selection ?? 'all',
        allowedOptions: opt.allowedOptions ?? opt.allowed_options ?? opt.entitled_options ?? [],
        
        // Value Selection & Filtering
        baseOptionType: opt.baseOptionType ?? undefined,
        selectedValues: opt.selectedValues ?? [],
        removeSuffix: opt.removeSuffix ?? [],
        replaceText: opt.replaceText ?? [],
        
        // Value Grouping & Normalization
        valueNormalization: opt.valueNormalization ?? undefined,
        groupBySimilarValues: opt.groupBySimilarValues ?? opt.group_by_similar_values ?? false,
        
        // Display Options
        collapsed: opt.collapsed ?? false,
        searchable: opt.searchable ?? false,
        showTooltip: opt.showTooltip ?? false,
        tooltipContent: opt.tooltipContent ?? opt.tooltip_content ?? '',
        showCount: opt.showCount ?? false,
        
        // Filtering & Prefixes
        removePrefix: opt.removePrefix ?? opt.remove_prefix ?? [],
        filterByPrefix: opt.filterByPrefix ?? opt.filter_by_prefix ?? [],
        
        // Sorting
        sortBy: opt.sortBy ?? opt.sort_by ?? 'ascending',
        manualSortedValues: opt.manualSortedValues ?? opt.manual_sorted_values ?? [],
        
        // Advanced
        groups: opt.groups ?? [],
        menus: opt.menus ?? [],
        showMenu: opt.showMenu ?? opt.show_menu ?? false,
        textTransform: opt.textTransform ?? opt.text_transform ?? 'none',
        paginationType: opt.paginationType ?? opt.pagination_type ?? 'scroll',
        status: opt.status ?? 'published',
        
        // Performance Optimization: Pre-computed variant option keys
        variantOptionKey: opt.variantOptionKey ?? opt.variant_option_key ?? undefined,
      })),
      status: data.status ?? 'published',
      deploymentChannel: data.deploymentChannel ?? data.deployment_channel ?? data.channel ?? 'app',
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
   * Get filter by ID
   */
  async getFilter(shop: string, id: string): Promise<Filter | null> {
    try {
      const index = this.getIndexName(shop);
      const response = await this.esClient.get({
        index,
        id,
      });

      if (response.found && response._source) {
        const normalized = this.normalizeFilter(response._source);
        logger.log('Normalized filter', { 
          shop, 
          id, 
          hasFilterType: !!normalized.filterType,
          hasTargetScope: !!normalized.targetScope,
          hasDeploymentChannel: !!normalized.deploymentChannel,
          optionsCount: normalized.options?.length || 0,
        });
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
   */
  async listFilters(shop: string): Promise<{ filters: Filter[]; total: number }> {
    try {
      const index = this.getIndexName(shop);
      
      const response = await this.esClient.search({
        index,
        query: { match_all: {} },
        size: 10000, // Get all filters
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

      return { filters, total };
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Index doesn't exist yet, return empty
        return { filters: [], total: 0 };
      }
      logger.error('Error listing filters', { shop, error: error?.message || error });
      throw error;
    }
  }

  /**
   * Create a new filter
   */
  async createFilter(shop: string, input: CreateFilterInput): Promise<Filter> {
    try {
      const index = this.getIndexName(shop);
      const id = uuidv4();
      
      const now = new Date().toISOString();
      const filter: Filter = {
        id,
        shop: input.shop || shop,
        title: input.title,
        description: input.description,
        filterType: input.filterType || 'custom',
        targetScope: input.targetScope || 'all',
        allowedCollections: input.allowedCollections || [],
        options: input.options.map((opt) => ({
          handle: opt.handle,
          position: opt.position,
          optionId: opt.optionId,
          label: opt.label,
          optionType: opt.optionType,
          displayType: opt.displayType || 'list',
          selectionType: opt.selectionType || 'multiple',
          targetScope: opt.targetScope || 'all',
          allowedOptions: opt.allowedOptions || [],
          
          // Value Selection & Filtering
          baseOptionType: opt.baseOptionType,
          selectedValues: opt.selectedValues || [],
          removeSuffix: opt.removeSuffix || [],
          replaceText: opt.replaceText || [],
          
          // Value Grouping & Normalization
          valueNormalization: opt.valueNormalization,
          groupBySimilarValues: opt.groupBySimilarValues ?? false,
          
          // Display Options
          collapsed: opt.collapsed ?? false,
          searchable: opt.searchable ?? false,
          showTooltip: opt.showTooltip ?? false,
          tooltipContent: opt.tooltipContent ?? '',
          showCount: opt.showCount ?? false,
          
          // Filtering & Prefixes
          removePrefix: opt.removePrefix || [],
          filterByPrefix: opt.filterByPrefix || [],
          
          // Sorting
          sortBy: opt.sortBy || 'ascending',
          manualSortedValues: opt.manualSortedValues || [],
          
          // Advanced
          groups: opt.groups || [],
          menus: opt.menus || [],
          showMenu: opt.showMenu ?? false,
          textTransform: opt.textTransform || 'none',
          paginationType: opt.paginationType || 'scroll',
          status: opt.status || 'published',
          
          // Performance Optimization: Pre-computed variant option keys
          variantOptionKey: opt.variantOptionKey,
        })),
        status: input.status || 'published',
        deploymentChannel: input.deploymentChannel || 'app',
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

      // Invalidate cache only if the filter is published (active)
      // This avoids unnecessary cache invalidation for draft/inactive filters
      // Note: status === 'published' is the single source of truth for active filters
      if (filter.status === 'published') {
        try {
          const cacheService = getCacheService();
          cacheService.invalidateShop(shop);
          logger.info('Filter created and cache invalidated', { shop, id, title: filter.title });
        } catch (cacheError: any) {
          // Log cache invalidation error but don't fail the filter creation
          logger.warn('Failed to invalidate cache after filter creation', {
            shop,
            id,
            error: cacheError?.message || cacheError,
          });
        }
      } else {
        logger.debug('Filter created but cache not invalidated (filter is not published)', {
          shop,
          id,
          status: filter.status,
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
   */
  async updateFilter(shop: string, id: string, input: UpdateFilterInput): Promise<Filter> {
    try {
      const index = this.getIndexName(shop);
      
      // Get existing filter
      const existing = await this.getFilter(shop, id);
      if (!existing) {
        throw new Error(`Filter with id ${id} not found`);
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

      // Invalidate cache only if the filter is published (active)
      // This avoids unnecessary cache invalidation for draft/inactive filters
      // Note: status === 'published' is the single source of truth for active filters
      if (updated.status === 'published') {
        try {
          const cacheService = getCacheService();
          cacheService.invalidateShop(shop);
          logger.info('Filter updated and cache invalidated', { 
            shop, 
            id, 
            title: updated.title,
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
      } else {
        logger.debug('Filter updated but cache not invalidated (filter is not published)', {
          shop,
          id,
          status: updated.status,
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
   */
  async deleteFilter(shop: string, id: string): Promise<boolean> {
    try {
      const index = this.getIndexName(shop);
      
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
}
