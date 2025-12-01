/**
 * Indexing Lock Service
 * Prevents duplicate indexing requests for the same shop
 * Uses Elasticsearch to track active indexing processes
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { LOCK_INDEX, CHECKPOINT_INDEX } from './indexing.constants';

const LOGGER = createModuleLogger('IndexingLockService');
const LOCK_TTL = 2 * 60 * 60 * 1000; // 2 hours - locks expire after 2 hours

export class IndexingLockService {
  private esClient: Client;

  constructor(esClient: Client) {
    this.esClient = esClient;
  }

  /**
   * Ensure lock index exists
   */
  private async ensureIndex(): Promise<void> {
    try {
      const exists = await this.esClient.indices.exists({ index: LOCK_INDEX });
      if (!exists) {
        await this.esClient.indices.create({
          index: LOCK_INDEX,
          mappings: {
            properties: {
              shop: { type: 'keyword' },
              lockId: { type: 'keyword' },
              startedAt: { type: 'date' },
              expiresAt: { type: 'date' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
        });
        LOGGER.debug('Indexing lock index created');
      }
    } catch (error: any) {
      LOGGER.warn('Failed to ensure lock index exists', error?.message || error);
    }
  }

  /**
   * Try to acquire a lock for indexing
   * Returns true if lock was acquired, false if already locked
   */
  async acquireLock(shop: string): Promise<boolean> {
    try {
      await this.ensureIndex();
      
      const lockId = `lock_${ShopifyShopName(shop)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + LOCK_TTL);

      // Try to create the lock (will fail if it already exists)
      try {
        await this.esClient.create({
          index: LOCK_INDEX,
          id: lockId,
          document: {
            shop,
            lockId,
            startedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          refresh: true, // Force refresh to make it immediately visible
        });

        LOGGER.log('Indexing lock acquired', { shop, lockId });
        return true;
      } catch (error: any) {
        if (error.statusCode === 409) {
          // Lock already exists - check if it's expired
          const existing = await this.esClient.get({
            index: LOCK_INDEX,
            id: lockId,
          });

          if (existing.found && existing._source) {
            const source = existing._source as any;
            const expiresAtTime = new Date(source.expiresAt).getTime();
            const nowTime = Date.now();

            if (expiresAtTime < nowTime) {
              // Lock expired - delete and create new one
              LOGGER.log('Existing lock expired, acquiring new lock', { shop });
              await this.esClient.delete({
                index: LOCK_INDEX,
                id: lockId,
                refresh: true,
              });

              await this.esClient.create({
                index: LOCK_INDEX,
                id: lockId,
                document: {
                  shop,
                  lockId,
                  startedAt: now.toISOString(),
                  expiresAt: expiresAt.toISOString(),
                },
                refresh: true,
              });

              return true;
            } else {
              // Lock is still valid - indexing is in progress
              LOGGER.warn('Indexing already in progress for shop', {
                shop,
                lockStartedAt: source.startedAt,
                expiresAt: source.expiresAt,
              });
              return false;
            }
          }
        }
        throw error;
      }
    } catch (error: any) {
      LOGGER.error('Error acquiring indexing lock', {
        shop,
        error: error?.message || error,
      });
      // On error, allow the request to proceed (fail open)
      // This prevents lock service issues from blocking indexing
      return true;
    }
  }

  /**
   * Release the lock for a shop
   */
  async releaseLock(shop: string): Promise<void> {
    try {
      const lockId = `lock_${ShopifyShopName(shop)}`;
      
      await this.esClient.delete({
        index: LOCK_INDEX,
        id: lockId,
        refresh: false, // Don't wait for refresh
      });

      LOGGER.log('Indexing lock released', { shop, lockId });
    } catch (error: any) {
      if (error.statusCode !== 404) {
        LOGGER.warn('Error releasing indexing lock', {
          shop,
          error: error?.message || error,
        });
      }
      // Ignore 404 errors (lock doesn't exist)
    }
  }

  /**
   * Check if indexing is currently in progress for a shop
   */
  async isLocked(shop: string): Promise<boolean> {
    try {
      const lockId = `lock_${ShopifyShopName(shop)}`;
      
      const response = await this.esClient.get({
        index: LOCK_INDEX,
        id: lockId,
      });

      if (response.found && response._source) {
        const source = response._source as any;
        const expiresAtTime = new Date(source.expiresAt).getTime();
        const nowTime = Date.now();

        if (expiresAtTime >= nowTime) {
          // Lock is still valid - check if it's stale (no actual process running)
          const isStale = await this.isLockStale(shop);
          if (isStale) {
            LOGGER.warn('Lock exists but appears stale (no active indexing process)', { shop });
            // Release stale lock
            await this.releaseLock(shop);
            return false;
          }
          return true;
        } else {
          // Lock expired - clean it up
          await this.releaseLock(shop);
          return false;
        }
      }

      return false;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      LOGGER.warn('Error checking indexing lock', {
        shop,
        error: error?.message || error,
      });
      // On error, assume not locked (fail open)
      return false;
    }
  }

  /**
   * Check if a lock is stale (exists but no actual indexing process is running)
   * A lock is considered stale if:
   * 1. Lock exists but checkpoint hasn't been updated in the last 5 minutes
   * 2. Checkpoint status is 'in_progress' but hasn't been updated recently
   */
  async isLockStale(shop: string): Promise<boolean> {
    try {
      const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
      const checkpointId = `checkpoint_${ShopifyShopName(shop)}`;

      // Check if checkpoint exists and when it was last updated
      const checkpointResponse = await this.esClient.get({
        index: CHECKPOINT_INDEX,
        id: checkpointId,
      });

      if (checkpointResponse.found && checkpointResponse._source) {
        const source = checkpointResponse._source as any;
        const updatedAt = source.updatedAt ? new Date(source.updatedAt).getTime() : null;
        const data = source.data || {};
        const status = data.status;

        // If status is in_progress but checkpoint hasn't been updated recently, it's stale
        if (status === 'in_progress' && updatedAt) {
          const timeSinceUpdate = Date.now() - updatedAt;
          if (timeSinceUpdate > STALE_THRESHOLD_MS) {
            LOGGER.warn('Lock is stale - checkpoint not updated in last 5 minutes', {
              shop,
              timeSinceUpdateMs: timeSinceUpdate,
              lastUpdated: source.updatedAt,
            });
            return true;
          }
        }

        // If status is success or failed, lock should be released but if it exists, it's stale
        if (status === 'success' || status === 'failed') {
          LOGGER.warn('Lock exists but indexing is already completed', {
            shop,
            status,
          });
          return true;
        }
      } else {
        // Lock exists but no checkpoint - likely stale
        LOGGER.warn('Lock exists but no checkpoint found - likely stale', { shop });
        return true;
      }

      return false;
    } catch (error: any) {
      if (error.statusCode === 404) {
        // No checkpoint found - lock is likely stale
        return true;
      }
      LOGGER.warn('Error checking if lock is stale', {
        shop,
        error: error?.message || error,
      });
      // On error, assume not stale (fail closed - be conservative)
      return false;
    }
  }
}

