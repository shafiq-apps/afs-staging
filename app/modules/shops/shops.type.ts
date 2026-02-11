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

export type LegacyShopStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface LegacyShop {
  shop: string;
  isUpgradeAllowed?: boolean;
  hasUpgradeRequest?: boolean;
  status?: LegacyShopStatus;
  statusMessage?: string;
}

export type LegacyShopInput = {
  shop: string;
  isUpgradeAllowed?: boolean;
  hasUpgradeRequest?: boolean;
  status?: LegacyShopStatus;
  statusMessage?: string;
};

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

