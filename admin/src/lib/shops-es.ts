import { GraphQLClient, createGraphQLClient } from './graphql.client';

export interface Shop {
  shop: string;
  installedAt?: string;
  scopes?: string[];
  lastAccessed?: string;
  updatedAt?: string;
  isDeleted?: string;
  uninstalledAt?: string;
  reinstalledAt?: string;
  reinstalled?: string;
  metadata?: {
    shopId?: string;
    currencyCode?: string;
    email?: string;
  };
  locals?: {
    ip?: string;
    userAgent?: string;
  };
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

export async function getAllShopsFromES(limit?: number, offset?: number): Promise<Shop[]> {
  const client = createGraphQLClient();
  if (!client) {
    console.warn('GraphQL client not initialized. Cannot fetch shops from ES.');
    return [];
  }

  const query = `
    query AdminShops($limit: Int, $offset: Int) {
      adminShops(limit: $limit, offset: $offset) {
        shop
        installedAt
        scopes
        lastAccessed
        updatedAt
        isDeleted
        uninstalledAt
        reinstalledAt
        reinstalled
        metadata {
          shopId
          currencyCode
          email
        }
        locals {
          ip
          userAgent
        }
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

  const variables = { limit, offset };

  try {
    const response = await client.query<{ adminShops: Shop[] }>(query, variables);
    return response.adminShops;
  } catch (error) {
    console.error('Error fetching shops from ES:', error);
    return [];
  }
}

export async function getShopByDomainFromES(shop: string): Promise<Shop | null> {
  const client = createGraphQLClient();
  if (!client) {
    console.warn('GraphQL client not initialized. Cannot fetch shop from ES.');
    return null;
  }

  const query = `
    query AdminShop($shop: String!) {
      adminShop(shop: $shop) {
        shop
        installedAt
        scopes
        lastAccessed
        updatedAt
        isDeleted
        uninstalledAt
        reinstalledAt
        reinstalled
        metadata {
          shopId
          currencyCode
          email
        }
        locals {
          ip
          userAgent
        }
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

  const variables = { shop };

  try {
    const response = await client.query<{ adminShop: Shop }>(query, variables);
    return response.adminShop;
  } catch (error) {
    console.error('Error fetching shop from ES:', error);
    return null;
  }
}

