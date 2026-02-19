/**
 * Product Bulk Indexer Service
 * Handles bulk indexing of products from Shopify to Elasticsearch
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import readline from 'readline';
import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import {
  ensureCacheDir,
  transformProductToESDoc,
  appendLog,
  sleep,
  detectType
} from './indexing.helper';
import { normalizeShopifyId, extractShopifyResourceType } from '@shared/utils/shopify-id.util';
import { BULK_PRODUCTS_MUTATION, POLL_QUERY } from './indexing.graphql';
import { ShopifyGraphQLRepository } from './indexing.graphql.repository';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { IndexerOptions, CheckpointData } from './indexing.type';
import { IndexerCheckpointService } from './indexing.checkpoint.service';
import { filterMappedFields } from '@core/elasticsearch/es.document.filter';
import { filterProductFields } from '@shared/storefront/field.filter';
import { ensureProductIndex } from '@shared/storefront/index.util';
import { BestSellerCollectionService } from './indexing.best-seller-collection.service';
import { PRODUCT_INDEX_NAME } from '@shared/constants/products.constants';
import { SystemMonitor } from '@core/utils/system-monitor.util';
import { FiltersRepository } from '@modules/filters/filters.repository';
import { SearchRepository } from '@modules/search/search.repository';
import { StorefrontSearchRepository } from '@shared/storefront/repository';
import { StorefrontSearchService } from '@shared/storefront/service';
import { ProductFilters } from '@shared/storefront/types';
import { CreateFilterInput, UpdateFilterInput } from '@shared/filters/types';
import { SEARCH_INDEX_NAME } from '@shared/constants/es.constant';

const LOGGER = createModuleLogger('ProductBulkIndexer');

export interface BulkIndexerDependencies {
  esClient: Client;
  shopsRepository: any; // ShopsRepository - will be imported properly
  esMapping?: any; // Optional ES mapping for field filtering
}

export class ProductBulkIndexer {
  private shop: string;
  private indexName: string;
  private batchSize: number;
  private cachePath: string;
  private maxRetries: number;
  private retryDelay: number;
  private checkpointService: IndexerCheckpointService;
  private readonly esClient: Client;
  private readonly esMapping?: any;
  private readonly maxConcurrentBatches: number;
  private readonly checkpointDebounceMs: number;
  private graphqlRepo: ShopifyGraphQLRepository;
  private bestSellerCollectionService: BestSellerCollectionService | null = null;
  private productRanks: Map<string, number> = new Map();
  private indexedProductIds: Set<string> = new Set(); // Track products indexed in this run
  private systemMonitor: SystemMonitor | null = null;

  constructor(opts: IndexerOptions, deps: BulkIndexerDependencies) {
    this.shop = opts.shop;
    this.esClient = deps.esClient;
    this.esMapping = deps.esMapping;
    this.indexName = opts.esIndex || PRODUCT_INDEX_NAME(this.shop);
    this.batchSize = opts.batchSize || parseInt(process.env.INDEXER_BATCH_SIZE ?? '2000');
    this.maxRetries = opts.maxRetries || 3;
    this.retryDelay = opts.retryDelay || 1000;
    this.maxConcurrentBatches = parseInt(process.env.INDEXER_MAX_CONCURRENT_BATCHES ?? '3');
    this.checkpointDebounceMs = parseInt(process.env.INDEXER_CHECKPOINT_DEBOUNCE_MS ?? '2000');
    
    const baseDir = process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), "dist")
      : process.cwd();
                
    this.cachePath = path.join(baseDir, 'system', 'cache', 'temp', `products_bulk_${ShopifyShopName(this.shop)}_${Date.now()}.jsonl`);
    ensureCacheDir(path.dirname(this.cachePath));
    
    this.checkpointService = new IndexerCheckpointService(this.esClient, this.shop, this.checkpointDebounceMs);
    this.graphqlRepo = new ShopifyGraphQLRepository(deps.shopsRepository);
    this.bestSellerCollectionService = new BestSellerCollectionService(this.esClient, this.shop, this.graphqlRepo);
    
    LOGGER.log('ProductBulkIndexer initialized', {
      shop: this.shop,
      indexName: this.indexName,
      hasBestSellerService: !!this.bestSellerCollectionService,
    });
  }

  private createUniqueHandle(base: string, usedHandles: Set<string>): string {
    const normalizedBase = base
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const fallback = normalizedBase || 'option';
    let handle = fallback;
    let suffix = 1;

    while (usedHandles.has(handle)) {
      handle = `${fallback}-${suffix++}`;
    }

    usedHandles.add(handle);
    return handle;
  }

  private buildDefaultFilterOption(input: {
    handle: string;
    position: number;
    label: string;
    optionType: string;
    baseOptionType: string;
    displayType?: string;
    selectionType?: string;
    variantOptionKey?: string;
  }): CreateFilterInput['options'][number] {
    const optionSettings: NonNullable<CreateFilterInput['options'][number]['optionSettings']> = {
      baseOptionType: input.baseOptionType,
      removeSuffix: [],
      replaceText: [],
      valueNormalization: {},
      groupBySimilarValues: false,
      removePrefix: [],
      filterByPrefix: [],
      sortBy: 'COUNT',
      manualSortedValues: [],
      groups: [],
      menus: [],
      textTransform: 'NONE',
      paginationType: 'PAGES',
    };

    if (input.variantOptionKey) {
      optionSettings.variantOptionKey = input.variantOptionKey;
    }

    return {
      handle: input.handle,
      position: input.position,
      label: input.label,
      optionType: input.optionType,
      displayType: input.displayType || 'CHECKBOX',
      selectionType: input.selectionType || 'MULTIPLE',
      allowedOptions: [],
      collapsed: false,
      searchable: true,
      showTooltip: false,
      tooltipContent: '',
      showCount: true,
      showMenu: false,
      status: 'PUBLISHED',
      optionSettings,
    };
  }

  private buildDefaultFilterInput(storefrontFilters: ProductFilters): CreateFilterInput {
    const options: CreateFilterInput['options'] = [];
    const usedHandles = new Set<string>();
    let position = 0;

    const pushOption = (option: CreateFilterInput['options'][number]) => {
      options.push({
        ...option,
        position: position++,
      });
    };

    const hasValues = (values?: Array<{ value: string; count: number }>) =>
      Array.isArray(values) && values.length > 0;

    const price = storefrontFilters.price;
    if (
      price &&
      typeof price.min === 'number' &&
      typeof price.max === 'number' &&
      price.max > price.min
    ) {
      pushOption(
        this.buildDefaultFilterOption({
          handle: this.createUniqueHandle('price', usedHandles),
          position,
          label: 'Price',
          optionType: 'Price',
          baseOptionType: 'PRICE',
          displayType: 'RANGE',
          selectionType: 'RANGE',
        })
      );
    }

    if (hasValues(storefrontFilters.vendors)) {
      pushOption(
        this.buildDefaultFilterOption({
          handle: this.createUniqueHandle('vendor', usedHandles),
          position,
          label: 'Vendor',
          optionType: 'Vendor',
          baseOptionType: 'VENDOR',
        })
      );
    }

    if (hasValues(storefrontFilters.productTypes)) {
      pushOption(
        this.buildDefaultFilterOption({
          handle: this.createUniqueHandle('product-type', usedHandles),
          position,
          label: 'ProductType',
          optionType: 'ProductType',
          baseOptionType: 'PRODUCT_TYPE',
        })
      );
    }

    if (hasValues(storefrontFilters.tags)) {
      pushOption(
        this.buildDefaultFilterOption({
          handle: this.createUniqueHandle('tags', usedHandles),
          position,
          label: 'Tags',
          optionType: 'Tags',
          baseOptionType: 'TAGS',
        })
      );
    }

    if (hasValues(storefrontFilters.collections)) {
      pushOption(
        this.buildDefaultFilterOption({
          handle: this.createUniqueHandle('collection', usedHandles),
          position,
          label: 'Collection',
          optionType: 'Collection',
          baseOptionType: 'COLLECTION',
        })
      );
    }

    const variantOptionKeys = Object.keys(storefrontFilters.options || {}).sort((a, b) => a.localeCompare(b));
    for (const optionKey of variantOptionKeys) {
      const optionValues = storefrontFilters.options?.[optionKey];
      if (!hasValues(optionValues)) {
        continue;
      }

      pushOption(
        this.buildDefaultFilterOption({
          handle: this.createUniqueHandle(optionKey, usedHandles),
          position,
          label: optionKey.charAt(0).toUpperCase() + optionKey.slice(1),
          optionType: optionKey,
          baseOptionType: 'OPTION',
          variantOptionKey: optionKey.trim(),
        })
      );
    }

    return {
      title: 'Default Filter',
      description: 'Default filter created automatically after product indexing',
      filterType: 'default',
      targetScope: 'all',
      options,
      status: 'PUBLISHED',
      deploymentChannel: 'APP',
      settings: {
        defaultView: 'grid',
        filterOrientation: 'vertical',
        showFilterCount: true,
        showActiveFilters: true,
        showResetButton: true,
        showClearAllButton: true,
        productDisplay: {
          gridColumns: 3,
          showProductCount: true,
          showSortOptions: true,
          defaultSort: 'relevance',
        },
        pagination: {
          type: 'PAGES',
          itemsPerPage: 24,
          showPageInfo: true,
          pageInfoFormat: '',
        },
      },
      tags: ['auto-created'],
    };
  }

  private normalizeSearchConfigId(shop: string): string {
    return shop.trim().replace(/[/\*\?"<>|,\s#]/g, '_');
  }

  private async ensureDefaultSearchConfig(): Promise<void> {
    const searchConfigId = this.normalizeSearchConfigId(this.shop);
    let configExists = false;

    try {
      configExists = await this.esClient.exists({
        index: SEARCH_INDEX_NAME,
        id: searchConfigId,
      });
    } catch (error: any) {
      if (error?.statusCode !== 404) {
        throw error;
      }
      configExists = false;
    }

    if (configExists) {
      LOGGER.log(`Search config already exists for shop ${this.shop}, skipping default creation`);
      return;
    }

    const searchRepo = new SearchRepository(this.esClient);
    const defaultSearchConfig = await searchRepo.getSearchConfig(this.shop);
    await searchRepo.updateSearchConfig(this.shop, {
      fields: defaultSearchConfig.fields,
    });

    LOGGER.log(`Default search config created for shop ${this.shop}`);
  }

  private async ensureDefaultFilterAndSearchConfig(): Promise<void> {
    try {
      await this.esClient.indices.refresh({ index: this.indexName });
    } catch (error: any) {
      LOGGER.warn(`Failed to refresh product index before onboarding defaults for shop ${this.shop}`, {
        error: error?.message || error,
      });
    }

    const filtersRepo = new FiltersRepository(this.esClient);
    const storefrontService = new StorefrontSearchService(
      new StorefrontSearchRepository(this.esClient)
    );
    const storefrontFilters = await storefrontService.getFilters(this.shop);
    const defaultFilterInput = this.buildDefaultFilterInput(storefrontFilters);
    const existingFilters = await filtersRepo.listFilters(this.shop);

    if (existingFilters.total === 0) {
      LOGGER.log(`No filters found for shop ${this.shop}, creating default filter`);
      await filtersRepo.createFilter(this.shop, defaultFilterInput);
      LOGGER.log(`Default filter created successfully for shop ${this.shop}`);
    } else {
      const staleDefaultFilter = existingFilters.filters.find((filter) => {
        const hasNoOptions = !Array.isArray(filter.options) || filter.options.length === 0;
        const isDefaultTitle = (filter.title || '').trim().toLowerCase() === 'default filter';
        return hasNoOptions && isDefaultTitle;
      });

      if (staleDefaultFilter) {
        const updateInput: UpdateFilterInput = {
          title: defaultFilterInput.title,
          description: defaultFilterInput.description,
          filterType: defaultFilterInput.filterType,
          targetScope: defaultFilterInput.targetScope,
          options: defaultFilterInput.options,
          status: defaultFilterInput.status,
          deploymentChannel: defaultFilterInput.deploymentChannel,
          settings: defaultFilterInput.settings,
          tags: defaultFilterInput.tags,
        };

        LOGGER.log(`Updating stale default filter for shop ${this.shop}`, { filterId: staleDefaultFilter.id });
        await filtersRepo.updateFilter(this.shop, staleDefaultFilter.id, updateInput);
      } else {
        LOGGER.log(`Filters already exist for shop ${this.shop} (${existingFilters.total}), skipping default filter creation`);
      }
    }

    await this.ensureDefaultSearchConfig();
  }

  /**
   * Get the latest updatedAt timestamp from the downloaded JSONL file
   */
  private async getLatestUpdatedAtFromFile(filePath: string): Promise<string | null> {
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: "utf8" }),
        crlfDelay: Infinity
      });

      let latestUpdatedAt: string | null = null;
      let productCount = 0;
      let lineCount = 0;
      const sampleSize = 500;
      const checkInterval = 10;

      for await (const line of rl) {
        lineCount++;
        if (!line.trim()) continue;
        
        const shouldCheck = productCount < sampleSize || lineCount % checkInterval === 0;
        
        if (shouldCheck) {
          try {
            const row = JSON.parse(line);
            const type = detectType(row);
            
            if (type === 'Product' && row.updatedAt) {
              productCount++;
              if (!latestUpdatedAt || row.updatedAt > latestUpdatedAt) {
                latestUpdatedAt = row.updatedAt;
              }
            }
          } catch (err) {
            continue;
          }
        }
      }

      LOGGER.debug(`Scanned ${productCount} products from ${lineCount} lines, latest updatedAt: ${latestUpdatedAt}`);
      return latestUpdatedAt;
    } catch (error: any) {
      LOGGER.warn('Failed to get latest updatedAt from file', error?.message || error);
      return null;
    }
  }

  /**
   * Check if there are new updates since last indexing
   */
  private async hasNewUpdates(checkpoint: CheckpointData, latestUpdatedAt: string | null): Promise<boolean> {
    if (!latestUpdatedAt) {
      LOGGER.log('Cannot determine latest updatedAt, assuming new updates exist');
      return true;
    }

    if (!checkpoint.lastShopifyUpdatedAt) {
      LOGGER.log('No previous updatedAt in checkpoint, assuming new updates exist');
      return true;
    }

    const hasUpdates = latestUpdatedAt > checkpoint.lastShopifyUpdatedAt;
    if (hasUpdates) {
      LOGGER.log(`New updates detected: latest=${latestUpdatedAt}, previous=${checkpoint.lastShopifyUpdatedAt}`);
    } else {
      LOGGER.log(`No new updates: latest=${latestUpdatedAt}, previous=${checkpoint.lastShopifyUpdatedAt}`);
    }

    return hasUpdates;
  }

  // Start the whole flow
  public async run() {
    LOGGER.log('Starting product bulk indexer');
    
    // Initialize system monitor for resource tracking
    this.systemMonitor = new SystemMonitor({ memory: 0.85, cpu: 0.85 });
    
    // Set up event listeners for high resource usage warnings
    this.systemMonitor.on('high', (usage) => {
      LOGGER.warn('⚠️ High system resource usage detected during indexing', {
        cpu: `${usage.cpuPercent.toFixed(2)}%`,
        memory: `${usage.memoryPercent.toFixed(2)}% (${usage.memoryUsed} / ${usage.memoryTotal})`,
      });
      appendLog(`WARNING: High resource usage - CPU: ${usage.cpuPercent.toFixed(1)}%, Memory: ${usage.memoryPercent.toFixed(1)}%`);
    });
    
    // Start monitoring (check every 5 seconds during indexing)
    this.systemMonitor.start(5000);
    
    // Check initial resource usage before starting
    await new Promise((resolve) => setTimeout(resolve, 200)); // Wait for first reading
    const initialUsage = this.systemMonitor.usage;
    
    LOGGER.log('System resource status before indexing:', {
      cpu: `${initialUsage.cpuPercent.toFixed(2)}%`,
      memory: `${initialUsage.memoryPercent.toFixed(2)}% (${initialUsage.memoryUsed} / ${initialUsage.memoryTotal})`,
      isHigh: initialUsage.isHigh,
    });
    
    if (initialUsage.isHigh) {
      LOGGER.warn('⚠️ High system resource usage detected before indexing. Consider restarting the server if issues occur.');
      appendLog(`WARNING: High resource usage before indexing - CPU: ${initialUsage.cpuPercent.toFixed(1)}%, Memory: ${initialUsage.memoryPercent.toFixed(1)}%`);
    }
    
    // Ensure product index exists with proper settings (field limit, etc.)
    try {
      LOGGER.log(`Ensuring product index exists: ${this.indexName}`);
      await ensureProductIndex(this.esClient, this.shop);
      LOGGER.log(`Product index ready: ${this.indexName}`);
    } catch (error: any) {
      LOGGER.error(`Failed to ensure product index: ${this.indexName}`, error?.message || error);
      throw new Error(`Failed to ensure product index: ${error?.message || error}`);
    }
    
    // Load checkpoint with validation
    const { checkpoint, shouldUse, reason } = await this.checkpointService.loadCheckpoint(this.indexName);
    
    LOGGER.log(`Checkpoint validation: shouldUse=${shouldUse}, reason=${reason}`);
    
    // If checkpoint shouldn't be used, reset it
    if (!shouldUse) {
      LOGGER.log(`Resetting checkpoint due to: ${reason}`);
      await this.checkpointService.clearCheckpoint();
      this.checkpointService.updateCheckpoint({
        lastProcessedLine: 0,
        status: 'in_progress',
        totalIndexed: 0,
        totalFailed: 0,
        failedItems: [],
      });
    } else {
      LOGGER.log(`Using checkpoint: lastProcessedLine=${checkpoint.lastProcessedLine}, status=${checkpoint.status}`);
    }
    
    // Initialize/update checkpoint with in_progress status
    // Only update startedAt if it's not already set (to preserve the original start time)
    const currentCheckpoint = this.checkpointService.getCheckpoint();
    const updates: any = {
      status: 'in_progress',
      totalIndexed: 0,
      totalFailed: 0,
      failedItems: [],
    };
    
    // Only set startedAt if not already set (preserve original start time)
    if (!currentCheckpoint.startedAt) {
      updates.startedAt = new Date().toISOString();
    }
    
    this.checkpointService.updateCheckpoint(updates);
    
    // Force save immediately to make status visible in real-time
    await this.checkpointService.forceSave(this.indexName);

    // Ensure best seller collection is ready and fetch ranks
    LOGGER.log('═══════════════════════════════════════════════════════════');
    LOGGER.log('BEST SELLER COLLECTION SETUP - STARTING');
    LOGGER.log('═══════════════════════════════════════════════════════════');
    appendLog('═══════════════════════════════════════════════════════════');
    appendLog('BEST SELLER COLLECTION SETUP - STARTING');
    appendLog('═══════════════════════════════════════════════════════════');
    
    try {
      if (this.bestSellerCollectionService) {
        LOGGER.log('🔵 Service exists, starting collection setup...');
        appendLog('Service exists, starting collection setup');
        
        await this.bestSellerCollectionService.markAsIndexing();
        LOGGER.log('🔵 Marked collection as indexing');
        
        LOGGER.log('🔵 Calling ensureCollectionReady()...');
        const { collectionId, productCount } = await this.bestSellerCollectionService.ensureCollectionReady();
        LOGGER.log('✅ Best seller collection ready', { collectionId, productCount });
        appendLog(`Best seller collection ready: ${collectionId}, products: ${productCount}`);
        
        // Fetch product ranks from collection
        LOGGER.log('🔵 Fetching product ranks from collection...');
        appendLog('Fetching product ranks from collection');
        this.productRanks = await this.bestSellerCollectionService.getProductRanks(collectionId);
        LOGGER.log(`✅ Fetched ${this.productRanks.size} product ranks from collection`);
        appendLog(`Fetched ${this.productRanks.size} product ranks`);
        
        if (this.productRanks.size > 0) {
          const sampleRanks = Array.from(this.productRanks.entries()).slice(0, 3);
          LOGGER.log('📊 Sample ranks:', sampleRanks);
        }
        
        if (this.productRanks.size === 0) {
          LOGGER.warn('⚠️ No product ranks fetched - collection might be empty or products not yet populated');
          appendLog('WARNING: No product ranks fetched');
        }
        
        LOGGER.log('═══════════════════════════════════════════════════════════');
        LOGGER.log('✅ BEST SELLER COLLECTION SETUP - COMPLETED');
        LOGGER.log('═══════════════════════════════════════════════════════════');
        appendLog('BEST SELLER COLLECTION SETUP - COMPLETED');
      } else {
        LOGGER.error('❌ bestSellerCollectionService is null - cannot fetch ranks');
        appendLog('ERROR: bestSellerCollectionService is null');
      }
    } catch (error: any) {
      LOGGER.error('═══════════════════════════════════════════════════════════');
      LOGGER.error('❌ BEST SELLER COLLECTION SETUP - FAILED');
      LOGGER.error('═══════════════════════════════════════════════════════════');
      LOGGER.error('❌ Failed to setup best seller collection', {
        error: error?.message || error,
        stack: error?.stack,
      });
      appendLog('═══════════════════════════════════════════════════════════');
      appendLog(`ERROR: Failed to setup best seller collection: ${error?.message || error}`);
      appendLog('═══════════════════════════════════════════════════════════');
      // Continue indexing even if best seller collection fails
      this.productRanks = new Map(); // Reset to empty map
    }

    try {
      LOGGER.log('Calling startBulkOperation()...');
      const bulkOpResponse = await Promise.race([
        this.startBulkOperation(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Bulk operation start timed out after 60 seconds')), 60000)
        ),
      ]) as any;
      
      LOGGER.log('startBulkOperation() completed', {
        hasResponse: !!bulkOpResponse,
        hasBulkOperation: !!bulkOpResponse?.bulkOperation,
      });

      LOGGER.log('Bulk operation started:', bulkOpResponse);

      const id = bulkOpResponse?.bulkOperation?.id;
      const status = bulkOpResponse?.bulkOperation?.status;

      if (id && (status === 'CREATED' || status === 'RUNNING')) {
        LOGGER.log('Polling for bulk operation status, id=', id);
        // Status should already be in_progress from initialization
        // Just ensure checkpoint is saved before polling
        await this.checkpointService.saveCheckpointImmediate(this.indexName);
        
        const result = await this.pollUntilComplete(id);
        if (!result || !result.url) {
          throw new Error('Bulk operation did not return a download url');
        }

        LOGGER.log('Downloading file to cache:', this.cachePath);
        // Status should still be in_progress, no need to update
        
        await this.downloadFile(result.url, this.cachePath);

        // Get latest updatedAt from downloaded file
        const latestUpdatedAt = await this.getLatestUpdatedAtFromFile(this.cachePath);
        LOGGER.log(`Latest updatedAt from Shopify: ${latestUpdatedAt}`);

        // Check if there are new updates
        const currentCheckpoint = this.checkpointService.getCheckpoint();
        const hasUpdates = await this.hasNewUpdates(currentCheckpoint, latestUpdatedAt);

        // If there are new updates, reset checkpoint to start fresh
        if (hasUpdates && currentCheckpoint.status === 'success') {
          LOGGER.log('New updates detected since last successful indexing, resetting checkpoint');
          this.checkpointService.updateCheckpoint({
            lastProcessedLine: 0,
            totalIndexed: 0,
            totalFailed: 0,
            failedItems: [],
            lastShopifyUpdatedAt: latestUpdatedAt || undefined,
          });
        } else if (currentCheckpoint.status === 'failed') {
          LOGGER.log('Resuming from previous error, keeping checkpoint but updating timestamp');
          this.checkpointService.updateCheckpoint({
            lastShopifyUpdatedAt: latestUpdatedAt || undefined,
          });
        } else if (!hasUpdates && currentCheckpoint.status === 'success') {
          LOGGER.log('No new updates detected, but will still index to ensure consistency');
          this.checkpointService.updateCheckpoint({
            lastShopifyUpdatedAt: latestUpdatedAt || undefined,
          });
        }

        LOGGER.log('Beginning streaming parse + index');
        const finalCheckpoint = this.checkpointService.getCheckpoint();
        LOGGER.log(`Starting from line ${finalCheckpoint.lastProcessedLine}`);

        try {
          // Reset tracked product IDs for this run
          this.indexedProductIds.clear();
          
          // Ensure status is in_progress before starting streaming
          // Status should already be in_progress from initialization
          // Just ensure checkpoint is saved
          await this.checkpointService.saveCheckpointImmediate(this.indexName);
          
          await this.streamAndIndex(this.cachePath);
          
          // Get final latest updatedAt for checkpoint
          const finalLatestUpdatedAt = latestUpdatedAt || await this.getLatestUpdatedAtFromFile(this.cachePath);
          
          // Cleanup: Delete products from ES that no longer exist in Shopify
          LOGGER.log('🔵 Starting cleanup of deleted products from Elasticsearch...');
          appendLog('Cleaning up deleted products from Elasticsearch');
          const deletedCount = await this.cleanupDeletedProducts();
          LOGGER.log(`✅ Cleanup completed: Deleted ${deletedCount} products that no longer exist in Shopify`);
          appendLog(`Deleted ${deletedCount} products that no longer exist in Shopify`);
          
          // Mark best seller collection as ready after indexing (before final status update)
          if (this.bestSellerCollectionService) {
            try {
              await this.bestSellerCollectionService.markAsReady();
            } catch (error: any) {
              LOGGER.warn('Failed to mark collection as ready', error?.message || error);
            }
          }
          
          // Mark as successful - update in-memory checkpoint first
          this.checkpointService.updateCheckpoint({
            status: 'success',
            completedAt: new Date().toISOString(),
            failedItems: [],
            lastShopifyUpdatedAt: finalLatestUpdatedAt || undefined,
          });
          
          // Force save final status immediately - this will stop periodic saves
          // and ensure the success status is persisted
          try {
            await this.checkpointService.forceSave(this.indexName, finalLatestUpdatedAt || undefined);
            const savedCheckpoint = this.checkpointService.getCheckpoint();
            LOGGER.log('Final status saved to ES: success', {
              status: savedCheckpoint.status,
              totalIndexed: savedCheckpoint.totalIndexed,
              completedAt: savedCheckpoint.completedAt,
            });
          } catch (saveError: any) {
            LOGGER.error('Failed to save final status to ES', saveError?.message || saveError);
            // Try one more time without optional params
            try {
              await this.checkpointService.forceSave(this.indexName);
              LOGGER.log('Final status saved to ES on retry: success');
            } catch (retryError: any) {
              LOGGER.error('Failed to save final status on retry', retryError?.message || retryError);
            }
          }
          
          LOGGER.log('Indexing run completed successfully');
          const finalCheckpoint = this.checkpointService.getCheckpoint();
          appendLog(`Indexer finished successfully. Indexed: ${finalCheckpoint.totalIndexed}, Failed: ${finalCheckpoint.totalFailed}, Deleted: ${deletedCount}`);
          
          // Create default filter + default search config after successful indexing.
          // This keeps first-install onboarding automatic and idempotent.
          if (finalCheckpoint.status === 'success') {
            try {
              await this.ensureDefaultFilterAndSearchConfig();
            } catch (onboardingError: any) {
              LOGGER.warn(`Failed to apply onboarding defaults for shop ${this.shop}`, {
                error: onboardingError?.message || onboardingError,
              });
              // Don't fail the indexing process if onboarding defaults fail
            }
          }
        } catch (error: any) {
          // Mark as failed but save progress
          this.checkpointService.updateCheckpoint({
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: error?.message || String(error),
          });
          
          // Force save failed status - ensure this completes
          try {
            await this.checkpointService.forceSave(this.indexName, latestUpdatedAt || undefined);
            LOGGER.log('Final status saved to ES: failed');
          } catch (saveError: any) {
            LOGGER.error('Failed to save failed status to ES', saveError?.message || saveError);
            // Try one more time without optional params
            try {
              await this.checkpointService.forceSave(this.indexName);
            } catch (retryError: any) {
              LOGGER.error('Failed to save failed status on retry', retryError?.message || retryError);
            }
          }
          
          LOGGER.error('Indexing failed:', error?.message || error);
          const checkpoint = this.checkpointService.getCheckpoint();
          appendLog(`Indexer failed: ${error?.message || error}. Progress saved at line ${checkpoint.lastProcessedLine}`);
          throw error;
        }
      } else {
        this.checkpointService.updateCheckpoint({
          status: 'failed',
          error: 'Bulk operation failed to start properly',
          completedAt: new Date().toISOString(),
        });
        
        // Force save failed status - ensure this completes
        try {
          await this.checkpointService.forceSave(this.indexName);
          LOGGER.log('Final status saved to ES: failed (bulk operation start)');
        } catch (saveError: any) {
          LOGGER.error('Failed to save failed status to ES', saveError?.message || saveError);
        }
        
        LOGGER.error('Bulk operation failed to start properly', bulkOpResponse);
        appendLog(`Bulk operation failed to start: ${JSON.stringify(bulkOpResponse)}`);
        throw new Error('Bulk operation failed');
      }
    } catch (err: any) {
      this.checkpointService.updateCheckpoint({
        status: 'failed',
        error: err?.message || String(err),
        completedAt: new Date().toISOString(),
      });
      
      // Force save failed status - ensure this completes
      try {
        await this.checkpointService.forceSave(this.indexName);
        LOGGER.log('Final status saved to ES: failed');
      } catch (saveError: any) {
        LOGGER.error('Failed to save failed status to ES', saveError?.message || saveError);
      }
      
      LOGGER.error('Indexer run failed', err?.message || err);
      const checkpoint = this.checkpointService.getCheckpoint();
      appendLog(`Indexer failed: ${err?.message || err}. Progress saved at line ${checkpoint.lastProcessedLine}`);
      throw err;
    } finally {
      // Stop system monitoring
      if (this.systemMonitor) {
        this.systemMonitor.stop();
        this.systemMonitor = null;
      }
      
      // Cleanup timers/intervals but don't save checkpoint (final status already saved above)
      await this.checkpointService.cleanup();
    }
  }

  // 1. Start bulk operation
  private async startBulkOperation() {
    LOGGER.log('Starting bulk operation GraphQL request...', { shop: this.shop });
    
    try {
      const response = await this.graphqlRepo.post<{ bulkOperationRunQuery?: any }>(
        this.shop,
        { query: BULK_PRODUCTS_MUTATION }
      );

      LOGGER.log('Bulk operation GraphQL response received', {
        status: response.status,
        hasData: !!response.data,
        hasErrors: !!response.errors,
      });

      if (response.status === 'error') {
        const errorMessage = response.errors?.map(e => e.message).join(', ') || 'Unknown error';
        LOGGER.error('GraphQL error in bulk operation', {
          errors: response.errors,
          shop: this.shop,
        });
        throw new Error(`GraphQL error: ${errorMessage}`);
      }

      if (!response.data) {
        LOGGER.error('No data in bulk operation response', { response });
        throw new Error('Bulk operation response has no data');
      }

      const bulkOp = response.data.bulkOperationRunQuery;
      LOGGER.log('Bulk operation started successfully', {
        id: bulkOp?.bulkOperation?.id,
        status: bulkOp?.bulkOperation?.status,
      });

      return bulkOp;
    } catch (error: any) {
      LOGGER.error('Failed to start bulk operation', {
        error: error?.message || error,
        stack: error?.stack,
        shop: this.shop,
      });
      throw error;
    }
  }

  // 2. Poll for status
  private async pollUntilComplete(id: string) {
    let attempt = 0;
    let lastStatus: string | null = null;
    const MAX_ATTEMPTS = 120; // Maximum 120 attempts (about 10 minutes with exponential backoff)
    const MAX_ERROR_ATTEMPTS = 10; // Maximum consecutive error attempts before giving up

    let consecutiveErrors = 0;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;

      try {
        // Update status periodically during polling to show progress
        if (attempt % 10 === 0) {
          this.checkpointService.updateCheckpoint({
            status: 'in_progress',
          });
          // Save checkpoint every 10 polling attempts
          await this.checkpointService.forceSave(this.indexName);
        }

        const resp = await this.graphqlRepo.post<{ node: any }>(
          this.shop,
          { query: POLL_QUERY, variables: { id } }
        );

        if (resp.status === 'error') {
          const errorMsg = resp.errors?.map(e => e.message).join(', ') || 'Unknown error';
          
          // Check if it's a GraphQL schema error (field doesn't exist)
          if (errorMsg.includes("doesn't exist on type") || errorMsg.includes("not used")) {
            LOGGER.error(`GraphQL schema error - bulkOperation query may be invalid: ${errorMsg}`);
            consecutiveErrors++;
            
            // If we get too many schema errors, this is likely a permanent issue
            if (consecutiveErrors >= MAX_ERROR_ATTEMPTS) {
              throw new Error(`Persistent GraphQL schema error after ${consecutiveErrors} attempts: ${errorMsg}. The bulkOperation field may not be available in this Shopify API version.`);
            }
            
            // Wait longer for schema errors before retrying
            await sleep(5000);
            continue;
          }
          
          throw new Error(`GraphQL error: ${errorMsg}`);
        }

        // Reset error counter on successful response
        consecutiveErrors = 0;

        const op = resp.data?.node;

        LOGGER.log('Polled bulk operation status:', op);

        if (!op) {
          LOGGER.warn("No bulk operation returned yet (node is null), retrying…", { attempt, maxAttempts: MAX_ATTEMPTS, bulkOpId: id });
          await sleep(3000);
          continue;
        }

        // Check if node is actually a BulkOperation (it could be null or a different type)
        if (!op.id || !op.status) {
          LOGGER.warn("Node returned but is not a valid BulkOperation, retrying…", { attempt, maxAttempts: MAX_ATTEMPTS, node: op });
          await sleep(3000);
          continue;
        }

        if (op.status !== lastStatus) {
          LOGGER.log(`Bulk status: ${lastStatus} → ${op.status}`);
          lastStatus = op.status;
        }

        // SUCCESS
        if (op.status === "COMPLETED") {
          LOGGER.log(`Bulk completed. Objects: ${op.objectCount}`);
          return op;
        }

        // FAILURE
        if (op.status === "FAILED") {
          throw new Error(`Bulk failed: ${op.errorCode || "Unknown error"}`);
        }

        // CANCELED
        if (op.status === "CANCELED") {
          throw new Error(`Bulk operation canceled by Shopify.`);
        }

        // CREATED / RUNNING
        const wait = Math.min(30000, 1000 * Math.pow(1.5, attempt));
        LOGGER.log(`Polling again in ${wait}ms`);
        await sleep(wait);
      } catch (err: any) {
        consecutiveErrors++;
        LOGGER.error("Error polling bulk op:", {
          error: err?.message || err,
          attempt,
          consecutiveErrors,
          maxErrorAttempts: MAX_ERROR_ATTEMPTS,
        });
        
        // If we've had too many consecutive errors, give up
        if (consecutiveErrors >= MAX_ERROR_ATTEMPTS) {
          LOGGER.error(`Too many consecutive errors (${consecutiveErrors}), aborting bulk operation poll`, {
            bulkOpId: id,
            lastError: err?.message || err,
          });
          throw new Error(`Failed to poll bulk operation after ${consecutiveErrors} consecutive errors: ${err?.message || err}`);
        }

        // network or 5xx backoff
        const wait = Math.min(30000, 1000 * Math.pow(1.5, attempt));
        LOGGER.log(`Retrying in ${wait}ms`);
        await sleep(wait);
      }
    }

    // Timeout - we've exceeded max attempts
    LOGGER.error(`Bulk operation polling timeout after ${MAX_ATTEMPTS} attempts`, { bulkOpId: id });
    throw new Error(`Bulk operation polling timeout after ${MAX_ATTEMPTS} attempts`);
  }

  // 3. Download file streaming
  private async downloadFile(url: string, destPath: string) {
    const writer = fs.createWriteStream(destPath);
    const resp = await axios.get(url, { responseType: 'stream', timeout: 300000 });

    return new Promise<void>((resolve, reject) => {
      resp.data.pipe(writer);
      let error: any = null;
      writer.on('error', (err) => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) resolve();
      });
    });
  }

  /**
   * Count total lines in file using streaming (memory-efficient)
   * Replaces readFileSync to avoid loading entire file into memory
   */
  private async countTotalLines(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let lineCount = 0;
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: "utf8" }),
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        if (line.trim()) {
          lineCount++;
        }
      });

      rl.on('close', () => {
        resolve(lineCount);
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  // 4 & 5: Stream parse JSONL and bulk index
  private async streamAndIndex(filePath: string) {
    const checkpoint = this.checkpointService.getCheckpoint();
    const startLine = checkpoint.lastProcessedLine;
    
    // Count total lines first if not already set (for progress tracking)
    // Use streaming approach to avoid loading entire file into memory
    let totalLines = checkpoint.totalLines;
    if (!totalLines) {
      try {
        LOGGER.log('Counting total lines in file using streaming (memory-efficient)...');
        totalLines = await this.countTotalLines(filePath);
        this.checkpointService.updateCheckpoint({ 
          totalLines,
          status: 'in_progress', // Ensure status is in_progress
        });
        // Force save immediately after setting totalLines so progress can be calculated
        await this.checkpointService.forceSave(this.indexName);
        LOGGER.log(`Total lines in file: ${totalLines}`);
      } catch (error: any) {
        LOGGER.warn('Failed to count total lines, progress tracking may be limited', error?.message || error);
      }
    }
    
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity
    });

    let lineNum = 0;
    let batch: any[] = [];

    // In-memory structures for accumulating product data
    // These are periodically cleaned up to prevent memory buildup
    const products: Record<string, any> = {};
    const collections: Record<string, any> = {};
    const productCollections: Record<string, Set<string>> = {};
    
    // Track the current product being collected (new JSONL pattern: all data comes before next Product row)
    let currentProductId: string | null = null;
    
    // Track complete products that are ready to flush (we've seen the next Product row)
    const completeProducts: Set<string> = new Set();
    
    // Memory monitoring and cleanup thresholds
    const MEMORY_CHECK_INTERVAL = 50; // Check memory every 50 batches
    const MAX_PRODUCTS_IN_MEMORY = 1000; // Flush if we have more than 1000 products in memory
    let batchCount = 0;

    /**
     * Check memory usage using system monitor
     */
    const checkMemoryUsage = () => {
      if (this.systemMonitor) {
        const usage = this.systemMonitor.usage;
        // SystemMonitor already emits 'high' events, but we can log periodic status
        if (batchCount % (MEMORY_CHECK_INTERVAL * 2) === 0) {
          LOGGER.log(`Memory status: ${usage.memoryPercent.toFixed(1)}% (${usage.memoryUsed} / ${usage.memoryTotal})`);
        }
      }
    };

    /**
     * Force flush products if memory structures are getting too large
     * Only flush complete products (not the current one being collected)
     */
    const flushIfNeeded = async () => {
      const productsInMemory = Object.keys(products).length;
      if (productsInMemory > MAX_PRODUCTS_IN_MEMORY) {
        LOGGER.log(`Memory threshold reached (${productsInMemory} products in memory), flushing complete products...`);
        
        // Get complete products (excluding current product being collected)
        const toFlush = Array.from(completeProducts).filter(pid => pid !== currentProductId);
        
        if (toFlush.length === 0) {
          LOGGER.warn(`⚠️ Memory threshold reached but no complete products to flush. Current product: ${currentProductId}`);
          return;
        }
        
        // Flush complete products (up to half)
        const flushCount = Math.min(Math.floor(productsInMemory / 2), toFlush.length);
        for (let i = 0; i < flushCount; i++) {
          await flushProduct(toFlush[i]);
          completeProducts.delete(toFlush[i]);
        }
        
        LOGGER.log(`Flushed ${flushCount} complete products, ${Object.keys(products).length} remaining in memory`);
      }
    };

    // ------------------------- FLUSH LOGIC -------------------------
    const flushProduct = async (productId: string) => {
      const data = products[productId];
      if (!data) return;

      // Always set collections array - check both GID and normalized formats
      const normalizedProductId = normalizeShopifyId(productId);
      
      // Try multiple key formats to find collections
      // IMPORTANT: productCollections uses GID format as keys (from __parentId)
      let collectionsSet = 
        productCollections[productId] || 
        productCollections[normalizedProductId] ||
        (data.id ? productCollections[data.id] : null) ||
        (data.id ? productCollections[normalizeShopifyId(data.id)] : null) ||
        null;
      
      // Debug: Log collection lookup for first few products
      const collectionLookupCount = ((this as any)._collectionLookupCount || 0) + 1;
      (this as any)._collectionLookupCount = collectionLookupCount;
      if (collectionLookupCount <= 10) {
        const availableKeys = Object.keys(productCollections);
        const matchingKeys = availableKeys.filter(k => {
          const normalizedK = normalizeShopifyId(k);
          return k === productId || k === normalizedProductId || 
                 normalizedK === normalizedProductId || normalizedK === normalizeShopifyId(productId) ||
                 k === data.id || normalizedK === normalizeShopifyId(data.id);
        });
        LOGGER.log(`🔍 Collection lookup for product ${productId}:`, {
          productId,
          normalizedProductId,
          dataId: data.id,
          foundCollections: collectionsSet ? collectionsSet.size : 0,
          availableKeysCount: availableKeys.length,
          matchingKeys: matchingKeys.slice(0, 5),
          matchingKeysCollections: matchingKeys.slice(0, 3).map(k => ({
            key: k,
            count: productCollections[k]?.size || 0
          }))
        });
      }
      
      // Also check if product already has collections from Product row
      const productRowCollections = Array.isArray(data.collections) ? data.collections : [];
      
      if (collectionsSet && collectionsSet.size > 0) {
        // Merge collections from productCollections map with collections from Product row
        const mapCollections = Array.from(collectionsSet);
        const allCollections = [...new Set([...productRowCollections, ...mapCollections])];
        data.collections = allCollections;
        
        const debugCount = ((this as any)._collectionDebugCount || 0) + 1;
        (this as any)._collectionDebugCount = debugCount;
        if (debugCount <= 5) {
          LOGGER.log(`✅ Product ${productId} has ${data.collections.length} collections (${mapCollections.length} from map, ${productRowCollections.length} from row):`, {
            collections: data.collections,
            productId,
            normalizedProductId,
          });
        }
      } else if (productRowCollections.length > 0) {
        // Use collections from Product row if available
        data.collections = productRowCollections;
      } else {
        data.collections = [];
        // Log warning if product has no collections (only for first few to avoid spam)
        const noCollectionCount = ((this as any)._noCollectionCount || 0) + 1;
        (this as any)._noCollectionCount = noCollectionCount;
        if (noCollectionCount <= 10) {
          // Debug: Log available keys to help diagnose
          const availableKeys = Object.keys(productCollections);
          const matchingKeys = availableKeys.filter(k => {
            const normalizedK = normalizeShopifyId(k);
            return k === productId || k === normalizedProductId || 
                   normalizedK === normalizedProductId || normalizedK === normalizeShopifyId(productId);
          });
          
          LOGGER.warn(`⚠️ Product ${productId} (normalized: ${normalizedProductId}) has NO collections.`, {
            productId,
            normalizedProductId,
            totalProductCollections: availableKeys.length,
            matchingKeys: matchingKeys.slice(0, 5),
            hasProductRowCollections: productRowCollections.length > 0,
          });
        }
      }
      
      // Inject best seller rank if available
      if (this.productRanks.size > 0 && productId) {
        // Try multiple ID formats to match rank
        const normalizedId = normalizeShopifyId(productId);
        const dataId = data.id || productId;
        const normalizedDataId = dataId ? normalizeShopifyId(dataId) : null;
        
        // Try all possible ID variations
        const rank = 
          this.productRanks.get(normalizedId) || 
          this.productRanks.get(productId) ||
          this.productRanks.get(dataId) ||
          (normalizedDataId ? this.productRanks.get(normalizedDataId) : null);
        
        if (rank && typeof rank === 'number') {
          // Ensure rank is an integer
          data.bestSellerRank = Math.floor(rank);
        } else if (this.productRanks.size > 0) {
          // Only log first few misses to avoid spam
          const missCount = (this as any)._rankMissCount || 0;
          (this as any)._rankMissCount = missCount + 1;
          if (missCount < 5) {
            LOGGER.warn(`⚠️ No rank found for product ${productId}`, {
              tried: [normalizedId, productId, dataId, normalizedDataId],
              availableRanks: this.productRanks.size,
              sampleRankKeys: Array.from(this.productRanks.keys()).slice(0, 3),
            });
          }
        }
      }
      
      // Debug: log images before transformation
      if (data.images && data.images.length > 0) {
        const imageDebugCount = ((this as any)._imageDebugCount || 0) + 1;
        (this as any)._imageDebugCount = imageDebugCount;
        if (imageDebugCount <= 3) {
          LOGGER.log(`🖼️ Product ${productId} has ${data.images.length} images before transform:`, {
            firstImageKeys: Object.keys(data.images[0] || {}),
            hasPreview: !!data.images[0]?.preview?.image?.url
          });
        }
      } else {
        const noImageCount = ((this as any)._noImageCount || 0) + 1;
        (this as any)._noImageCount = noImageCount;
        if (noImageCount <= 3) {
          LOGGER.warn(`⚠️ Product ${productId} has NO images when flushing`);
        }
      }
      
      const doc = transformProductToESDoc(data);

      // Track this product ID for cleanup later
      if (doc.id) {
        this.indexedProductIds.add(doc.id);
        // Also track normalized ID
        const normalizedDocId = normalizeShopifyId(doc.id);
        if (normalizedDocId !== doc.id) {
          this.indexedProductIds.add(normalizedDocId);
        }
      }

      batch.push(doc);

      // Mark product as flushed
      completeProducts.delete(productId);
      delete products[productId];

      if (batch.length >= this.batchSize) {
        const indexed = await this.indexBatch(batch, lineNum);
        const currentCheckpoint = this.checkpointService.getCheckpoint();
        const newTotalIndexed = (currentCheckpoint.totalIndexed || 0) + indexed;
        this.checkpointService.updateCheckpoint({
          lastProcessedLine: lineNum,
          totalIndexed: newTotalIndexed,
          // Don't set status here - let it remain whatever it was (should be in_progress from start)
          // Setting it repeatedly could interfere with final status save
        });
        // Force save checkpoint periodically (every 5 batches) to ensure progress is visible
        batchCount++;
        if (batchCount % 5 === 0) {
          // Use saveCheckpointImmediate instead of forceSave to avoid stopping the interval
          // We only want to stop the interval when setting final status
          await this.checkpointService.saveCheckpointImmediate(this.indexName);
          const currentProgress = currentCheckpoint.totalLines 
            ? Math.min(100, Math.round((lineNum / currentCheckpoint.totalLines) * 100))
            : 0;
          LOGGER.log(`Progress checkpoint saved: line ${lineNum}/${currentCheckpoint.totalLines || '?'}, indexed ${newTotalIndexed}, progress ${currentProgress}%`);
          
          // Check memory usage periodically
          if (batchCount % MEMORY_CHECK_INTERVAL === 0) {
            checkMemoryUsage();
            await flushIfNeeded();
          }
        }
        batch = [];
      }
      // DON'T delete from productCollections - CollectionProduct rows might come AFTER products are flushed
      // We'll use productCollections at the end to update products that got collections after being flushed
      // delete productCollections[productId];
    };
    // ----------------------------------------------------------------

    for await (const line of rl) {
      lineNum++;

      // Skip already processed lines (resume from checkpoint)
      if (lineNum <= startLine) {
        continue;
      }

      if (!line.trim()) continue;

      let row: any;
      try {
        row = JSON.parse(line);
      } catch (err) {
        LOGGER.error("JSON parse error line", lineNum, err);
        appendLog(`parse-error line ${lineNum}`);
        continue;
      }

      const type = detectType(row);
      if (!type) {
        // Ignore unknown rows
        continue;
      }

      /* ======================================================
       *                      PRODUCT ROOT
       * ====================================================== */
      if (type === "Product") {
        const pid = row.id;

        // NEW JSONL PATTERN: When we see a new Product row, the previous product is complete
        // Flush the previous product (if any) because all its data has been collected
        if (currentProductId && products[currentProductId]) {
          // Previous product is complete - flush it
          await flushProduct(currentProductId);
          completeProducts.delete(currentProductId);
        }

        // Handle duplicate product (shouldn't happen in new format, but handle it)
        if (products[pid]) {
          LOGGER.warn(`⚠️ Duplicate Product row for ${pid} at line ${lineNum} - flushing existing product`);
          await flushProduct(pid);
          completeProducts.delete(pid);
        }

        // Check if we need to flush products due to memory pressure
        if (Object.keys(products).length > MAX_PRODUCTS_IN_MEMORY) {
          await flushIfNeeded();
        }

        // Start collecting data for the new product
        currentProductId = pid;

        // Preserve options and collections from Product row if they exist (JSONL format may include them)
        // Initialize arrays for child rows that will be collected separately
        let rowCollections: string[] = [];
        
        // Handle collections from Product row (if Shopify includes them)
        if (row.collections) {
          if (Array.isArray(row.collections)) {
            // Direct array format
            rowCollections = row.collections.map((c: any) => normalizeShopifyId(c?.id || c)).filter((id: any) => id && typeof id === 'string');
          } else if (row.collections.edges && Array.isArray(row.collections.edges)) {
            // GraphQL edges format: collections.edges[].node.id
            rowCollections = row.collections.edges
              .map((edge: any) => edge?.node?.id || edge?.node)
              .filter(Boolean)
              .map((id: any) => normalizeShopifyId(id))
              .filter((id: any) => id && typeof id === 'string');
          } else if (row.collections.nodes && Array.isArray(row.collections.nodes)) {
            // GraphQL nodes format: collections.nodes[].id
            rowCollections = row.collections.nodes
              .map((node: any) => node?.id || node)
              .filter(Boolean)
              .map((id: any) => normalizeShopifyId(id))
              .filter((id: any) => id && typeof id === 'string');
          }
        }
        
        products[pid] = {
          ...row,
          options: Array.isArray(row.options) ? row.options : [], // Keep options from Product row
          images: [],
          variants: [],
          collections: rowCollections // Preserve collections from Product row if present
        };
        
        // Initialize productCollections map with collections from Product row
        if (!productCollections[pid]) {
          productCollections[pid] = new Set();
        }
        // Add collections from Product row to existing Set (if any)
        if (rowCollections.length > 0) {
          rowCollections.forEach((cId: string) => productCollections[pid].add(cId));
        }

        continue;
      }

      /* ------------------ ProductOption ------------------ */
      if (type === "ProductOption") {
        const parentId = row.__parentId;
        const parent = products[parentId];
        if (parent) {
          parent.options.push(row);
        } else {
          LOGGER.warn(`⚠️ ProductOption row at line ${lineNum} - parent product ${parentId} not found in memory`);
        }
        continue;
      }

      /* ------------------ MediaImage ------------------ */
      if (type === "MediaImage") {
        const parentId = row.__parentId;
        const parent = products[parentId];
        if (parent) {
          // Always push MediaImage row - it has full data structure
          // The row contains: id, alt, preview.image.url, status, __parentId
          parent.images.push(row);
          
          // Debug logging for first few MediaImage rows
          const mediaImageCount = ((this as any)._mediaImageCount || 0) + 1;
          (this as any)._mediaImageCount = mediaImageCount;
          if (mediaImageCount <= 5) {
            LOGGER.log(`📷 MediaImage: productId=${parentId}, hasPreview=${!!row.preview?.image?.url}, hasUrl=${!!row.url}`);
          }
        } else {
          // MediaImage row for product not in memory - this shouldn't happen in new format
          // But handle it for safety (might be orphaned from previous run)
          LOGGER.warn(`⚠️ MediaImage row at line ${lineNum} - parent product ${parentId} not found in memory`);
          
          // Store for post-processing
          if (!(this as any)._orphanedImages) {
            (this as any)._orphanedImages = new Map();
          }
          const orphanedImages = (this as any)._orphanedImages;
          const key = parentId || normalizeShopifyId(parentId);
          if (!orphanedImages.has(key)) {
            orphanedImages.set(key, []);
          }
          orphanedImages.get(key).push(row);
        }
        continue;
      }

      /* ------------------ ProductVariant ------------------ */
      if (type === "ProductVariant") {
        const parentId = row.__parentId;
        const parent = products[parentId];
        if (parent) {
          parent.variants.push(row);
        } else {
          // Variant row for product not in memory - this shouldn't happen in new format
          LOGGER.warn(`⚠️ ProductVariant row at line ${lineNum} - parent product ${parentId} not found in memory`);
          
          // Store for post-processing
          if (!(this as any)._orphanedVariants) {
            (this as any)._orphanedVariants = new Map();
          }
          const orphanedVariants = (this as any)._orphanedVariants;
          const key = parentId || normalizeShopifyId(parentId);
          if (!orphanedVariants.has(key)) {
            orphanedVariants.set(key, []);
          }
          orphanedVariants.get(key).push(row);
        }
        continue;
      }

      /* ------------------ Collection (CollectionProduct relationship) ------------------ */
      // In new JSONL format: Collection rows with __parentId point to products
      // This represents a product-to-collection relationship
      if (type === "Collection") {
        // Check if this is a CollectionProduct relationship (has __parentId pointing to a Product)
        const parentId = row.__parentId;
        if (parentId && extractShopifyResourceType(parentId) === "Product") {
          // This is a product-to-collection relationship
          const productId = parentId;
          const collectionId = normalizeShopifyId(row.id);
          
          if (collectionId && productId) {
            // Add collection to product's collections set
            if (!productCollections[productId]) {
              productCollections[productId] = new Set();
            }
            productCollections[productId].add(collectionId);
            
            // Also add to normalized key if different
            const normalizedProductId = normalizeShopifyId(productId);
            if (normalizedProductId && normalizedProductId !== productId) {
              if (!productCollections[normalizedProductId]) {
                productCollections[normalizedProductId] = new Set();
              }
              productCollections[normalizedProductId].add(collectionId);
            }
            
            // Debug logging for first few collection relationships
            const collectionCount = ((this as any)._collectionCount || 0) + 1;
            (this as any)._collectionCount = collectionCount;
            if (collectionCount <= 20) {
              LOGGER.log(`📦 Collection relationship: productId=${productId}, collectionId=${collectionId}, productExists=${!!products[productId]}, totalCollectionsForProduct=${productCollections[productId]?.size || 0}`);
            }
          }
        } else {
          // This is a Collection root row (not a relationship)
          collections[row.id] = {
            ...row,
            products: []
          };
        }
        continue;
      }

      /* ------------------ Collection Image ------------------ */
      if (type === "CollectionImage") {
        const parent = collections[row.__parentId];
        if (parent) parent.image = row;
        continue;
      }
      
    }

    /* ===========================================================
     *        Flush any remaining unprocessed products
     * =========================================================== */
    // Flush the current product being collected (end of file - all data collected)
    if (currentProductId && products[currentProductId]) {
      LOGGER.log(`Flushing final product ${currentProductId} at end of file`);
      await flushProduct(currentProductId);
    }
    
    // Flush any other remaining products (shouldn't happen in new format, but handle it)
    const remainingProducts = Object.keys(products);
    if (remainingProducts.length > 0) {
      LOGGER.log(`Flushing ${remainingProducts.length} remaining products at end of file`);
      for (const pid of remainingProducts) {
        await flushProduct(pid);
      }
    }

    /* ===========================================================
     *        Post-processing: Update products with data that arrived after flush
     * =========================================================== */
    // This handles:
    // 1. Collections that arrived after products were flushed
    // 2. Variants that arrived after products were flushed
    // 3. Images that arrived after products were flushed
    
    const orphanedImages = (this as any)._orphanedImages || new Map();
    const orphanedVariants = (this as any)._orphanedVariants || new Map();
    
    // Find all products that need updates
    const productsToUpdate = new Set<string>();
    
    // Products with collections that arrived after flush
    Object.keys(productCollections).forEach(pid => {
      const collections = productCollections[pid];
      if (collections && collections.size > 0 && !products[pid]) {
        productsToUpdate.add(pid);
      }
    });
    
    // Products with orphaned variants
    orphanedVariants.forEach((variants: any[], productId: string) => {
      if (variants.length > 0) {
        productsToUpdate.add(productId);
      }
    });
    
    // Products with orphaned images
    orphanedImages.forEach((images: any[], productId: string) => {
      if (images.length > 0) {
        productsToUpdate.add(productId);
      }
    });

    if (productsToUpdate.size > 0) {
      LOGGER.log(`Post-processing: Updating ${productsToUpdate.size} products with data that arrived after flush`);
      const updateBatch: any[] = [];
      let updateCount = 0;
      
      for (const productId of productsToUpdate) {
        const normalizedProductId = normalizeShopifyId(productId);
        const updateDoc: any = {};
        let needsUpdate = false;
        
        // Check for collections
        const collections = productCollections[productId] || productCollections[normalizedProductId];
        if (collections && collections.size > 0) {
          updateDoc.collections = Array.from(collections);
          needsUpdate = true;
        }
        
        // Check for orphaned variants
        const variants = orphanedVariants.get(productId) || orphanedVariants.get(normalizedProductId);
        if (variants && variants.length > 0) {
          // For variants, we need to fetch the current product, merge variants, and update
          // This is more complex, so we'll log it and handle it separately if needed
          LOGGER.warn(`⚠️ Product ${productId} has ${variants.length} orphaned variants - variants update requires full document reindex`);
          // Note: Variants update would require fetching current doc, merging, and reindexing
          // For now, we'll focus on collections and images which are simpler to update
        }
        
        // Check for orphaned images
        const images = orphanedImages.get(productId) || orphanedImages.get(normalizedProductId);
        if (images && images.length > 0) {
          // Extract image URLs from orphaned images
          const imageUrls = images
            .map((img: any) => img.preview?.image?.url || img.url || img.image?.url)
            .filter((url: any) => url);
          
          if (imageUrls.length > 0) {
            // Update imagesUrls field
            updateDoc.imagesUrls = imageUrls;
            updateDoc.imageUrl = imageUrls[0] || null;
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          // Try multiple ID formats for ES document _id
          // ES documents might use normalized ID or GID format
          const possibleIds = [
            normalizedProductId,
            productId,
            normalizeShopifyId(productId),
          ].filter((id, index, arr) => id && arr.indexOf(id) === index); // Remove duplicates
          
          // Try each possible ID format
          for (const esId of possibleIds) {
            updateBatch.push({
              update: {
                _index: this.indexName,
                _id: esId,
              }
            });
            updateBatch.push({
              doc: updateDoc,
              doc_as_upsert: false, // Don't create if doesn't exist
            });
            updateCount++;
            break; // Only try first ID format per product to avoid duplicates
          }
        }
      }

      if (updateBatch.length > 0) {
        try {
          LOGGER.log(`Executing bulk update for ${updateCount} products`);
          const response = await this.esClient.bulk({ 
            refresh: false,
            operations: updateBatch 
          });
          
          if (response.errors) {
            const errors = response.items.filter((item: any) => item.update?.error);
            const successful = response.items.length - errors.length;
            LOGGER.warn(`Post-processing update: ${successful} succeeded, ${errors.length} failed`);
            
            // Log first few errors for debugging
            if (errors.length > 0) {
              const sampleErrors = errors.slice(0, 5);
              sampleErrors.forEach((errorItem: any) => {
                const error = errorItem.update?.error;
                if (error) {
                  LOGGER.warn(`Update error: ${error.reason || JSON.stringify(error)}`);
                }
              });
            }
          } else {
            LOGGER.log(`✅ Successfully updated ${updateCount} products with post-processing data`);
          }
          
          // Validation: Check if updates were successful
          if (response.items) {
            const failedUpdates = response.items.filter((item: any) => item.update?.error);
            const successfulUpdates = response.items.filter((item: any) => 
              item.update?.result === 'updated' || item.update?.result === 'noop'
            );
            
            LOGGER.log(`Post-processing validation: ${successfulUpdates.length} succeeded, ${failedUpdates.length} failed`);
            
            if (failedUpdates.length > 0) {
              // Log summary of failures
              const notFound = failedUpdates.filter((item: any) => 
                item.update?.error?.type === 'document_missing_exception' ||
                item.update?.error?.type === 'index_not_found_exception'
              );
              const otherErrors = failedUpdates.length - notFound.length;
              
              LOGGER.warn(`Post-processing failures: ${notFound.length} products not found in ES, ${otherErrors} other errors`);
              
              // This is expected for some products (they may have been deleted or never indexed)
              if (notFound.length < failedUpdates.length) {
                // Some real errors occurred
                const sampleErrors = failedUpdates
                  .filter((item: any) => !notFound.includes(item))
                  .slice(0, 3);
                sampleErrors.forEach((errorItem: any) => {
                  const error = errorItem.update?.error;
                  if (error) {
                    LOGGER.warn(`Post-processing error sample: ${error.reason || JSON.stringify(error)}`);
                  }
                });
              }
            }
          }
        } catch (err: any) {
          LOGGER.error('Error in post-processing update', {
            error: err?.message || err,
            stack: err?.stack,
          });
        }
      } else {
        LOGGER.log('No products needed post-processing updates');
      }
    } else {
      LOGGER.log('No products needed post-processing updates');
    }
    
    // Final validation summary
    const totalOrphanedImages = Array.from(orphanedImages.values()).reduce((sum: number, arr: any[]) => sum + arr.length, 0);
    const totalOrphanedVariants = Array.from(orphanedVariants.values()).reduce((sum: number, arr: any[]) => sum + arr.length, 0);
    const totalProductsWithCollections = Object.keys(productCollections).filter(pid => {
      const collections = productCollections[pid];
      return collections && collections.size > 0;
    }).length;
    
    LOGGER.log(`Post-processing summary:`, {
      productsWithCollections: totalProductsWithCollections,
      orphanedImages: totalOrphanedImages,
      orphanedVariants: totalOrphanedVariants,
      productsUpdated: productsToUpdate.size,
    });

    /* ------------------ Final batch flush ------------------ */
    if (batch.length) {
      const indexed = await this.indexBatch(batch, lineNum);
      const currentCheckpoint = this.checkpointService.getCheckpoint();
      this.checkpointService.updateCheckpoint({
        lastProcessedLine: lineNum,
        totalIndexed: (currentCheckpoint.totalIndexed || 0) + indexed,
        // Status should already be in_progress from initialization
      });
      // Save final batch progress (use saveCheckpointImmediate to avoid stopping interval)
      await this.checkpointService.saveCheckpointImmediate(this.indexName);
    }

    // Retry failed items from previous runs
    const finalCheckpoint = this.checkpointService.getCheckpoint();
    if (finalCheckpoint.failedItems && finalCheckpoint.failedItems.length > 0) {
      LOGGER.log(`Retrying ${finalCheckpoint.failedItems.length} failed items from previous run`);
      await this.retryFailedItems();
    }

    LOGGER.info("Bulk import finished.");
  }

  private async indexBatch(docs: any[], currentLine: number): Promise<number> {
    LOGGER.log(`Indexing batch of ${docs.length} documents`);
    appendLog(`Indexing batch ${docs.length}`);

    // Filter documents to only include mapped fields (prevents field limit errors)
    const body: any[] = [];
    for (const d of docs) {
      let filteredDoc = d;
      
      // First, use product field filter to remove extra fields
      filteredDoc = filterProductFields(filteredDoc);
      
      // Then, if mapping is provided, filter to only mapped fields
      if (this.esMapping) {
        filteredDoc = filterMappedFields(filteredDoc, this.esMapping);
      }
      
      body.push({ index: { _index: this.indexName, _id: filteredDoc.id || d.id } });
      body.push(filteredDoc);
    }

    let indexedCount = 0;
    const failedItems: Array<{ id: string; line: number; error?: string; retryCount?: number }> = [];

    try {
      const resp = await this.esClient.bulk({ refresh: false, operations: body });
      if (resp.errors) {
        // Collect failed items
        for (let i = 0; i < resp.items.length; i++) {
          const action = resp.items[i];
          const op = action.index || action.create || action.update || action.delete;
          if (op && op.error) {
            const failedDoc = docs[i];
            failedItems.push({
              id: failedDoc.id,
              line: currentLine - docs.length + i + 1,
              error: op.error.reason || String(op.error),
              retryCount: 0,
            });
          } else {
            indexedCount++;
          }
        }

        LOGGER.warn(`Bulk had ${failedItems.length} failures out of ${docs.length} items`);
        appendLog(`Bulk failures: ${failedItems.length}/${docs.length}`);

        // Retry failed items with exponential backoff
        for (const failedItem of failedItems) {
          const retried = await this.retryIndexItem(failedItem.id, docs.find(d => d.id === failedItem.id), failedItem);
          if (retried) {
            indexedCount++;
            // Remove from failed items
            const index = failedItems.findIndex(f => f.id === failedItem.id);
            if (index > -1) failedItems.splice(index, 1);
          }
        }
      } else {
        indexedCount = docs.length;
        LOGGER.log('Bulk indexed successfully');
      }
    } catch (err: any) {
      LOGGER.error('Error during bulk index call', err?.message || err);
      // Fallback: index individually with retries
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const failedItem = {
          id: doc.id,
          line: currentLine - docs.length + i + 1,
          error: err?.message || String(err),
          retryCount: 0,
        };
        const retried = await this.retryIndexItem(doc.id, doc, failedItem);
        if (retried) {
          indexedCount++;
        } else {
          failedItems.push(failedItem);
        }
      }
    }

    // Update checkpoint with failed items
    if (failedItems.length > 0) {
      const currentCheckpoint = this.checkpointService.getCheckpoint();
      this.checkpointService.updateCheckpoint({
        failedItems: [...(currentCheckpoint.failedItems || []), ...failedItems],
        totalFailed: (currentCheckpoint.totalFailed || 0) + failedItems.length,
      });
    }

    return indexedCount;
  }

  /**
   * Retry indexing a single item with exponential backoff
   */
  private async retryIndexItem(
    id: string,
    doc: any,
    failedItem: { id: string; line: number; error?: string; retryCount?: number }
  ): Promise<boolean> {
    if (!doc) {
      LOGGER.warn(`Document not found for retry: ${id}`);
      return false;
    }

    let retry = failedItem.retryCount || 0;
    const maxRetries = this.maxRetries;

    while (retry < maxRetries) {
      try {
        // First, use product field filter to remove extra fields
        let filteredDoc = filterProductFields(doc);
        
        // Then, if mapping is provided, filter to only mapped fields
        if (this.esMapping) {
          filteredDoc = filterMappedFields(filteredDoc, this.esMapping);
        }

        await this.esClient.index({ index: this.indexName, id, document: filteredDoc });
        LOGGER.debug(`Successfully indexed after ${retry + 1} retries: ${id}`);
        return true;
      } catch (err: any) {
        retry++;
        failedItem.retryCount = retry;
        failedItem.error = err?.message || String(err);

        if (retry < maxRetries) {
          const delay = this.retryDelay * Math.pow(2, retry - 1); // Exponential backoff
          LOGGER.warn(`Retry ${retry}/${maxRetries} for ${id}, waiting ${delay}ms`);
          await sleep(delay);
        } else {
          LOGGER.error(`Failed to index after ${maxRetries} retries: ${id}`, err?.message || err);
        }
      }
    }

    return false;
  }

  /**
   * Retry all failed items from checkpoint
   */
  private async retryFailedItems(): Promise<void> {
    const checkpoint = this.checkpointService.getCheckpoint();
    if (!checkpoint.failedItems || checkpoint.failedItems.length === 0) {
      return;
    }

    const failedItems = [...checkpoint.failedItems];
    const retriedItems: string[] = [];

    LOGGER.log(`Retrying ${failedItems.length} failed items`);

    // Note: We need to re-read the JSONL file to get the actual documents
    // For now, we'll just log that retry is needed
    // In a full implementation, you'd want to store the documents or re-parse
    
    for (const failedItem of failedItems) {
      if (failedItem.retryCount && failedItem.retryCount >= this.maxRetries) {
        LOGGER.warn(`Skipping ${failedItem.id} - exceeded max retries`);
        continue;
      }

      // In a real implementation, you'd need to re-read the document from the JSONL file
      // For now, we'll mark it for manual retry or skip
      LOGGER.warn(`Failed item ${failedItem.id} at line ${failedItem.line} needs manual retry`);
    }

    // Clear successfully retried items
    this.checkpointService.updateCheckpoint({
      failedItems: failedItems.filter(f => !retriedItems.includes(f.id)),
    });
  }

  /**
   * Cleanup deleted products from Elasticsearch
   * Deletes products that exist in ES but were not indexed in this run
   */
  private async cleanupDeletedProducts(): Promise<number> {
    if (this.indexedProductIds.size === 0) {
      LOGGER.warn('No products indexed in this run, skipping cleanup');
      return 0;
    }

    try {
      LOGGER.log(`Checking for deleted products. Indexed ${this.indexedProductIds.size} products in this run`);

      // Get all document IDs from Elasticsearch (using scroll API for large datasets)
      const allEsDocIds: Array<{ _id: string; sourceId?: string }> = [];
      const batchSize = 1000;

      // Use scroll API instead of search_after (can't sort by _id)
      const initialResponse = await this.esClient.search({
        index: this.indexName,
        scroll: '1m',
        _source: ['id', 'productId'],
        query: {
          match_all: {},
        },
        size: batchSize,
        // Don't sort - scroll API doesn't require sorting and avoids fielddata issues
      });

      let scrollId = initialResponse._scroll_id;
      let hits = initialResponse.hits.hits;

      // Process initial batch
      for (const hit of hits) {
        const source = hit._source as any;
        allEsDocIds.push({
          _id: hit._id,
          sourceId: source?.id || source?.productId,
        });
      }

      // Continue scrolling
      while (hits.length > 0) {
        const scrollResponse = await this.esClient.scroll({
          scroll_id: scrollId!,
          scroll: '1m',
        });

        hits = scrollResponse.hits.hits;
        scrollId = scrollResponse._scroll_id;

        for (const hit of hits) {
          const source = hit._source as any;
          allEsDocIds.push({
            _id: hit._id,
            sourceId: source?.id || source?.productId,
          });
        }
      }

      // Clear scroll context
      if (scrollId) {
        try {
          await this.esClient.clearScroll({ scroll_id: scrollId });
        } catch (err) {
          // Ignore clear scroll errors
        }
      }

      LOGGER.log(`Found ${allEsDocIds.length} products in Elasticsearch`);

      // Find products in ES that are NOT in the indexed set
      const productsToDelete: string[] = [];
      for (const esDoc of allEsDocIds) {
        // Check if this product was indexed in current run
        // Try multiple ID formats: _id, source.id, normalized versions
        const docId = esDoc._id;
        const sourceId = esDoc.sourceId;
        const normalizedDocId = normalizeShopifyId(docId);
        const normalizedSourceId = sourceId ? normalizeShopifyId(sourceId) : null;

        // Check if any of these IDs exist in indexed set
        const wasIndexed =
          this.indexedProductIds.has(docId) ||
          this.indexedProductIds.has(normalizedDocId) ||
          (sourceId && this.indexedProductIds.has(sourceId)) ||
          (normalizedSourceId && this.indexedProductIds.has(normalizedSourceId));

        if (!wasIndexed) {
          // Use _id for deletion (most reliable)
          productsToDelete.push(docId);
        }
      }

      if (productsToDelete.length === 0) {
        LOGGER.log('No deleted products found - all ES products exist in Shopify');
        return 0;
      }

      LOGGER.log(`Found ${productsToDelete.length} products to delete from Elasticsearch`);

      // Delete products in batches
      let deletedCount = 0;
      const deleteBatchSize = 500;

      for (let i = 0; i < productsToDelete.length; i += deleteBatchSize) {
        const batch = productsToDelete.slice(i, i + deleteBatchSize);
        const deleteBody: any[] = [];

        for (const docId of batch) {
          // Delete by document _id
          deleteBody.push({ delete: { _index: this.indexName, _id: docId } });
        }

        try {
          const deleteResponse = await this.esClient.bulk({
            refresh: false,
            operations: deleteBody,
          });

          if (deleteResponse.items) {
            for (const item of deleteResponse.items) {
              const deleteOp = item.delete;
              if (deleteOp && (deleteOp.result === 'deleted' || deleteOp.status === 404)) {
                deletedCount++;
              }
            }
          }

          LOGGER.log(`Deleted batch: ${deletedCount}/${productsToDelete.length} products`);
        } catch (error: any) {
          LOGGER.error('Error deleting batch of products', {
            error: error?.message || error,
            batchStart: i,
            batchSize: batch.length,
          });
        }
      }

      // Refresh index to make deletions visible
      await this.esClient.indices.refresh({ index: this.indexName });

      LOGGER.log(`Successfully deleted ${deletedCount} products from Elasticsearch`);
      return deletedCount;
    } catch (error: any) {
      LOGGER.error('Failed to cleanup deleted products', {
        error: error?.message || error,
        stack: error?.stack,
      });
      return 0;
    }
  }
}

