/**
 * Context API Service
 * Provides fast in-memory access to shop access tokens and session data
 * Used for quick access without hitting Elasticsearch on every request
 */

import { CacheManager } from '../cache/cache.manager';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('context-service');

export interface ShopContext {
  shop: string;
  accessToken: string;
  refreshToken?: string;
  isActive: boolean;
  scopes?: string[];
  installedAt?: string;
  lastAccessed?: string;
  // Session fields
  sessionId?: string;
  state?: string;
  isOnline?: boolean;
  scope?: string;
  expires?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  accountOwner?: boolean;
  locale?: string;
  collaborator?: boolean;
  emailVerified?: boolean;
}

class ContextService {
  private cache: CacheManager<ShopContext>;
  private readonly defaultTTL: number = 30 * 60 * 1000; // 30 minutes default

  constructor() {
    this.cache = new CacheManager<ShopContext>({
      ttl: this.defaultTTL,
      maxSize: 10000, // Support up to 10k shops
      checkInterval: 60 * 60 * 1000, // Cleanup every 60 minutes
    });
    logger.info('Context service initialized');
  }

  /**
   * Get shop context (access token and session data)
   * @param shop Shop domain
   */
  getShopContext(shop: string): ShopContext | null {
    const context = this.cache.get(shop);
    if (context) {
      logger.debug('Context cache hit', { shop });
    } else {
      logger.debug('Context cache miss', { shop });
    }
    return context;
  }

  /**
   * Get access token for a shop (quick access)
   * @param shop Shop domain
   */
  getAccessToken(shop: string): string | null {
    const context = this.getShopContext(shop);
    return context?.accessToken || null;
  }

  /**
   * Set shop context (saves access token and session data)
   * @param context Shop context data
   * @param ttl Optional TTL in milliseconds
   */
  setShopContext(context: ShopContext, ttl?: number): void {
    this.cache.set(context.shop, context, ttl || this.defaultTTL);
    logger.info('Shop context cached', { 
      shop: context.shop,
      hasAccessToken: !!context.accessToken,
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * Update access token for a shop
   * @param shop Shop domain
   * @param accessToken New access token
   * @param refreshToken Optional refresh token
   */
  updateAccessToken(shop: string, accessToken: string, refreshToken?: string): void {
    const existing = this.getShopContext(shop);
    if (existing) {
      existing.accessToken = accessToken;
      if (refreshToken) {
        existing.refreshToken = refreshToken;
      }
      this.setShopContext(existing);
      logger.info('Access token updated in context', { shop });
    } else {
      // Create new context with just access token
      this.setShopContext({
        shop,
        accessToken,
        refreshToken,
        isActive: true,
      });
      logger.info('New context created with access token', { shop });
    }
  }

  /**
   * Update shop context from GraphQL shop data
   * @param shop Shop domain
   * @param shopData Shop data from GraphQL (may not include sensitive fields)
   * @param accessToken Access token (if available)
   * @param refreshToken Refresh token (if available)
   */
  updateFromShopData(
    shop: string,
    shopData: any,
    accessToken?: string,
    refreshToken?: string
  ): void {
    const context: ShopContext = {
      shop: shopData.shop || shop,
      accessToken: accessToken || shopData.accessToken || '',
      refreshToken: refreshToken || shopData.refreshToken,
      isActive: shopData.isActive !== false,
      scopes: shopData.scopes,
      installedAt: shopData.installedAt,
      lastAccessed: shopData.lastAccessed,
      // Session fields
      sessionId: shopData.sessionId,
      state: shopData.state,
      isOnline: shopData.isOnline,
      scope: shopData.scope,
      expires: shopData.expires,
      userId: shopData.userId,
      firstName: shopData.firstName,
      lastName: shopData.lastName,
      email: shopData.email,
      accountOwner: shopData.accountOwner,
      locale: shopData.locale,
      collaborator: shopData.collaborator,
      emailVerified: shopData.emailVerified,
    };

    this.setShopContext(context);
    logger.info('Context updated from shop data', { shop, hasAccessToken: !!context.accessToken });
  }

  /**
   * Remove shop context
   * @param shop Shop domain
   */
  removeShopContext(shop: string): void {
    this.cache.delete(shop);
    logger.info('Shop context removed', { shop });
  }

  /**
   * Clear all contexts
   */
  clear(): void {
    this.cache.clear();
    logger.info('All contexts cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }
}

// Singleton instance
let contextServiceInstance: ContextService | null = null;

/**
 * Get or create context service instance
 */
export function getContextService(): ContextService {
  if (!contextServiceInstance) {
    contextServiceInstance = new ContextService();
  }
  return contextServiceInstance;
}

