/**
 * Best Seller Collection Cleanup Service
 * Deletes collections that haven't been used for 30+ days
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { BestSellerCollectionService } from './indexing.best-seller-collection.service';
import { COLLECTION_UNUSED_DELETE_DAYS } from './indexing.constants';
import { ShopifyGraphQLRepository } from './indexing.graphql.repository';
import { ShopsRepository } from '@modules/shops/shops.repository';

const LOGGER = createModuleLogger('BestSellerCleanupService');

export class BestSellerCleanupService {
  private esClient: Client;
  private shopsRepository: ShopsRepository;

  constructor(esClient: Client, shopsRepository: ShopsRepository) {
    this.esClient = esClient;
    this.shopsRepository = shopsRepository;
  }

  /**
   * Run cleanup job to delete unused collections
   */
  async runCleanup(days: number = COLLECTION_UNUSED_DELETE_DAYS): Promise<{
    totalFound: number;
    deleted: number;
    failed: number;
    errors: Array<{ shop: string; error: string }>;
  }> {
    LOGGER.log('Starting best seller collection cleanup', { days });

    const unusedCollections = await BestSellerCollectionService.findUnusedCollections(
      this.esClient,
      days
    );

    LOGGER.log(`Found ${unusedCollections.length} unused collections to clean up`);

    const result = {
      totalFound: unusedCollections.length,
      deleted: 0,
      failed: 0,
      errors: [] as Array<{ shop: string; error: string }>,
    };

    for (const collectionState of unusedCollections) {
      if (!collectionState.collectionId) {
        LOGGER.warn('Collection state has no collectionId, skipping', {
          shop: collectionState.shop,
        });
        continue;
      }

      try {
        // Get shop to create GraphQL repository
        const shop = await this.shopsRepository.getShop(collectionState.shop);
        if (!shop || !shop.accessToken) {
          LOGGER.warn('Shop not found or missing access token, skipping', {
            shop: collectionState.shop,
          });
          result.failed++;
          result.errors.push({
            shop: collectionState.shop,
            error: 'Shop not found or missing access token',
          });
          continue;
        }

        // Create service and delete collection
        const graphqlRepo = new ShopifyGraphQLRepository(this.shopsRepository);
        const collectionService = new BestSellerCollectionService(
          this.esClient,
          collectionState.shop,
          graphqlRepo
        );

        await collectionService.deleteCollection(collectionState.collectionId);

        LOGGER.log('Deleted unused collection', {
          shop: collectionState.shop,
          collectionId: collectionState.collectionId,
          lastUsedAt: collectionState.lastUsedAt,
        });

        result.deleted++;
      } catch (error: any) {
        LOGGER.error('Failed to delete collection', {
          shop: collectionState.shop,
          collectionId: collectionState.collectionId,
          error: error?.message || error,
        });

        result.failed++;
        result.errors.push({
          shop: collectionState.shop,
          error: error?.message || String(error),
        });
      }
    }

    LOGGER.log('Cleanup completed', result);
    return result;
  }
}

