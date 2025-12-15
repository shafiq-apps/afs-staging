/**
 * Indexer Checkpoint Service
 * Fast, fault-tolerant checkpoint management using Elasticsearch
 * Replaces slow file-based checkpoint system
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { CheckpointData } from './indexing.type';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { CHECKPOINT_INDEX_NAME } from '@shared/constants/es.constant';

const LOGGER = createModuleLogger('IndexerCheckpointService');
const CHECKPOINT_TTL = 1 * 24 * 60 * 60 * 1000; // 1 day in milliseconds

// Check if checkpoints are enabled
// Checkpoints are enabled by default, but can be disabled via environment variable
const isCheckpointEnabled = (): boolean => {
  // Allow explicit disable via environment variable
  if (process.env.INDEXER_CHECKPOINTS_ENABLED === 'false') {
    return false;
  }
  // Enable checkpoints in all environments by default (status tracking is important)
  return true;
};

export class IndexerCheckpointService {
  private shop: string;
  private checkpointId: string;
  private inMemoryCheckpoint: CheckpointData;
  private pendingUpdate: NodeJS.Timeout | null = null;
  private readonly debounceMs: number;
  private readonly forceSaveInterval: number;
  private readonly esClient: Client;

  private forceSaveIntervalId: NodeJS.Timeout | null = null;

  constructor(esClient: Client, shop: string, debounceMs: number = 2000, forceSaveInterval: number = 10000) {
    this.esClient = esClient;
    this.shop = shop;
    this.checkpointId = `checkpoint_${ShopifyShopName(shop)}`;
    this.debounceMs = debounceMs;
    this.forceSaveInterval = forceSaveInterval;
    this.inMemoryCheckpoint = {
      lastProcessedLine: 0,
      status: 'in_progress',
      totalIndexed: 0,
      totalFailed: 0,
      failedItems: [],
    };

    // Ensure checkpoint index exists (async, non-blocking) - only in production
    if (isCheckpointEnabled()) {
      this.ensureIndex().catch((err) => {
        LOGGER.warn('Failed to ensure checkpoint index on init', err?.message || err);
      });
    }
  }

  /**
   * Ensure checkpoint index exists with proper mapping
   */
  private async ensureIndex(): Promise<void> {
    try {
      const exists = await this.esClient.indices.exists({ index: CHECKPOINT_INDEX_NAME });
      if (!exists) {
        await this.esClient.indices.create({
          index: CHECKPOINT_INDEX_NAME,
          mappings: {
            properties: {
              shop: { type: 'keyword' },
              checkpointId: { type: 'keyword' },
              data: { type: 'object', enabled: true },
              updatedAt: { type: 'date' },
              expiresAt: { type: 'date' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0, // No replicas needed for checkpoints
            refresh_interval: '5s', // Less frequent refresh for performance
          },
        });
        LOGGER.debug('Checkpoint index created');
      }
    } catch (error: any) {
      LOGGER.warn('Failed to ensure checkpoint index exists', error?.message || error);
    }
  }

  /**
   * Check if the product index exists
   */
  async checkIndexExists(indexName: string): Promise<boolean> {
    try {
      return await this.esClient.indices.exists({ index: indexName });
    } catch (error: any) {
      LOGGER.warn('Failed to check if index exists', error?.message || error);
      return false;
    }
  }

  /**
   * Load checkpoint from Elasticsearch (fast, async)
   * Returns checkpoint with validation info
   */
  async loadCheckpoint(indexName: string): Promise<{ checkpoint: CheckpointData; shouldUse: boolean; reason: string }> {
    const defaultCheckpoint = this.getDefaultCheckpoint();
    
    // Disable checkpoints in development
    if (!isCheckpointEnabled()) {
      LOGGER.debug('Checkpoints disabled in development environment');
      return { checkpoint: defaultCheckpoint, shouldUse: false, reason: 'disabled_in_development' };
    }
    
    try {
      const response = await this.esClient.get({
        index: CHECKPOINT_INDEX_NAME,
        id: this.checkpointId,
      });

      if (response.found && response._source) {
        const source = response._source as any;
        const data = source.data as CheckpointData;
        
        // Check if expired
        if (source.expiresAt && new Date(source.expiresAt) < new Date()) {
          LOGGER.debug('Checkpoint expired, starting fresh');
          return { checkpoint: defaultCheckpoint, shouldUse: false, reason: 'checkpoint_expired' };
        }

        this.inMemoryCheckpoint = {
          lastProcessedLine: data.lastProcessedLine || 0,
          status: data.status || 'in_progress',
          totalIndexed: data.totalIndexed || 0,
          totalFailed: data.totalFailed || 0,
          failedItems: data.failedItems || [],
          totalLines: data.totalLines,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          error: data.error,
          lastShopifyUpdatedAt: data.lastShopifyUpdatedAt,
          indexExists: data.indexExists,
        };

        // Validate if checkpoint should be used
        const indexExists = await this.checkIndexExists(indexName);
        
        // Rule 1: If index doesn't exist, don't use checkpoint (index was deleted)
        if (!indexExists) {
          LOGGER.log('ES index does not exist, ignoring checkpoint and starting fresh');
          return { checkpoint: defaultCheckpoint, shouldUse: false, reason: 'index_deleted' };
        }

        // Rule 2: If previous status was 'failed', use checkpoint to resume
        if (this.inMemoryCheckpoint.status === 'failed') {
          LOGGER.log('Previous indexing failed, resuming from checkpoint');
          return { checkpoint: this.inMemoryCheckpoint, shouldUse: true, reason: 'resume_from_error' };
        }

        // Rule 3: If previous status was 'success' and index exists, checkpoint is valid
        // (We'll check for new updates in the indexer by comparing updatedAt)
        if (this.inMemoryCheckpoint.status === 'success' && indexExists) {
          LOGGER.log('Previous indexing was successful, checkpoint may be used if no new updates');
          return { checkpoint: this.inMemoryCheckpoint, shouldUse: true, reason: 'previous_success' };
        }

        // Rule 4: If in_progress but index exists, might be stale - check timestamp
        if (this.inMemoryCheckpoint.status === 'in_progress' && indexExists) {
          LOGGER.log('Previous indexing was in progress, will check for updates');
          return { checkpoint: this.inMemoryCheckpoint, shouldUse: true, reason: 'in_progress' };
        }

        LOGGER.debug('Checkpoint loaded from ES', {
          lastProcessedLine: this.inMemoryCheckpoint.lastProcessedLine,
          status: this.inMemoryCheckpoint.status,
        });

        return { checkpoint: this.inMemoryCheckpoint, shouldUse: true, reason: 'valid' };
      }
    } catch (error: any) {
      if (error.statusCode !== 404) {
        LOGGER.warn('Failed to load checkpoint from ES', error?.message || error);
      }
    }

    return { checkpoint: defaultCheckpoint, shouldUse: false, reason: 'no_checkpoint' };
  }

  /**
   * Get current checkpoint (in-memory, always fast)
   */
  getCheckpoint(): CheckpointData {
    return { ...this.inMemoryCheckpoint };
  }

  /**
   * Update checkpoint (in-memory, debounced save to ES)
   * Automatically calculates progress percentage when totalLines and lastProcessedLine are available
   */
  updateCheckpoint(updates: Partial<CheckpointData>): void {
    // Disable checkpoints in development
    if (!isCheckpointEnabled()) {
      return;
    }
    
    this.inMemoryCheckpoint = {
      ...this.inMemoryCheckpoint,
      ...updates,
    };

    // Calculate progress percentage if we have the necessary data
    // Progress is calculated based on lastProcessedLine / totalLines
    // This ensures progress is always up-to-date in the checkpoint
    let progress = 0;
    if (this.inMemoryCheckpoint.status === 'success') {
      // If completed successfully, progress is 100%
      progress = 100;
    } else if (this.inMemoryCheckpoint.totalLines && this.inMemoryCheckpoint.totalLines > 0) {
      progress = Math.min(100, Math.round((this.inMemoryCheckpoint.lastProcessedLine / this.inMemoryCheckpoint.totalLines) * 100));
    } else if (this.inMemoryCheckpoint.totalIndexed && this.inMemoryCheckpoint.totalIndexed > 0) {
      // Rough estimate if we don't have totalLines
      progress = 50;
    }
    // Store progress in checkpoint data (will be available in status service)
    (this.inMemoryCheckpoint as any).progress = progress;

    // Debounce save to ES (non-blocking)
    this.scheduleSave();
  }

  /**
   * Schedule a debounced save to Elasticsearch
   */
  private scheduleSave(): void {
    // Disable checkpoints in development
    if (!isCheckpointEnabled()) {
      return;
    }
    
    // Clear existing pending save
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
    }

    // Schedule new save
    this.pendingUpdate = setTimeout(() => {
      this.saveCheckpointImmediate().catch((err) => {
        LOGGER.warn('Failed to save checkpoint (will retry)', err?.message || err);
      });
      this.pendingUpdate = null;
    }, this.debounceMs);

    // Force save periodically to ensure progress isn't lost (only set once)
    if (!this.forceSaveIntervalId) {
      this.forceSaveIntervalId = setInterval(() => {
        this.saveCheckpointImmediate().catch((err) => {
          LOGGER.warn('Failed to force-save checkpoint', err?.message || err);
        });
      }, this.forceSaveInterval);
    }
  }

  /**
   * Save checkpoint to Elasticsearch immediately (async, non-blocking)
   * Calculates progress before saving to ensure real-time progress updates
   */
  async saveCheckpointImmediate(indexName?: string, lastShopifyUpdatedAt?: string): Promise<void> {
    // Disable checkpoints in development
    if (!isCheckpointEnabled()) {
      return;
    }
    
    try {
      const expiresAt = new Date(Date.now() + CHECKPOINT_TTL);
      
      // Update checkpoint metadata
      if (indexName !== undefined) {
        const indexExists = await this.checkIndexExists(indexName);
        this.inMemoryCheckpoint.indexExists = indexExists;
      }
      if (lastShopifyUpdatedAt !== undefined) {
        this.inMemoryCheckpoint.lastShopifyUpdatedAt = lastShopifyUpdatedAt;
      }

      // Calculate progress percentage before saving
      let progress = 0;
      if (this.inMemoryCheckpoint.status === 'success') {
        progress = 100;
      } else if (this.inMemoryCheckpoint.totalLines && this.inMemoryCheckpoint.totalLines > 0) {
        progress = Math.min(100, Math.round((this.inMemoryCheckpoint.lastProcessedLine / this.inMemoryCheckpoint.totalLines) * 100));
      } else if (this.inMemoryCheckpoint.totalIndexed && this.inMemoryCheckpoint.totalIndexed > 0) {
        progress = 50;
      }

      // Create checkpoint document with progress included
      const checkpointDocument = {
        shop: this.shop,
        checkpointId: this.checkpointId,
        data: {
          ...this.inMemoryCheckpoint,
          progress, // Include progress in checkpoint data
        },
        updatedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      await this.esClient.index({
        index: CHECKPOINT_INDEX_NAME,
        id: this.checkpointId,
        refresh: false, // Don't wait for refresh for speed
        document: checkpointDocument,
      });

      LOGGER.debug('Checkpoint saved to ES', {
        lastProcessedLine: this.inMemoryCheckpoint.lastProcessedLine,
        status: this.inMemoryCheckpoint.status,
        progress: `${progress}%`,
        totalIndexed: this.inMemoryCheckpoint.totalIndexed,
        indexExists: this.inMemoryCheckpoint.indexExists,
        lastShopifyUpdatedAt: this.inMemoryCheckpoint.lastShopifyUpdatedAt,
      });
    } catch (error: any) {
      LOGGER.error('Failed to save checkpoint to ES', error?.message || error);
      throw error;
    }
  }

  /**
   * Force save checkpoint (synchronous wait, use sparingly)
   * Stops periodic saves to prevent overwriting final status
   */
  async forceSave(indexName?: string, lastShopifyUpdatedAt?: string): Promise<void> {
    // Disable checkpoints in development
    if (!isCheckpointEnabled()) {
      return;
    }
    
    // Clear any pending debounced save
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = null;
    }

    // Stop periodic interval saves to prevent overwriting final status
    if (this.forceSaveIntervalId) {
      clearInterval(this.forceSaveIntervalId);
      this.forceSaveIntervalId = null;
    }

    // Update checkpoint metadata
    if (indexName !== undefined) {
      const indexExists = await this.checkIndexExists(indexName);
      this.inMemoryCheckpoint.indexExists = indexExists;
    }
    if (lastShopifyUpdatedAt !== undefined) {
      this.inMemoryCheckpoint.lastShopifyUpdatedAt = lastShopifyUpdatedAt;
    }

    // Calculate progress percentage before saving
    let progress = 0;
    if (this.inMemoryCheckpoint.status === 'success') {
      progress = 100;
    } else if (this.inMemoryCheckpoint.totalLines && this.inMemoryCheckpoint.totalLines > 0) {
      progress = Math.min(100, Math.round((this.inMemoryCheckpoint.lastProcessedLine / this.inMemoryCheckpoint.totalLines) * 100));
    } else if (this.inMemoryCheckpoint.totalIndexed && this.inMemoryCheckpoint.totalIndexed > 0) {
      progress = 50;
    }

    // Save immediately with refresh
    try {
      const expiresAt = new Date(Date.now() + CHECKPOINT_TTL);

      // Create checkpoint document with progress included
      const checkpointDocument = {
        shop: this.shop,
        checkpointId: this.checkpointId,
        data: {
          ...this.inMemoryCheckpoint,
          progress, // Include progress in checkpoint data
        },
        updatedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      await this.esClient.index({
        index: CHECKPOINT_INDEX_NAME,
        id: this.checkpointId,
        refresh: true, // Force refresh for critical saves
        document: checkpointDocument,
      });

      LOGGER.debug('Checkpoint force-saved to ES', {
        status: this.inMemoryCheckpoint.status,
        lastProcessedLine: this.inMemoryCheckpoint.lastProcessedLine,
        progress: `${progress}%`,
        totalIndexed: this.inMemoryCheckpoint.totalIndexed,
      });
    } catch (error: any) {
      LOGGER.error('Failed to force-save checkpoint', error?.message || error);
      throw error;
    }
  }

  /**
   * Clear checkpoint (mark as completed or reset)
   */
  async clearCheckpoint(): Promise<void> {
    // Disable checkpoints in development
    if (!isCheckpointEnabled()) {
      return;
    }
    
    try {
      await this.esClient.delete({
        index: CHECKPOINT_INDEX_NAME,
        id: this.checkpointId,
        refresh: false,
      });
      this.inMemoryCheckpoint = this.getDefaultCheckpoint();
      LOGGER.debug('Checkpoint cleared');
    } catch (error: any) {
      if (error.statusCode !== 404) {
        LOGGER.warn('Failed to clear checkpoint', error?.message || error);
      }
    }
  }

  /**
   * Get default checkpoint
   */
  private getDefaultCheckpoint(): CheckpointData {
    return {
      lastProcessedLine: 0,
      status: 'in_progress',
      totalIndexed: 0,
      totalFailed: 0,
      failedItems: [],
    };
  }

  /**
   * Cleanup on shutdown
   * Note: Do not save checkpoint here if final status has already been set
   * The final status should be saved explicitly before cleanup is called
   */
  async cleanup(): Promise<void> {
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = null;
    }
    if (this.forceSaveIntervalId) {
      clearInterval(this.forceSaveIntervalId);
      this.forceSaveIntervalId = null;
    }
    // Don't save checkpoint in cleanup - final status should already be saved
    // Saving here could overwrite the final status with stale data
  }
}

