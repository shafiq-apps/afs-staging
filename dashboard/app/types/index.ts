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