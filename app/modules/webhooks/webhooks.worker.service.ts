/**
 * Webhook Worker Service
 * Processes webhook events asynchronously
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { WebhooksRepository, WebhookEvent } from './webhooks.repository';
import { PRODUCT_INDEX_NAME } from '@shared/constants/products.constants';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { SHOPS_INDEX_NAME } from '@shared/constants/es.constant';
// Note: For full product transformation, consider using ProductBulkIndexer's logic
import { ensureProductIndex } from '@shared/storefront/index.util';

const logger = createModuleLogger('webhooks-worker');

export class WebhookWorkerService {
  private esClient: Client;
  private webhooksRepository: WebhooksRepository;
  private shopsRepository: ShopsRepository;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(esClient: Client) {
    this.esClient = esClient;
    this.webhooksRepository = new WebhooksRepository(esClient);
    this.shopsRepository = new ShopsRepository(esClient, SHOPS_INDEX_NAME);
    
    // Cleanup on process termination
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  /**
   * Start webhook processing worker
   */
  start(intervalMs: number = 5000): void {
    if (this.processingInterval) {
      logger.warn('Webhook worker already started');
      return;
    }

    logger.info('Starting webhook worker', { intervalMs });
    
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processPendingWebhooks();
      }
    }, intervalMs);
  }

  /**
   * Stop webhook processing worker
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Webhook worker stopped');
    }
  }

  /**
   * Process pending webhooks
   */
  async processPendingWebhooks(batchSize: number = 10): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const pendingWebhooks = await this.webhooksRepository.getPendingWebhooks(batchSize);

      if (pendingWebhooks.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.info('Processing webhook batch', { count: pendingWebhooks.length });

      // Process webhooks in parallel (with concurrency limit)
      const concurrency = 3;
      for (let i = 0; i < pendingWebhooks.length; i += concurrency) {
        const batch = pendingWebhooks.slice(i, i + concurrency);
        // Use Promise.allSettled to prevent one failure from stopping others
        const results = await Promise.allSettled(
          batch.map(webhook => this.processWebhook(webhook))
        );
        
        // Log any failures
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.error('Webhook processing failed in batch', {
              webhookId: batch[index]?.webhookId,
              error: result.reason?.message || result.reason,
            });
          }
        });
      }

      logger.info('Webhook batch processed', { count: pendingWebhooks.length });
    } catch (error: any) {
      logger.error('Error processing pending webhooks', {
        error: error?.message || error,
        stack: error?.stack,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single webhook event
   */
  private async processWebhook(webhook: WebhookEvent): Promise<void> {
    try {
      // Mark as processing
      await this.webhooksRepository.updateWebhookStatus(webhook.id, 'processing');

      logger.info('Processing webhook', {
        webhookId: webhook.webhookId,
        topic: webhook.topic,
        eventType: webhook.eventType,
        shop: webhook.shop,
      });

      // Route to appropriate handler based on event type
      switch (webhook.eventType) {
        case 'products/create':
        case 'products/update':
          await this.processProductWebhook(webhook);
          break;
        case 'products/delete':
          await this.processProductDeleteWebhook(webhook);
          break;
        case 'collections/update':
          await this.processCollectionUpdateWebhook(webhook);
          break;
        case 'collections/delete':
          await this.processCollectionDeleteWebhook(webhook);
          break;
        default:
          logger.warn('Unknown webhook event type', { eventType: webhook.eventType });
          await this.webhooksRepository.updateWebhookStatus(webhook.id, 'completed');
      }

      // Mark as completed
      await this.webhooksRepository.updateWebhookStatus(webhook.id, 'completed');
      
      logger.info('Webhook processed successfully', {
        webhookId: webhook.webhookId,
        eventType: webhook.eventType,
      });
    } catch (error: any) {
      logger.error('Error processing webhook', {
        webhookId: webhook.webhookId,
        eventType: webhook.eventType,
        error: error?.message || error,
        stack: error?.stack,
      });

      // Retry webhook
      const willRetry = await this.webhooksRepository.retryWebhook(
        webhook.id,
        error?.message || 'Unknown error'
      );

      if (!willRetry) {
        logger.error('Webhook failed after max retries', {
          webhookId: webhook.webhookId,
          eventType: webhook.eventType,
        });
      }
    }
  }

  /**
   * Process product create/update webhook
   * Uses payload data directly from webhook
   */
  private async processProductWebhook(webhook: WebhookEvent): Promise<void> {
    const { shop, productGid, productId, payload } = webhook;

    if (!productGid && !productId) {
      throw new Error('Product GID or ID is required');
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid webhook payload');
    }

    // Get shop data to verify shop exists
    const shopData = await this.shopsRepository.getShop(shop);
    if (!shopData) {
      throw new Error(`Shop not found: ${shop}`);
    }

    // Ensure product index exists
    await ensureProductIndex(this.esClient, shop);
    const indexName = PRODUCT_INDEX_NAME(shop);

    // Use payload data directly - webhooks contain product information
    // Extract product ID from payload
    const docId = productGid || productId || payload?.admin_graphql_api_id || payload?.id;

    if (!docId) {
      throw new Error('Product ID not found in webhook payload');
    }

    // Transform payload to product document format
    // Note: This is a simplified version - for full transformation,
    // you may want to use ProductBulkIndexer's transformation logic
    const productDoc = {
      id: docId,
      productId: payload?.id?.toString() || productId || docId,
      title: payload?.title || '',
      handle: payload?.handle || '',
      status: payload?.status || 'ACTIVE',
      vendor: payload?.vendor || null,
      productType: payload?.product_type || null,
      tags: Array.isArray(payload?.tags) ? payload.tags : [],
      createdAt: payload?.created_at || new Date().toISOString(),
      updatedAt: payload?.updated_at || new Date().toISOString(),
      publishedAt: payload?.published_at || null,
      // Add other fields from payload as needed
      ...payload,
    };

    await this.esClient.index({
      index: indexName,
      id: docId,
      document: productDoc,
      refresh: true, // Refresh for immediate visibility
    });

    logger.info('Product indexed from webhook', {
      shop,
      productId: productDoc.productId,
      productGid: docId,
    });
  }

  /**
   * Process product delete webhook
   */
  private async processProductDeleteWebhook(webhook: WebhookEvent): Promise<void> {
    const { shop, productId, productGid } = webhook;

    if (!productId && !productGid) {
      throw new Error('Product ID or GID is required');
    }

    const indexName = PRODUCT_INDEX_NAME(shop);
    const docId = productId || productGid;

    try {
      await this.esClient.delete({
        index: indexName,
        id: docId,
        refresh: true,
      });

      logger.info('Product deleted from index', {
        shop,
        productId: docId,
      });
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Product already deleted, that's fine
        logger.info('Product already deleted from index', {
          shop,
          productId: docId,
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Process collection update webhook
   */
  private async processCollectionUpdateWebhook(webhook: WebhookEvent): Promise<void> {
    const { shop, isBestSellerCollection, sortOrderUpdated } = webhook;

    logger.info('Processing collection update webhook', {
      shop,
      isBestSellerCollection,
      sortOrderUpdated,
    });

    // If best seller collection was updated or sort order changed,
    // trigger best seller ranking recalculation
    if (isBestSellerCollection || sortOrderUpdated) {
      // TODO: Trigger best seller collection service to recalculate rankings
      logger.info('Best seller collection updated - ranking recalculation needed', {
        shop,
        isBestSellerCollection,
        sortOrderUpdated,
      });
    }
  }

  /**
   * Process collection delete webhook
   */
  private async processCollectionDeleteWebhook(webhook: WebhookEvent): Promise<void> {
    const { shop, isBestSellerCollection } = webhook;

    logger.info('Processing collection delete webhook', {
      shop,
      isBestSellerCollection,
    });

    // If best seller collection was deleted, clean up rankings
    if (isBestSellerCollection) {
      // TODO: Clean up best seller collection data
      logger.info('Best seller collection deleted - cleanup needed', {
        shop,
      });
    }
  }
}

