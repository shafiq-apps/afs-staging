/**
 * Best Seller Collection Service
 * Manages the hidden collection used for best seller ranking
 * Stores collection state in Elasticsearch
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ShopifyGraphQLRepository } from './indexing.graphql.repository';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { normalizeShopifyId, extractShopifyResourceType } from '@shared/utils/shopify-id.util';
import { sleep, appendLog } from './indexing.helper';
import {
  CREATE_BEST_SELLER_COLLECTION_MUTATION,
  UPDATE_COLLECTION_SORT_ORDER_MUTATION,
  GET_COLLECTION_BY_HANDLE_QUERY,
  GET_COLLECTION_PRODUCTS_QUERY,
  DELETE_COLLECTION_MUTATION,
} from './indexing.best-seller-collection.graphql';
import { POLL_QUERY } from './indexing.graphql';
import axios from 'axios';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

import {
  BEST_SELLER_COLLECTION_HANDLE,
  BEST_SELLER_COLLECTION_INDEX,
  COLLECTION_UNUSED_DELETE_DAYS,
} from './indexing.constants';

const LOGGER = createModuleLogger('BestSellerCollectionService');

// Re-export for backward compatibility
export { BEST_SELLER_COLLECTION_HANDLE, BEST_SELLER_COLLECTION_INDEX, COLLECTION_UNUSED_DELETE_DAYS };

export interface BestSellerCollectionState {
  shop: string;
  collectionHandle: string;
  collectionId: string | null;
  status: 'checking' | 'creating' | 'ready' | 'indexing' | 'failed' | 'deleted';
  productCount: number;
  expectedProductCount: number | null;
  createdAt: string;
  lastUsedAt: string;
  lastVerifiedAt: string;
  isStale: boolean;
  error?: string;
}

export class BestSellerCollectionService {
  private esClient: Client;
  private shop: string;
  private graphqlRepo: ShopifyGraphQLRepository;
  private stateId: string;

  constructor(esClient: Client, shop: string, graphqlRepo: ShopifyGraphQLRepository) {
    this.esClient = esClient;
    this.shop = shop;
    this.graphqlRepo = graphqlRepo;
    this.stateId = `best_seller_${ShopifyShopName(shop)}`;
  }

  /**
   * Ensure the best seller collections index exists
   */
  private async ensureIndex(): Promise<void> {
    try {
      const exists = await this.esClient.indices.exists({ index: BEST_SELLER_COLLECTION_INDEX });
      if (!exists) {
        await this.esClient.indices.create({
          index: BEST_SELLER_COLLECTION_INDEX,
          mappings: {
            properties: {
              shop: { type: 'keyword' },
              collectionHandle: { type: 'keyword' },
              collectionId: { type: 'keyword' },
              status: { type: 'keyword' },
              productCount: { type: 'integer' },
              expectedProductCount: { type: 'integer' },
              createdAt: { type: 'date' },
              lastUsedAt: { type: 'date' },
              lastVerifiedAt: { type: 'date' },
              isStale: { type: 'boolean' },
              error: { type: 'text' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
        });
        LOGGER.debug('Best seller collection index created');
      }
    } catch (error: any) {
      LOGGER.warn('Failed to ensure best seller collection index exists', error?.message || error);
    }
  }

  /**
   * Get collection state from ES
   */
  private async getState(): Promise<BestSellerCollectionState | null> {
    try {
      await this.ensureIndex();
      const response = await this.esClient.get({
        index: BEST_SELLER_COLLECTION_INDEX,
        id: this.stateId,
      });

      if (response.found && response._source) {
        return response._source as BestSellerCollectionState;
      }
    } catch (error: any) {
      if (error.statusCode !== 404) {
        LOGGER.warn('Failed to get collection state from ES', error?.message || error);
      }
    }
    return null;
  }

  /**
   * Save collection state to ES
   */
  private async saveState(state: Partial<BestSellerCollectionState>): Promise<void> {
    try {
      await this.ensureIndex();
      const existing = await this.getState();
      const updated: BestSellerCollectionState = {
        shop: this.shop,
        collectionHandle: BEST_SELLER_COLLECTION_HANDLE,
        collectionId: null,
        status: 'checking',
        productCount: 0,
        expectedProductCount: null,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        isStale: false,
        ...existing,
        ...state,
      };

      await this.esClient.index({
        index: BEST_SELLER_COLLECTION_INDEX,
        id: this.stateId,
        document: updated,
        refresh: false,
      });
    } catch (error: any) {
      LOGGER.error('Failed to save collection state to ES', error?.message || error);
      throw error;
    }
  }

  /**
   * Check if collection exists in Shopify by handle
   */
  private async checkCollectionExists(): Promise<{ exists: boolean; collectionId?: string }> {
    try {
      LOGGER.log('Checking collection existence', { handle: BEST_SELLER_COLLECTION_HANDLE, shop: this.shop });
      const response = await this.graphqlRepo.post<{
        collectionByHandle?: { 
          id: string; 
          title?: string; 
          productsCount?: { count: number; precision: string };
        };
      }>(this.shop, {
        query: GET_COLLECTION_BY_HANDLE_QUERY,
        variables: { handle: BEST_SELLER_COLLECTION_HANDLE },
      });

      if (response.status === 'error') {
        LOGGER.warn('Error checking collection existence', {
          errors: response.errors,
          shop: this.shop,
        });
        return { exists: false };
      }

      const collection = response.data?.collectionByHandle;
      if (collection?.id) {
        LOGGER.log('Collection found in Shopify', {
          collectionId: collection.id,
          title: collection.title,
          productsCount: collection.productsCount?.count || 0,
        });
        return { exists: true, collectionId: collection.id };
      }

      LOGGER.log('Collection not found in Shopify', { handle: BEST_SELLER_COLLECTION_HANDLE });
      return { exists: false };
    } catch (error: any) {
      LOGGER.error('Failed to check collection existence', {
        error: error?.message || error,
        stack: error?.stack,
        shop: this.shop,
      });
      return { exists: false };
    }
  }

  /**
   * Create the best seller collection in Shopify
   */
  private async createCollection(): Promise<string> {
    try {
      LOGGER.log('Creating best seller collection in Shopify');
      const response = await this.graphqlRepo.post<{
        collectionCreate?: {
          collection?: { id: string };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      }>(this.shop, {
        query: CREATE_BEST_SELLER_COLLECTION_MUTATION,
        variables: {
          handle: BEST_SELLER_COLLECTION_HANDLE,
          title: `[${process.env.APP_NAME}] All products (Hidden)`,
        },
      });

      if (response.status === 'error' || response.errors) {
        const errorMsg = response.errors?.map(e => e.message).join(', ') || 'Unknown error';
        throw new Error(`Failed to create collection: ${errorMsg}`);
      }

      const collection = response.data?.collectionCreate?.collection;
      const userErrors = response.data?.collectionCreate?.userErrors;

      if (userErrors && userErrors.length > 0) {
        const errorMsg = userErrors.map(e => e.message).join(', ');
        throw new Error(`Collection creation user errors: ${errorMsg}`);
      }

      if (!collection?.id) {
        throw new Error('Collection created but no ID returned');
      }

      LOGGER.log('Best seller collection created', { collectionId: collection.id });

      // Update collection to use best selling sort order
      try {
        const updateResponse = await this.graphqlRepo.post<{
          collectionUpdate?: {
            collection?: { id: string; sortOrder?: string };
            userErrors?: Array<{ field: string[]; message: string }>;
          };
        }>(this.shop, {
          query: UPDATE_COLLECTION_SORT_ORDER_MUTATION,
          variables: { id: collection.id },
        });

        if (updateResponse.status === 'error' || updateResponse.errors) {
          LOGGER.warn('Failed to set best selling sort order, collection will use default sort', {
            errors: updateResponse.errors,
          });
        } else {
          const userErrors = updateResponse.data?.collectionUpdate?.userErrors;
          if (userErrors && userErrors.length > 0) {
            LOGGER.warn('User errors setting sort order', { userErrors });
          } else {
            LOGGER.log('Collection sort order set to best selling', {
              collectionId: collection.id,
              sortOrder: updateResponse.data?.collectionUpdate?.collection?.sortOrder,
            });
          }
        }
      } catch (error: any) {
        LOGGER.warn('Failed to update collection sort order, continuing anyway', error?.message || error);
        // Continue even if sort order update fails - collection will still work
      }

      return collection.id;
    } catch (error: any) {
      LOGGER.error('Failed to create collection', error?.message || error);
      throw error;
    }
  }

  /**
   * Poll collection until products are populated
   * Returns product count when stable
   */
  private async pollCollectionPopulation(collectionId: string, maxWaitMinutes: number = 5): Promise<number> {
    const maxWaitMs = maxWaitMinutes * 60 * 1000;
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    let lastCount = 0;
    let stableCount = 0;
    let stableIterations = 0;
    const requiredStableIterations = 2; // Must be stable for 2 consecutive polls

    LOGGER.log('Polling collection for product population', { collectionId });

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await this.graphqlRepo.post<{
          collection?: {
            productsCount?: { count: number; precision: string };
          };
        }>(this.shop, {
          query: GET_COLLECTION_PRODUCTS_QUERY,
          variables: { id: collectionId },
        });

        if (response.status === 'error') {
          LOGGER.warn('Error polling collection', response.errors);
          await sleep(pollInterval);
          continue;
        }

        const count = response.data?.collection?.productsCount?.count || 0;

        if (count === lastCount) {
          stableIterations++;
          if (stableIterations >= requiredStableIterations) {
            LOGGER.log('Collection population stable', {
              collectionId,
              productCount: count,
              stableIterations,
            });
            return count;
          }
        } else {
          stableIterations = 0;
          stableCount = count;
          LOGGER.log('Collection product count changed', {
            collectionId,
            previousCount: lastCount,
            currentCount: count,
          });
        }

        lastCount = count;
        await sleep(pollInterval);
      } catch (error: any) {
        LOGGER.warn('Error polling collection population', error?.message || error);
        await sleep(pollInterval);
      }
    }

    // Timeout - return last known count
    LOGGER.warn('Collection population polling timeout', {
      collectionId,
      finalCount: stableCount || lastCount,
      maxWaitMinutes,
    });
    return stableCount || lastCount;
  }

  /**
   * Get products from collection using bulk operation
   * Position/rank is determined by array index (index 0 = rank 1, index 1 = rank 2, etc.)
   */
  async getProductRanks(collectionId: string): Promise<Map<string, number>> {
    const ranks = new Map<string, number>();
    
    LOGGER.log('Fetching product ranks from collection using bulk operation', { collectionId });

    try {
      // Step 1: Start bulk operation
      // Build query with collection ID inline (bulk operations don't support variables in query string)
      // Note: Bulk operations return flat structure, not nested edges
      const bulkQuery = `
mutation BulkGetCollectionProducts {
  bulkOperationRunQuery(
    query: """
    {
      collection(id: "${collectionId}") {
        id
        products(sortKey: BEST_SELLING) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
    """
  ) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;
      
      LOGGER.log('Starting bulk operation to fetch collection products', {
        collectionId,
        query: bulkQuery.substring(0, 200) + '...',
      });
      
      const bulkResponse = await this.graphqlRepo.post<{
        bulkOperationRunQuery?: {
          bulkOperation?: { id: string; status: string };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      }>(this.shop, {
        query: bulkQuery,
      });

      if (bulkResponse.status === 'error' || bulkResponse.errors) {
        const errorMsg = bulkResponse.errors?.map(e => e.message).join(', ') || 'Unknown error';
        throw new Error(`Bulk operation failed: ${errorMsg}`);
      }

      const bulkOp = bulkResponse.data?.bulkOperationRunQuery?.bulkOperation;
      const userErrors = bulkResponse.data?.bulkOperationRunQuery?.userErrors;

      if (userErrors && userErrors.length > 0) {
        const errorMsg = userErrors.map(e => e.message).join(', ');
        throw new Error(`Bulk operation user errors: ${errorMsg}`);
      }

      if (!bulkOp?.id) {
        throw new Error('Bulk operation did not return an ID');
      }

      const bulkOpId = bulkOp.id;
      LOGGER.log('Bulk operation started', { bulkOpId });

      // Step 2: Poll until complete
      const result = await this.pollBulkOperation(bulkOpId);
      if (!result || !result.url) {
        throw new Error('Bulk operation did not return a download URL');
      }

      // Step 3: Download and parse JSONL file
      const tempFilePath = await this.downloadBulkFile(result.url);
      
      try {
        // Step 4: Parse JSONL and extract product IDs with their array index as rank
        const productIds: string[] = [];
        const rl = readline.createInterface({
          input: fs.createReadStream(tempFilePath, { encoding: 'utf8' }),
          crlfDelay: Infinity,
        });

        let lineCount = 0;
        let collectionRowFound = false;
        
        for await (const line of rl) {
          lineCount++;
          if (!line.trim()) continue;
          
          try {
            const row = JSON.parse(line);
            
            // Log first few rows to debug structure
            if (lineCount <= 5) {
              LOGGER.debug(`Sample JSONL row ${lineCount}:`, {
                id: row.id,
                __parentId: row.__parentId,
                __typename: row.__typename,
                resourceType: row.id ? extractShopifyResourceType(row.id) : null,
              });
            }
            
            // Bulk operation JSONL format can have different structures:
            // 1. Collection row: { id: "gid://shopify/Collection/123", __typename: "Collection" }
            // 2. Product rows: { id: "gid://shopify/Product/456", __parentId: "gid://shopify/Collection/123" }
            
            if (row.id && typeof row.id === 'string') {
              const resourceType = extractShopifyResourceType(row.id);
              
              // Check if this is the collection itself
              if (resourceType === 'Collection') {
                const normalizedRowId = normalizeShopifyId(row.id);
                const normalizedCollectionId = normalizeShopifyId(collectionId);
                if (normalizedRowId === normalizedCollectionId || row.id === collectionId) {
                  collectionRowFound = true;
                  LOGGER.debug('Found collection row in JSONL');
                  continue;
                }
              }
              
              // Check if this is a Product
              if (resourceType === 'Product') {
                const parentResourceType = row.__parentId ? extractShopifyResourceType(row.__parentId) : null;
                
                // Product with Collection parent (CollectionProduct)
                if (parentResourceType === 'Collection') {
                  // Verify parent matches our collection
                  const normalizedParentId = row.__parentId ? normalizeShopifyId(row.__parentId) : null;
                  const normalizedCollectionId = normalizeShopifyId(collectionId);
                  
                  if (normalizedParentId === normalizedCollectionId || row.__parentId === collectionId) {
                    productIds.push(row.id);
                    if (productIds.length <= 5) {
                      LOGGER.debug(`Added product to ranks: ${row.id} (parent: ${row.__parentId})`);
                    }
                  }
                } else if (!row.__parentId) {
                  // Product without parent - might be direct product in collection context
                  // In some bulk formats, products are listed directly after collection
                  if (collectionRowFound) {
                    productIds.push(row.id);
                    if (productIds.length <= 5) {
                      LOGGER.debug(`Added product to ranks (no parent): ${row.id}`);
                    }
                  }
                }
              }
            }
          } catch (err) {
            // Skip invalid JSON lines
            if (lineCount <= 10) {
              LOGGER.debug(`Skipped invalid JSON line ${lineCount}:`, err);
            }
            continue;
          }
        }
        
        LOGGER.log(`Parsed ${lineCount} lines from bulk operation JSONL, found ${productIds.length} products`);
        
        // If no products found, try fallback to paginated query
        if (productIds.length === 0) {
          LOGGER.warn('No products found in bulk operation, trying fallback paginated query...');
          return await this.getProductRanksPaginated(collectionId);
        }

        // Step 5: Assign ranks based on array index (index 0 = rank 1, index 1 = rank 2, etc.)
        // The order in productIds array represents best-selling order from the collection
        productIds.forEach((productId, index) => {
          const rank = index + 1; // Rank starts from 1 (1 = best seller, 2 = second best, etc.)
          const normalizedId = normalizeShopifyId(productId);
          
          // Store both normalized and original ID for matching
          ranks.set(normalizedId, rank);
          if (normalizedId !== productId) {
            ranks.set(productId, rank);
          }
          
          LOGGER.debug(`Assigned rank ${rank} to product ${productId} (index ${index})`);
        });

        LOGGER.log('Fetched product ranks from bulk operation', {
          collectionId,
          totalRanks: ranks.size,
          totalProducts: productIds.length,
          firstRank: productIds.length > 0 ? 1 : 0,
          lastRank: productIds.length,
          sampleProductIds: productIds.slice(0, 3), // Log first 3 for debugging
        });
        
        if (productIds.length === 0) {
          LOGGER.warn('⚠️ No products found in bulk operation JSONL - collection might be empty or query structure incorrect');
          appendLog('WARNING: No products found in collection bulk operation');
        }
      } finally {
        // Cleanup temp file
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (err) {
          LOGGER.warn('Failed to delete temp file', { file: tempFilePath, error: err });
        }
      }

      return ranks;
    } catch (error: any) {
      LOGGER.error('Error fetching product ranks via bulk operation', error?.message || error);
      // Fallback to paginated query if bulk fails
      LOGGER.log('Falling back to paginated query method');
      return await this.getProductRanksPaginated(collectionId);
    }
  }

  /**
   * Fallback: Get products using paginated query
   */
  private async getProductRanksPaginated(collectionId: string): Promise<Map<string, number>> {
    const ranks = new Map<string, number>();
    let hasNextPage = true;
    let cursor: string | null = null;
    let position = 1; // Start from 1 (best seller)

    LOGGER.log('Fetching product ranks using paginated query', { collectionId });

    while (hasNextPage) {
      try {
        const response = await this.graphqlRepo.post<{
          collection?: {
            products?: {
              edges?: Array<{
                node?: { id: string };
              }>;
              pageInfo?: {
                hasNextPage: boolean;
                endCursor: string;
              };
            };
          };
        }>(this.shop, {
          query: GET_COLLECTION_PRODUCTS_QUERY,
          variables: {
            id: collectionId,
            cursor,
            first: 250,
          },
        });

        if (response.status === 'error') {
          LOGGER.error('Error fetching product ranks', response.errors);
          break;
        }

        const edges = response.data?.collection?.products?.edges || [];
        const pageInfo = response.data?.collection?.products?.pageInfo;

        for (const edge of edges) {
          if (edge.node?.id) {
            const normalizedId = normalizeShopifyId(edge.node.id);
            ranks.set(normalizedId, position);
            if (normalizedId !== edge.node.id) {
              ranks.set(edge.node.id, position);
            }
            position++;
          }
        }

        hasNextPage = pageInfo?.hasNextPage || false;
        cursor = pageInfo?.endCursor || null;

        if (hasNextPage && cursor) {
          await sleep(500);
        }
      } catch (error: any) {
        LOGGER.error('Error in paginated query', error?.message || error);
        break;
      }
    }

    return ranks;
  }

  /**
   * Poll bulk operation until complete
   */
  private async pollBulkOperation(id: string): Promise<{ url: string; objectCount?: number } | null> {
    let attempt = 0;
    let lastStatus: string | null = null;
    const MAX_ATTEMPTS = 120; // Maximum 120 attempts (about 10 minutes with exponential backoff)
    const MAX_ERROR_ATTEMPTS = 10; // Maximum consecutive error attempts before giving up

    let consecutiveErrors = 0;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        const resp = await this.graphqlRepo.post<{ node: any }>(this.shop, {
          query: POLL_QUERY,
          variables: { id },
        });

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

        if (!op) {
          LOGGER.warn('No bulk operation returned yet (node is null), retrying...', { attempt, maxAttempts: MAX_ATTEMPTS, bulkOpId: id });
          await sleep(3000);
          continue;
        }

        // Check if node is actually a BulkOperation (it could be null or a different type)
        if (!op.id || !op.status) {
          LOGGER.warn('Node returned but is not a valid BulkOperation, retrying...', { attempt, maxAttempts: MAX_ATTEMPTS, node: op });
          await sleep(3000);
          continue;
        }

        if (op.status !== lastStatus) {
          LOGGER.log(`Bulk status: ${lastStatus} → ${op.status}`, { attempt });
          lastStatus = op.status;
        }

        if (op.status === 'COMPLETED') {
          LOGGER.log(`Bulk completed. Objects: ${op.objectCount}`, { attempt });
          return { url: op.url, objectCount: op.objectCount };
        }

        if (op.status === 'FAILED') {
          throw new Error(`Bulk failed: ${op.errorCode || 'Unknown error'}`);
        }

        if (op.status === 'CANCELED') {
          throw new Error('Bulk operation canceled by Shopify');
        }

        const wait = Math.min(30000, 1000 * Math.pow(1.5, attempt));
        await sleep(wait);
      } catch (err: any) {
        consecutiveErrors++;
        LOGGER.error('Error polling bulk op:', {
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
        
        const wait = Math.min(30000, 1000 * Math.pow(1.5, attempt));
        await sleep(wait);
      }
    }

    // Timeout - we've exceeded max attempts
    LOGGER.error(`Bulk operation polling timeout after ${MAX_ATTEMPTS} attempts`, { bulkOpId: id });
    throw new Error(`Bulk operation polling timeout after ${MAX_ATTEMPTS} attempts`);
  }

  /**
   * Download bulk operation file
   */
  private async downloadBulkFile(url: string): Promise<string> {
    const baseDir = process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), "dist")
      : process.cwd();
    const tempDir = path.join(baseDir, 'system', 'cache', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `best_seller_ranks_${Date.now()}.jsonl`);
    const writer = fs.createWriteStream(tempFilePath);
    
    const resp = await axios.get(url, { responseType: 'stream', timeout: 300000 });
    
    return new Promise<string>((resolve, reject) => {
      resp.data.pipe(writer);
      let error: any = null;
      writer.on('error', (err) => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) resolve(tempFilePath);
      });
    });
  }

  /**
   * Ensure collection exists and is ready
   * Returns collection ID and product count
   */
  async ensureCollectionReady(): Promise<{ collectionId: string; productCount: number }> {
    LOGGER.log('🔵 Checking collection state...');
    await this.saveState({ status: 'checking', lastVerifiedAt: new Date().toISOString() });

    // Check database state first
    const state = await this.getState();
    LOGGER.log('Collection state from DB', { state: state ? 'exists' : 'not found' });

    // Check if collection exists in Shopify
    LOGGER.log('🔵 Checking if collection exists in Shopify by handle...', { handle: BEST_SELLER_COLLECTION_HANDLE });
    const { exists, collectionId: existingId } = await this.checkCollectionExists();
    LOGGER.log('Collection existence check result', { exists, collectionId: existingId });

    if (exists && existingId) {
      // Collection exists - verify it's valid
      LOGGER.log('✅ Collection exists in Shopify', { collectionId: existingId });
      
      // Update state
      await this.saveState({
        collectionId: existingId,
        status: 'ready',
        lastUsedAt: new Date().toISOString(),
        isStale: false,
      });

      // Poll to get current product count
      LOGGER.log('🔵 Polling collection for current product count...');
      const productCount = await this.pollCollectionPopulation(existingId);
      await this.saveState({ productCount });
      LOGGER.log('✅ Collection has products', { collectionId: existingId, productCount });

      return { collectionId: existingId, productCount };
    }

    // Collection doesn't exist - create it
    LOGGER.log('🔵 Collection does not exist, creating new hidden smart collection...');
    appendLog('Creating new best seller collection');
    await this.saveState({ status: 'creating' });

    try {
      LOGGER.log('🔵 Calling createCollection()...');
      const collectionId = await this.createCollection();
      LOGGER.log('✅ Collection created successfully', { collectionId });
      appendLog(`Collection created: ${collectionId}`);
      
      await this.saveState({
        collectionId,
        status: 'ready',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        isStale: false,
      });

      // Poll for population
      LOGGER.log('🔵 Waiting for collection to populate products (this may take 30-60 seconds)...');
      appendLog('Waiting for collection to populate products');
      const productCount = await this.pollCollectionPopulation(collectionId);
      LOGGER.log('✅ Collection populated with products', { collectionId, productCount });
      appendLog(`Collection populated: ${productCount} products`);
      
      await this.saveState({ productCount });

      LOGGER.log('✅ Collection ready for use', { collectionId, productCount });
      return { collectionId, productCount };
    } catch (error: any) {
      LOGGER.error('❌ Failed to create/ready collection', {
        error: error?.message || error,
        stack: error?.stack,
      });
      await this.saveState({
        status: 'failed',
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Mark collection as being used for indexing
   */
  async markAsIndexing(): Promise<void> {
    await this.saveState({
      status: 'indexing',
      lastUsedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark collection as ready after indexing
   */
  async markAsReady(): Promise<void> {
    await this.saveState({
      status: 'ready',
      lastUsedAt: new Date().toISOString(),
    });
  }

  /**
   * Delete collection (for cleanup job)
   */
  async deleteCollection(collectionId: string): Promise<void> {
    try {
      LOGGER.log('Deleting best seller collection', { collectionId });
      const response = await this.graphqlRepo.post<{
        collectionDelete?: {
          deletedCollectionId?: string;
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      }>(this.shop, {
        query: DELETE_COLLECTION_MUTATION,
        variables: { id: collectionId },
      });

      if (response.status === 'error' || response.errors) {
        const errorMsg = response.errors?.map(e => e.message).join(', ') || 'Unknown error';
        throw new Error(`Failed to delete collection: ${errorMsg}`);
      }

      const userErrors = response.data?.collectionDelete?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMsg = userErrors.map(e => e.message).join(', ');
        throw new Error(`Collection deletion user errors: ${errorMsg}`);
      }

      await this.saveState({
        status: 'deleted',
        collectionId: null,
      });

      LOGGER.log('Collection deleted successfully', { collectionId });
    } catch (error: any) {
      LOGGER.error('Failed to delete collection', error?.message || error);
      throw error;
    }
  }

  /**
   * Find collections unused for 30+ days
   */
  static async findUnusedCollections(esClient: Client, days: number = COLLECTION_UNUSED_DELETE_DAYS): Promise<BestSellerCollectionState[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const response = await esClient.search({
        index: BEST_SELLER_COLLECTION_INDEX,
        query: {
          bool: {
            must: [
              { range: { lastUsedAt: { lt: cutoffDate.toISOString() } } },
              { term: { status: 'ready' } },
            ],
          },
        },
        size: 1000,
      });

      return (response.hits.hits || []).map((hit: any) => hit._source as BestSellerCollectionState);
    } catch (error: any) {
      LOGGER.error('Failed to find unused collections', error?.message || error);
      return [];
    }
  }
}

