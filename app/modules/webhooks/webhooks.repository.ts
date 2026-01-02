/**
 * Webhooks Repository
 * Handles Elasticsearch operations for webhook queue
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { WEBHOOKS_QUEUE_INDEX_NAME } from '@shared/constants/es.constant';
import { v4 as uuidv4 } from 'uuid';

const logger = createModuleLogger('webhooks-repository');

export interface WebhookEvent {
  id: string;
  webhookId: string;
  topic: string;
  shop: string;
  eventType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payload: any;
  receivedAt: string;
  processedAt?: string;
  retryCount: number;
  error?: string;
  // Event-specific fields
  productId?: string;
  productGid?: string;
  productTitle?: string;
  productHandle?: string;
  collectionId?: string;
  collectionGid?: string;
  collectionHandle?: string;
  collectionTitle?: string;
  isBestSellerCollection?: boolean;
  sortOrderUpdated?: boolean;
}

export interface CreateWebhookInput {
  topic: string;
  shop: string;
  eventType: string;
  payload: any;
  receivedAt: string;
  productId?: string;
  productGid?: string;
  productTitle?: string;
  productHandle?: string;
  collectionId?: string;
  collectionGid?: string;
  collectionHandle?: string;
  collectionTitle?: string;
  isBestSellerCollection?: boolean;
  sortOrderUpdated?: boolean;
}

export class WebhooksRepository {
  private esClient: Client;
  private index: string;

  constructor(esClient: Client, index: string = WEBHOOKS_QUEUE_INDEX_NAME) {
    this.esClient = esClient;
    this.index = index;
  }

  /**
   * Ensure webhook queue index exists
   */
  private async ensureIndex(): Promise<void> {
    try {
      const exists = await this.esClient.indices.exists({ index: this.index });
      if (!exists) {
        await this.esClient.indices.create({
          index: this.index,
          mappings: {
            properties: {
              webhookId: { type: 'keyword' },
              topic: { type: 'keyword' },
              shop: { type: 'keyword' },
              eventType: { type: 'keyword' },
              status: { type: 'keyword' },
              payload: { type: 'object', enabled: true },
              receivedAt: { type: 'date' },
              processedAt: { type: 'date' },
              retryCount: { type: 'integer' },
              error: { type: 'text' },
              productId: { type: 'keyword' },
              productGid: { type: 'keyword' },
              collectionId: { type: 'keyword' },
              collectionGid: { type: 'keyword' },
              isBestSellerCollection: { type: 'boolean' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
        });
        logger.info('Webhook queue index created');
      }
    } catch (error: any) {
      logger.warn('Failed to ensure webhook queue index exists', error?.message || error);
    }
  }

  /**
   * Create webhook event in queue
   */
  async createWebhook(input: CreateWebhookInput): Promise<WebhookEvent> {
    await this.ensureIndex();

    const webhookId = uuidv4();
    const id = `${input.shop}_${input.topic}_${webhookId}`;
    
      // Validate required fields
      if (!input.topic || !input.shop || !input.eventType) {
        throw new Error('Missing required webhook fields: topic, shop, eventType');
      }

      const webhook: WebhookEvent = {
      id,
      webhookId,
      topic: input.topic,
      shop: input.shop,
      eventType: input.eventType,
      status: 'pending',
      payload: input.payload || {},
      receivedAt: input.receivedAt || new Date().toISOString(),
      retryCount: 0,
      productId: input.productId,
      productGid: input.productGid,
      productTitle: input.productTitle,
      productHandle: input.productHandle,
      collectionId: input.collectionId,
      collectionGid: input.collectionGid,
      collectionHandle: input.collectionHandle,
      collectionTitle: input.collectionTitle,
      isBestSellerCollection: input.isBestSellerCollection || false,
      sortOrderUpdated: input.sortOrderUpdated || false,
    };

    await this.esClient.index({
      index: this.index,
      id,
      document: webhook,
      refresh: false, // Don't wait for refresh for performance
    });

    logger.info('Webhook event queued', {
      webhookId,
      topic: input.topic,
      shop: input.shop,
      eventType: input.eventType,
    });

    return webhook;
  }

  /**
   * Get pending webhooks for processing
   */
  async getPendingWebhooks(limit: number = 100): Promise<WebhookEvent[]> {
    await this.ensureIndex();

    try {
      const response = await this.esClient.search({
        index: this.index,
        query: {
          bool: {
            must: [
              { term: { status: 'pending' } },
            ],
          },
        },
        sort: [
          { receivedAt: { order: 'asc' } }, // Process oldest first
        ],
        size: limit,
      });

      if (!response.hits || !response.hits.hits) {
        return [];
      }
      
      return response.hits.hits
        .map((hit: any) => hit._source as WebhookEvent)
        .filter((webhook: WebhookEvent | null) => webhook !== null && webhook !== undefined);
    } catch (error: any) {
      if (error.statusCode === 404) {
        return [];
      }
      logger.error('Error getting pending webhooks', error?.message || error);
      throw error;
    }
  }

  /**
   * Update webhook status
   */
  async updateWebhookStatus(
    id: string,
    status: WebhookEvent['status'],
    error?: string
  ): Promise<void> {
    try {
      const update: any = {
        status,
        processedAt: new Date().toISOString(),
      };

      if (error) {
        update.error = error;
      }

      await this.esClient.update({
        index: this.index,
        id,
        doc: update,
        refresh: false,
      });

      logger.info('Webhook status updated', { id, status });
    } catch (error: any) {
      if (error.statusCode !== 404) {
        logger.error('Error updating webhook status', {
          id,
          status,
          error: error?.message || error,
        });
        throw error;
      }
    }
  }

  /**
   * Increment retry count and mark as pending for retry
   */
  async retryWebhook(id: string, error: string, maxRetries: number = 3): Promise<boolean> {
    try {
      const existing = await this.esClient.get({
        index: this.index,
        id,
      });

      if (!existing.found) {
        return false;
      }

      const source = existing._source as WebhookEvent;
      const newRetryCount = source.retryCount + 1;

      if (newRetryCount > maxRetries) {
        // Mark as failed after max retries
        await this.updateWebhookStatus(id, 'failed', error);
        logger.warn('Webhook exceeded max retries', { id, retryCount: newRetryCount });
        return false;
      }

      // Mark as pending for retry
      await this.esClient.update({
        index: this.index,
        id,
        doc: {
          status: 'pending',
          retryCount: newRetryCount,
          error: error,
        },
        refresh: false,
      });

      logger.info('Webhook queued for retry', { id, retryCount: newRetryCount });
      return true;
    } catch (error: any) {
      logger.error('Error retrying webhook', {
        id,
        error: error?.message || error,
      });
      return false;
    }
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(id: string): Promise<WebhookEvent | null> {
    try {
      const response = await this.esClient.get({
        index: this.index,
        id,
      });

      if (response.found && response._source) {
        return response._source as WebhookEvent;
      }

      return null;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      logger.error('Error getting webhook', { id, error: error?.message || error });
      throw error;
    }
  }

  /**
   * Check if webhook was already processed (deduplication)
   * Uses topic + shop + entity ID as deduplication key
   */
  async isDuplicate(
    topic: string,
    shop: string,
    entityId?: string,
    timeWindowMs: number = 60000 // 1 minute window
  ): Promise<boolean> {
    await this.ensureIndex();

    try {
      const must: any[] = [
        { term: { topic } },
        { term: { shop } },
        { term: { status: 'completed' } },
      ];

      if (entityId) {
        // Check both productId and collectionId
        must.push({
          bool: {
            should: [
              { term: { productId: entityId } },
              { term: { collectionId: entityId } },
            ],
            minimum_should_match: 1,
          },
        });
      }

      // Check within time window
      const timeWindow = new Date(Date.now() - timeWindowMs);
      must.push({
        range: {
          receivedAt: {
            gte: timeWindow.toISOString(),
          },
        },
      });

      const response = await this.esClient.search({
        index: this.index,
        query: {
          bool: { must },
        },
        size: 1,
      });

      return response.hits.hits.length > 0;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      logger.warn('Error checking webhook duplicate', error?.message || error);
      return false; // On error, allow processing (fail open)
    }
  }

  /**
   * Clean up old processed webhooks (older than TTL days)
   */
  async cleanupOldWebhooks(ttlDays: number = 7): Promise<number> {
    await this.ensureIndex();

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - ttlDays);

      const response = await this.esClient.deleteByQuery({
        index: this.index,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { status: 'completed' } },
                    { term: { status: 'failed' } },
                  ],
                  minimum_should_match: 1,
                },
              },
              {
                range: {
                  processedAt: {
                    lt: cutoffDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        refresh: false,
      });

      const deleted = response.deleted || 0;
      logger.info('Cleaned up old webhooks', { deleted, ttlDays });
      return deleted;
    } catch (error: any) {
      logger.error('Error cleaning up old webhooks', error?.message || error);
      return 0;
    }
  }
}

