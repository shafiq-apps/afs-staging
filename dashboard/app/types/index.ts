import { ShopLocaleData } from "app/contexts/ShopContext";

export interface ActionData {
    success?: boolean;
    error?: string;
    message?: string;
}

export interface CachedShopData {
  data: ShopLocaleData;
  timestamp: number;
}

export interface SupportData {
  shop?: string;
  appName: string;
  appVersion: string;
  supportInfo: {
    phone: string;
    email: string;
    hours: string[];
    documentationLinks: {
      title: string;
      url: string;
      description: string;
    }[];
  };
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