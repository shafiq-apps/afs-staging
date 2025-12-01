/**
 * Indexing Status Service
 * Fetches indexing status from Elasticsearch checkpoints
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { CheckpointData } from './indexing.type';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { CHECKPOINT_INDEX } from './indexing.constants';

const LOGGER = createModuleLogger('IndexingStatusService');

export interface IndexingStatus {
  shop: string;
  status: 'in_progress' | 'success' | 'failed' | 'not_started';
  startedAt: string | null;
  completedAt: string | null;
  totalLines: number | null;
  totalIndexed: number;
  totalFailed: number;
  progress: number; // Percentage (0-100)
  failedItems: Array<{
    id: string;
    line: number;
    error?: string;
    retryCount?: number;
  }>;
  error: string | null;
  lastShopifyUpdatedAt: string | null;
  indexExists: boolean;
  lastUpdatedAt: string | null;
  duration: number | null; // Duration in milliseconds
}

export class IndexingStatusService {
  private esClient: Client;

  constructor(esClient: Client) {
    this.esClient = esClient;
  }

  /**
   * Get indexing status for a shop
   */
  async getIndexingStatus(shop: string): Promise<IndexingStatus | null> {
    try {
      const checkpointId = `checkpoint_${ShopifyShopName(shop)}`;
      
      const response = await this.esClient.get({
        index: CHECKPOINT_INDEX,
        id: checkpointId,
      });

      if (response.found && response._source) {
        const source = response._source as any;
        const data: CheckpointData = source.data;
        const updatedAt = source.updatedAt;

        // Get progress from checkpoint data (calculated during save) or calculate it
        let progress = 0;
        if ((data as any).progress !== undefined) {
          // Progress is already calculated and stored in checkpoint
          progress = (data as any).progress;
        } else if (data.totalLines && data.totalLines > 0) {
          // Calculate progress if not stored
          progress = Math.min(100, Math.round((data.lastProcessedLine / data.totalLines) * 100));
        } else if (data.totalIndexed && data.totalIndexed > 0) {
          // If we don't have totalLines, estimate based on indexed count
          progress = data.status === 'success' ? 100 : 50; // Rough estimate
        } else if (data.status === 'success') {
          progress = 100;
        }

        // Calculate duration
        let duration: number | null = null;
        if (data.startedAt) {
          const endTime = data.completedAt ? new Date(data.completedAt).getTime() : Date.now();
          const startTime = new Date(data.startedAt).getTime();
          duration = endTime - startTime;
        }

        const status: IndexingStatus = {
          shop,
          status: data.status || 'not_started',
          startedAt: data.startedAt || null,
          completedAt: data.completedAt || null,
          totalLines: data.totalLines || null,
          totalIndexed: data.totalIndexed || 0,
          totalFailed: data.totalFailed || 0,
          progress,
          failedItems: data.failedItems || [],
          error: data.error || null,
          lastShopifyUpdatedAt: data.lastShopifyUpdatedAt || null,
          indexExists: data.indexExists ?? true,
          lastUpdatedAt: updatedAt || null,
          duration,
        };

        LOGGER.log('Indexing status retrieved', {
          shop,
          status: status.status,
          totalIndexed: status.totalIndexed,
          progress: `${status.progress}%`,
        });

        return status;
      }

      // No checkpoint found - return not_started status
      LOGGER.log('No indexing checkpoint found', { shop });
      return {
        shop,
        status: 'not_started',
        startedAt: null,
        completedAt: null,
        totalLines: null,
        totalIndexed: 0,
        totalFailed: 0,
        progress: 0,
        failedItems: [],
        error: null,
        lastShopifyUpdatedAt: null,
        indexExists: false,
        lastUpdatedAt: null,
        duration: null,
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        // No checkpoint exists - return not_started status
        LOGGER.log('No indexing checkpoint found (404)', { shop });
        return {
          shop,
          status: 'not_started',
          startedAt: null,
          completedAt: null,
          totalLines: null,
          totalIndexed: 0,
          totalFailed: 0,
          progress: 0,
          failedItems: [],
          error: null,
          lastShopifyUpdatedAt: null,
          indexExists: false,
          lastUpdatedAt: null,
          duration: null,
        };
      }

      LOGGER.error('Error fetching indexing status', {
        shop,
        error: error?.message || error,
      });
      throw error;
    }
  }
}

