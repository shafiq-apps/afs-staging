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
import { normalizeShopifyId } from '@shared/utils/shopify-id.util';
import { BULK_PRODUCTS_MUTATION, POLL_QUERY } from './indexing.graphql';
import { ShopifyGraphQLRepository } from './indexing.graphql.repository';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { IndexerOptions, CheckpointData } from './indexing.type';
import { IndexerCheckpointService } from './indexing.checkpoint.service';
import { filterMappedFields } from '@core/elasticsearch/es.document.filter';
import { filterProductFields } from '@modules/products/products.field.filter';
import { ensureProductIndex } from '@modules/products/products.index.util';
import { BestSellerCollectionService } from './indexing.best-seller-collection.service';
import { PRODUCT_INDEX_NAME } from '@shared/constants/products.constants';

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
          
          // Create default filter if no filters exist (only on successful completion)
          if (finalCheckpoint.status === 'success') {
            try {
              const { FiltersRepository } = await import('@modules/filters/filters.repository');
              const filtersRepo = new FiltersRepository(this.esClient);
              const existingFilters = await filtersRepo.listFilters(this.shop);
              
              if (existingFilters.total === 0) {
                LOGGER.log(`No filters found for shop ${this.shop}, creating default filter`);
                
                const defaultFilter = {
                  title: 'Default Filter',
                  description: 'Default filter created automatically after product indexing',
                  targetScope: 'all',
                  status: 'published',
                  options: [],
                  settings: {
                    defaultView: 'grid',
                    showFilterCount: true,
                    showActiveFilters: true,
                    showProductCount: true,
                    showSortOptions: true,
                  },
                };
                
                await filtersRepo.createFilter(this.shop, defaultFilter);
                LOGGER.log(`Default filter created successfully for shop ${this.shop}`);
              } else {
                LOGGER.log(`Filters already exist for shop ${this.shop} (${existingFilters.total}), skipping default filter creation`);
              }
            } catch (filterError: any) {
              LOGGER.warn(`Failed to create default filter for shop ${this.shop}`, {
                error: filterError?.message || filterError,
              });
              // Don't fail the indexing process if filter creation fails
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

  // 4 & 5: Stream parse JSONL and bulk index
  private async streamAndIndex(filePath: string) {
    const checkpoint = this.checkpointService.getCheckpoint();
    const startLine = checkpoint.lastProcessedLine;
    
    // Count total lines first if not already set (for progress tracking)
    let totalLines = checkpoint.totalLines;
    if (!totalLines) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        totalLines = fileContent.split('\n').filter(line => line.trim()).length;
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

      // TEMP in-memory structures
    const products: Record<string, any> = {};
    const collections: Record<string, any> = {};
    const productCollections: Record<string, Set<string>> = {};

    // ------------------------- FLUSH LOGIC -------------------------
    const flushProduct = async (productId: string) => {
      const data = products[productId];
      if (!data) return;

      if (productCollections[productId]) {
        data.collections = Array.from(productCollections[productId]);
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
        const batchCount = Math.floor(lineNum / this.batchSize);
        if (batchCount % 5 === 0) {
          // Use saveCheckpointImmediate instead of forceSave to avoid stopping the interval
          // We only want to stop the interval when setting final status
          await this.checkpointService.saveCheckpointImmediate(this.indexName);
          const currentProgress = currentCheckpoint.totalLines 
            ? Math.min(100, Math.round((lineNum / currentCheckpoint.totalLines) * 100))
            : 0;
          LOGGER.log(`Progress checkpoint saved: line ${lineNum}/${currentCheckpoint.totalLines || '?'}, indexed ${newTotalIndexed}, progress ${currentProgress}%`);
        }
        batch = [];
      }

      delete products[productId];
      delete productCollections[productId];
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

        if (products[pid]) {
          await flushProduct(pid);
        }

        // Preserve options from Product row if they exist (JSONL format includes options in Product row)
        // Initialize arrays for child rows that will be collected separately
        products[pid] = {
          ...row,
          options: Array.isArray(row.options) ? row.options : [], // Keep options from Product row
          images: [],
          variants: [],
          collections: []
        };

        continue;
      }

      /* ------------------ ProductOption ------------------ */
      if (type === "ProductOption") {
        const parent = products[row.__parentId];
        if (parent) parent.options.push(row);
        continue;
      }

      /* ------------------ MediaImage ------------------ */
      if (type === "MediaImage") {
        const parent = products[row.__parentId];
        if (parent) {
          // Always push MediaImage row - it has full data structure
          // The row contains: id, alt, preview.image.url, status, __parentId
          parent.images.push(row);
        }
        continue;
      }

      /* ------------------ ProductVariant ------------------ */
      if (type === "ProductVariant") {
        const parent = products[row.__parentId];
        if (parent) parent.variants.push(row);
        continue;
      }

      /* ======================================================
       *                     COLLECTION ROOT
       * ====================================================== */
      if (type === "Collection") {
        collections[row.id] = {
          ...row,
          products: []
        };
        continue;
      }

      /* ------------------ Collection Product Mapping ------------------ */
      if (type === "CollectionProduct") {
        const parent = collections[row.__parentId];
        if (parent) parent.products.push(row.id);

        const collectionId = normalizeShopifyId(row.__parentId);
        const productId = row.id;
        if (collectionId && productId) {
          if (!productCollections[productId]) productCollections[productId] = new Set();
          productCollections[productId].add(collectionId);
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
    for (const pid of Object.keys(products)) {
      await flushProduct(pid);
    }

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

