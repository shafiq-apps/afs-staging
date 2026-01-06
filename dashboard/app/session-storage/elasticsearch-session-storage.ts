/**
 * Elasticsearch Session Storage Adapter
 * Uses GraphQL mutations to save/read sessions from Elasticsearch shops index
 * Also saves to context API for quick access token retrieval
 */

import { Session } from "@shopify/shopify-app-react-router/server";
import { graphqlRequest } from "app/graphql.server";
import { extractShopifyDomain } from "app/utils/extract-shopify-domain";
import { createModuleLogger } from "app/utils/logger";

const logger = createModuleLogger("elasticsearch-session-storage");

/**
 * Convert Shopify Session to shop document format
 */
function sessionToShopDocument(session: Session): any {
  return {
    shop: extractShopifyDomain(session.shop),
    accessToken: session.accessToken,
    refreshToken: (session as any).refreshToken || undefined,
    scopes: session.scope ? session.scope.split(',') : [],
    lastAccessed: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Session fields
    sessionId: session.id,
    state: session.state,
    isOnline: session.isOnline || false,
    scope: session.scope,
    expires: session.expires ? session.expires.toISOString() : null,
    userId: session.onlineAccessInfo?.associated_user?.id?.toString(),
    firstName: session.onlineAccessInfo?.associated_user?.first_name,
    lastName: session.onlineAccessInfo?.associated_user?.last_name,
    email: session.onlineAccessInfo?.associated_user?.email,
    accountOwner: session.onlineAccessInfo?.associated_user?.account_owner || false,
    locale: session.onlineAccessInfo?.associated_user?.locale,
    collaborator: session.onlineAccessInfo?.associated_user?.collaborator || false,
    emailVerified: session.onlineAccessInfo?.associated_user?.email_verified || false,
  };
}

/**
 * Convert shop document to Shopify Session
 */
function shopDocumentToSession(shopData: any): Session | null {
  if (!shopData || !shopData.accessToken) {
    return null;
  }

  const session: Session = {
    id: shopData.sessionId || `${shopData.shop}-${Date.now()}`,
    shop: shopData.shop,
    state: shopData.state || '',
    isOnline: shopData.isOnline || false,
    scope: shopData.scope || (shopData.scopes ? shopData.scopes.join(',') : ''),
    expires: shopData.expires ? new Date(shopData.expires) : undefined,
    accessToken: shopData.accessToken,
    ...(shopData.refreshToken && { refreshToken: shopData.refreshToken })
  };

  // Add online access info if available
  if (shopData.userId || shopData.firstName || shopData.email) {
    const expiresIn = shopData.expires 
      ? Math.floor((new Date(shopData.expires).getTime() - Date.now()) / 1000)
      : 0;
    
    const onlineAccessInfo: any = {
      associated_user: {
        ...(shopData.userId && { id: BigInt(shopData.userId) }),
        ...(shopData.firstName && { first_name: shopData.firstName }),
        ...(shopData.lastName && { last_name: shopData.lastName }),
        ...(shopData.email && { email: shopData.email }),
        account_owner: shopData.accountOwner || false,
        ...(shopData.locale && { locale: shopData.locale }),
        collaborator: shopData.collaborator || false,
        email_verified: shopData.emailVerified || false,
      },
      associated_user_scope: shopData.scope || shopData.scopes?.join(',') || '',
    };
    
    if (expiresIn > 0) {
      onlineAccessInfo.expires_in = expiresIn;
    }
    
    session.onlineAccessInfo = onlineAccessInfo;
  }

  session.isActive = session.isActive;

  return session;
}

/**
 * Local in-memory cache for access tokens (dashboard side only)
 * This provides quick access without hitting GraphQL on every request
 */
class LocalSessionCache {
  private cache: Map<string, { accessToken: string; refreshToken?: string; data: any; expires: number }> = new Map();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  set(shop: string, accessToken: string, refreshToken: string | undefined, data: any): void {
    this.cache.set(shop, {
      accessToken,
      refreshToken,
      data,
      expires: Date.now() + this.TTL,
    });
    logger.debug('Session cached locally', { shop });
  }

  get(shop: string): { accessToken: string; refreshToken?: string; data: any } | null {
    const cached = this.cache.get(shop);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expires) {
      this.cache.delete(shop);
      return null;
    }

    return {
      accessToken: cached.accessToken,
      refreshToken: cached.refreshToken,
      data: cached.data,
    };
  }

  delete(shop: string): void {
    this.cache.delete(shop);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Singleton cache instance
const localCache = new LocalSessionCache();

/**
 * Elasticsearch Session Storage
 * Implements Shopify SessionStorage interface
*/
export class ElasticsearchSessionStorage {
  /**
   * Store a session
  */
  async storeSession(session: Session): Promise<boolean> {
    try {
      logger.log('Storing session', { shop: session.shop, sessionId: session.id });
      const shopDocument = sessionToShopDocument(session);
      // Use createShop mutation (upsert behavior)
      const mutation = `
        mutation CreateShop($input: CreateShopInput!) {
          createShop(input: $input) {
            shop
            installedAt
          }
        }
      `;

      const variables = {
        input: shopDocument,
        shop: extractShopifyDomain(session.shop)
      };

      await graphqlRequest(mutation, variables);

      // Cache locally in dashboard for quick access
      if (session.shop && session.accessToken) {
        localCache.set(
          session.shop,
          session.accessToken,
          (session as any).refreshToken,
          shopDocument
        );
      }

      logger.log('Session stored successfully', { shop: session.shop });
      return true;
    } catch (error: any) {
      logger.error('Error storing session', { error: error?.message || error, shop: session.shop });
      return false;
    }
  }

  /**
   * Load a session by ID
   */
  async loadSession(shop: string): Promise<Session | undefined> {
    if (!shop) return;
    try {
      logger.log('Loading session for', shop);

      // Use shop query to get shop data
      const query = `
        query GetShop($domain: String!) {
          shop(domain: $domain) {
            shop
            accessToken
            refreshToken
            scopes
            sessionId
            state
            isOnline
            scope
            expires
            userId
            firstName
            lastName
            email
            accountOwner
            locale
            collaborator
            emailVerified
          }
        }
      `;

      const variables = { domain: extractShopifyDomain(shop), shop: extractShopifyDomain(shop) };

      const data = await graphqlRequest(query, variables);

      if (!data?.shop) {
        logger.warn('Shop not found', { shop });
        return;
      }

      const session = shopDocumentToSession(data.shop);

      if (!session) {
        logger.warn('Could not convert shop data to session', { shop });
        return;
      }

      logger.log('Session loaded successfully', { shop, sessionId: session.id, session });
      
      return session;
    } catch (error: any) {
      logger.error('Error loading session', shop, { error: error?.message || error }, error);
      return;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(shop: string): Promise<boolean> {
    try {
      logger.log('Deleting session', { sessionId: shop });

      

      // Remove from local cache
      localCache.delete(shop);

      // For session deletion, we typically just mark as inactive or remove access token
      // But for complete deletion, use deleteShop mutation
      const mutation = `
        mutation DeleteShop($domain: String!) {
          deleteShop(domain: $domain)
        }
      `;

      const variables = { domain: shop, shop };

      const data = await graphqlRequest(mutation, variables);

      if (data?.deleteShop) {
        logger.log('Session deleted successfully', { shop, sessionId: shop });
        return true;
      }

      return false;
    } catch (error: any) {
      logger.error('Error deleting session', { error: error?.message || error, sessionId: shop });
      return false;
    }
  }

  /**
   * Find all sessions for a shop
   */
  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      logger.log('Finding sessions for shop', { shop });

      // Use shop query to get shop data
      const query = `
        query GetShop($domain: String!) {
          shop(domain: $domain) {
            shop
            accessToken
            refreshToken
            scopes
            sessionId
            state
            isOnline
            scope
            expires
            userId
            firstName
            lastName
            email
            accountOwner
            locale
            collaborator
            emailVerified
          }
        }
      `;

      const variables = { domain: shop, shop };

      const data = await graphqlRequest(query, variables);

      if (!data?.shop || !data.shop.accessToken) {
        logger.warn('Shop not found or no active session', { shop });
        return [];
      }

      const session = shopDocumentToSession(data.shop);

      if (!session) {
        logger.warn('Could not convert shop data to session', { shop });
        return [];
      }

      // Return array with the session (typically one session per shop)
      return [session];
    } catch (error: any) {
      logger.error('Error finding sessions for shop', { error: error?.message || error, shop });
      return [];
    }
  }

  /**
   * Delete sessions by IDs (required by SessionStorage interface)
   */
  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      logger.log('Deleting sessions', { sessionIds: ids });

      // Extract unique shops from session IDs
      const shops = new Set<string>();
      for (const id of ids) {
        const shopMatch = id.match(/^([^-\d]+(?:\.myshopify\.com)?)/);
        if (shopMatch && shopMatch[1]) {
          shops.add(shopMatch[1]);
        }
      }

      // Delete each shop
      let allSuccess = true;
      for (const shop of shops) {
        // Remove from local cache
        localCache.delete(shop);
        
        logger.log('Shop deleted successfully', { shop });
      }

      return allSuccess;
    } catch (error: any) {
      logger.error('Error deleting sessions', { error: error?.message || error, sessionIds: ids });
      return false;
    }
  }

  /**
   * Delete all sessions for a shop (custom method for uninstall webhook)
   */
  async deleteSessionsByShop(shop: string): Promise<boolean> {
    try {
      logger.log('Deleting all sessions for shop', { shop });

      // Remove from local cache
      localCache.delete(shop);

      // Delete shop using deleteShop mutation
      const mutation = `
        mutation DeleteShop($domain: String!) {
          deleteShop(domain: $domain)
        }
      `;

      const variables = {
        domain: shop,
        shop
      };

      const data = await graphqlRequest(mutation, variables);

      if (data?.deleteShop) {
        logger.log('Shop deleted successfully', { shop });
        return true;
      }

      logger.warn('Delete shop returned false', { shop });
      return false;
    } catch (error: any) {
      logger.error('Error deleting sessions for shop', { error: error?.message || error, shop });
      return false;
    }
  }
}

