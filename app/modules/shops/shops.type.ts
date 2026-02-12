/**
 * Shops Types
 * Types for shop data structures
 */

export type LegacyShopStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
export type ShopStatus = 'ACTIVE' | 'UNINSTALLED';

export interface Shop {
  shop?: string;
  accessToken?: string;
  installedAt?: Date;
  scopes?: string[];
  refreshToken?: string;
  metadata?: Record<string, any>;
  locals?: Record<string, any>;
  lastAccessed?: Date;
  uninstalledAt?: Date;
  updatedAt?: Date,
  sessionId?: string,
  scope?: string,
  isDeleted?: boolean,
  state?: ShopStatus;
  [key: string]: any;
}

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

export interface CreateShopInput extends Shop { }

export interface UpdateShopInput extends Shop { }
