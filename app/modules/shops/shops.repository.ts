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
import { Shop, CreateShopInput, UpdateShopInput, LegacyShop, LegacyShopInput } from './shops.type';
import { LEGACY_SHOPS_INDEX_NAME, SHOPS_INDEX_NAME } from '@shared/constants/es.constant';

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
      logger.info("shop", shop, "index", this.index);
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

  async getShopDetails(shop: string, fields: string[]): Promise<Shop | null> {
    const response = await this.esClient.get({
      index: this.index,
      id: shop,
      _source_includes: fields,
    });

    if (response.found && response._source) {
      return response._source as Shop;
    }

    return null;
  }


  /**
   * Get shop by domain
   * @param shop Shop domain (e.g., example.myshopify.com)
   */
  async getLegacyShop(shop: string): Promise<LegacyShop | null> {
    try {
      logger.info("shop", shop, "index", this.index);
      const response = await this.esClient.get({
        index: LEGACY_SHOPS_INDEX_NAME,
        id: shop,
      });

      if (response.found && response._source) {
        const source = response._source as any;
        const shopData = {
          shop: source.shop || shop,
          ...source,
        } as LegacyShop;

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
   * create or update legacy shop (used for migration flow)
   * @param input LegacyShopInput
   * @return created or updated LegacyShop
   */
  async createOrUpdateLegacyShop(input: LegacyShopInput): Promise<LegacyShop> {
    const doc: LegacyShopInput = {
      shop: input.shop,
    };

    if (input.isUpgradeAllowed !== undefined)
      doc.isUpgradeAllowed = input.isUpgradeAllowed;

    if (input.hasUpgradeRequest !== undefined)
      doc.hasUpgradeRequest = input.hasUpgradeRequest;

    if (input.status !== undefined)
      doc.status = input.status;

    if (input.statusMessage !== undefined)
      doc.statusMessage = input.statusMessage;

    await this.esClient.update({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: input.shop,
      doc,
      doc_as_upsert: true, // create if not exists
      refresh: true,
    });

    return this.getLegacyShop(input.shop) as Promise<LegacyShop>;
  }

  async deleteLegacyShop(shop: string): Promise<Boolean> {
    const deleted = await this.esClient.delete({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: shop,
      refresh: false
    });
    logger.info(`Legacy shop deleted: ${shop}`, deleted);
    return deleted ? true : false;
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
      metadata: input.metadata || {},
      locals: {},
      // Include session fields if provided
      ...(input as any),
    };

    await this.esClient.update({
      index: this.index,
      id: input.shop,
      doc: document,
      refresh: true,
      doc_as_upsert: true
    });

    logger.info(`Shop saved: ${input.shop}`);
    return this.getShop(input.shop) as Promise<Shop>;
  }

  /**
   * Update shop data
   * @param shop Shop domain
   * @param updates Partial updates
   */
  async updateShop(shop: string, updates: UpdateShopInput): Promise<Shop | null> {
    try {

      const document = {
        ...updates,
        updatedAt: new Date()
      };

      await this.esClient.update({
        index: this.index,
        id: shop,
        doc: document,
        refresh: true,
      });

      logger.info(`Shop updated: ${shop}`);
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
    await this.updateShop(shop, { accessToken: "" });
    logger.info(`Shop uninstalled: ${shop}`);
  }

  /**
   * Update last accessed timestamp for a shop
   * @param shop Shop domain
   */
  async recordShopAccess(shop: string): Promise<void> {
    await this.updateShop(shop, { lastAccessed: new Date() });
  }
}

