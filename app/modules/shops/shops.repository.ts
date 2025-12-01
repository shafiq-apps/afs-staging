/**
 * Shops Repository
 * Handles business logic operations for shops (OAuth, external APIs, etc.)
 * 
 * NOTE: GraphQL CRUD operations (getShop, deleteShop, shopExists, updateShop via GraphQL)
 * are handled automatically by auto-resolvers using the centralized ES service.
 * This repository only contains business logic methods.
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { Shop, CreateShopInput, UpdateShopInput } from './shops.type';
import { SHOPS_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('ShopsRepository');

export class ShopsRepository {
  private esClient: Client;
  private index: string;

  constructor(esClient: Client, index: string = SHOPS_INDEX_NAME) {
    this.esClient = esClient;
    this.index = index;
  }

  /**
   * Get shop by domain
   * @param shop Shop domain (e.g., example.myshopify.com)
   */
  async getShop(shop: string): Promise<Shop | null> {
    try {
      logger.log("shop", shop, "index", this.index);
      const response = await this.esClient.get({
        index: this.index,
        id: shop,
      });

      if (response.found && response._source) {
        const source = response._source as any;
        const shopData = {
          shop: source.shop || shop,
          accessToken: source.accessToken,
          installedAt: source.installedAt,
          isActive: source.isActive !== false, // Default to true
          scopes: source.scopes,
          refreshToken: source.refreshToken,
          metadata: source.metadata,
          locals: source.locals,
          lastAccessed: source.lastAccessed,
          ...source,
        } as Shop;

        return shopData;
      }

      return null;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      logger.error('Error getting shop from ES', error?.message || error);
      throw error;
    }
  }

  /**
   * Save a new shop (used during OAuth installation)
   * @param input Shop data
   */
  async saveShop(input: CreateShopInput): Promise<Shop> {
    const document = {
      shop: input.shop,
      accessToken: input.accessToken,
      scopes: input.scopes || [],
      refreshToken: input.refreshToken,
      installedAt: new Date().toISOString(),
      isActive: true,
      metadata: input.metadata || {},
      locals: {},
      // Include session fields if provided
      ...(input as any),
    };

    await this.esClient.index({
      index: this.index,
      id: input.shop,
      document,
      refresh: true,
    });

    logger.log(`Shop saved: ${input.shop}`);
    return this.getShop(input.shop) as Promise<Shop>;
  }

  /**
   * Update shop data
   * @param shop Shop domain
   * @param updates Partial updates
   */
  async updateShop(shop: string, updates: UpdateShopInput): Promise<Shop | null> {
    try {
      const existing = await this.getShop(shop);
      if (!existing) {
        return null;
      }

      const document = {
        ...existing,
        ...updates,
        // Preserve installedAt if not updating
        installedAt: existing.installedAt,
        updatedAt: new Date().toISOString(),
      };

      await this.esClient.index({
        index: this.index,
        id: shop,
        document,
        refresh: true,
      });

      logger.log(`Shop updated: ${shop}`);
      return this.getShop(shop);
    } catch (error: any) {
      logger.error('Error updating shop', error?.message || error);
      throw error;
    }
  }

  /**
   * Uninstall app from shop (soft delete, preserving data)
   * @param shop Shop domain
   */
  async uninstallShop(shop: string): Promise<void> {
    await this.updateShop(shop, { isActive: false });
    logger.log(`Shop uninstalled: ${shop}`);
  }

  /**
   * Update last accessed timestamp for a shop
   * @param shop Shop domain
   */
  async recordShopAccess(shop: string): Promise<void> {
    await this.updateShop(shop, { lastAccessed: new Date().toISOString() });
  }
}

