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
import { ensureProductIndex } from '@shared/storefront/index.util';
import { ShopifyGraphQLRepository } from '@modules/indexing/indexing.graphql.repository';
import { GET_PRODUCT_QUERY } from '@modules/indexing/indexing.graphql';
import { transformProductToESDoc } from '@modules/indexing/indexing.helper';
import { buildShopifyGid } from '@shared/utils/shopify-id.util';
import { filterProductFields } from '@shared/storefront/field.filter';
import type { productOption, productCategory, productPriceRangeV2 } from '@shared/storefront/types';

const logger = createModuleLogger('webhooks-worker');

export class WebhookWorkerService {
  private esClient: Client;
  private webhooksRepository: WebhooksRepository;
  private shopsRepository: ShopsRepository;
  private graphqlRepo: ShopifyGraphQLRepository;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(esClient: Client) {
    this.esClient = esClient;
    this.webhooksRepository = new WebhooksRepository(esClient);
    this.shopsRepository = new ShopsRepository(esClient, SHOPS_INDEX_NAME);
    this.graphqlRepo = new ShopifyGraphQLRepository(this.shopsRepository);
    
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
   * Fetches full product data via GraphQL and uses the same transformation logic as indexing
   * to ensure data consistency (collections, variants, options, etc.)
   */
  private async processProductWebhook(webhook: WebhookEvent): Promise<void> {
    const { shop, productGid, productId, payload } = webhook;

    if (!productGid && !productId) {
      throw new Error('Product GID or ID is required');
    }

    // Get shop data to verify shop exists
    const shopData = await this.shopsRepository.getShop(shop);
    if (!shopData) {
      throw new Error(`Shop not found: ${shop}`);
    }

    // Ensure product index exists
    await ensureProductIndex(this.esClient, shop);
    const indexName = PRODUCT_INDEX_NAME(shop);

    // Build product GID - prefer productGid, otherwise build from productId
    let productGID: string;
    if (productGid) {
      productGID = productGid;
    } else if (productId) {
      // Convert numeric ID to GraphQL GID format
      productGID = buildShopifyGid('Product', productId);
    } else if (payload?.admin_graphql_api_id) {
      productGID = payload.admin_graphql_api_id;
    } else if (payload?.id) {
      productGID = buildShopifyGid('Product', payload.id);
    } else {
      throw new Error('Product ID not found in webhook payload');
    }

    logger.info('Fetching product data via GraphQL', {
      shop,
      productGID,
    });

    // Fetch full product data from Shopify Admin API using GraphQL
    // This ensures we get all required fields (collections, variants, options, etc.)
    
    /**
     * Raw Shopify Admin API GraphQL product response structure
     * Matches the structure returned by GET_PRODUCT_QUERY
     */
    interface ShopifyAdminProduct {
      id: string;
      title?: string | null;
      handle?: string | null;
      category?: productCategory | null;
      createdAt?: string | null;
      updatedAt?: string | null;
      publishedAt?: string | null;
      tags?: string[];
      vendor?: string | null;
      productType?: string | null;
      status?: string | null;
      templateSuffix?: string | null;
      totalInventory?: number | null;
      tracksInventory?: boolean | null;
      priceRangeV2?: productPriceRangeV2 | null;
      options?: productOption[];
      media?: {
        edges?: Array<{
          node?: {
            id?: string;
            alt?: string | null;
            preview?: {
              image?: {
                url?: string;
                altText?: string | null;
              } | null;
            } | null;
            status?: string | null;
          } | null;
        } | null>;
      } | null;
      variants?: {
        edges?: Array<{
          node?: {
            id?: string;
            title?: string | null;
            displayName?: string | null;
            sku?: string | null;
            barcode?: string | null;
            price?: string | null;
            compareAtPrice?: string | null;
            availableForSale?: boolean | null;
            inventoryQuantity?: number | null;
            position?: number | null;
            sellableOnlineQuantity?: number | null;
            taxable?: boolean | null;
            createdAt?: string | null;
            selectedOptions?: Array<{
              name?: string | null;
              value?: string | null;
            } | null>;
          } | null;
        } | null>;
      } | null;
      collections?: {
        edges?: Array<{
          node?: {
            id?: string;
          } | null;
        } | null>;
      } | null;
      metafields?: {
        edges?: Array<{
          node?: {
            id?: string;
            namespace?: string | null;
            key?: string | null;
            value?: string | null;
            type?: string | null;
          } | null;
        } | null>;
      } | null;
    }

    interface ProductGraphQLResponse {
      product: ShopifyAdminProduct | null;
    }

    const graphqlResponse = await this.graphqlRepo.post<ProductGraphQLResponse>(shop, {
      query: GET_PRODUCT_QUERY,
      variables: { id: productGID },
    });

    if (graphqlResponse.errors && graphqlResponse.errors.length > 0) {
      const errorMessages = graphqlResponse.errors.map(e => e.message || e.code || 'Unknown error').join(', ');
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    if (!graphqlResponse.data?.product) {
      throw new Error(`Product not found: ${productGID}`);
    }

    const rawProduct = graphqlResponse.data.product;

    // Transform product using the same logic as bulk indexing
    // This ensures data consistency: collections, variants, options, price calculations, etc.
    const transformedProduct = transformProductToESDoc(rawProduct);

    // Filter fields to match ES mapping (remove any extra fields)
    const productDoc = filterProductFields(transformedProduct);

    // Use the normalized product ID as the document ID
    const docId = productDoc.id || productGID;

    await this.esClient.index({
      index: indexName,
      id: docId,
      document: productDoc,
      refresh: true, // Refresh for immediate visibility
    });

    logger.info('Product indexed from webhook with full data', {
      shop,
      productId: productDoc.productId,
      productGid: docId,
      hasCollections: Array.isArray(productDoc.collections) && productDoc.collections.length > 0,
      collectionsCount: productDoc.collections?.length || 0,
      variantsCount: productDoc.variants?.length || 0,
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

