/**
 * Shops Types
 * Types for shop data structures
 */

export interface Shop {
  shop: string;
  accessToken: string;
  installedAt?: string;
  scopes?: string[];
  refreshToken?: string;
  metadata?: Record<string, any>;
  locals?: Record<string, any>;
  lastAccessed?: string;
  [key: string]: any;
}

export interface CreateShopInput {
  shop: string;
  accessToken: string;
  scopes?: string[];
  refreshToken?: string;
  metadata?: Record<string, any>;
}

export interface UpdateShopInput {
  accessToken?: string;
  scopes?: string[];
  refreshToken?: string;
  metadata?: Record<string, any>;
  locals?: Record<string, any>;
  lastAccessed?: string;
}

