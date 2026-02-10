import { SHOP_DATA_CACHE_KEY } from "app/config";
import { ShopLocaleData } from "app/contexts/ShopContext";
import { CachedShopData } from "app/types";

export function setCachedShopData(data: ShopLocaleData): void {
    if (typeof window === "undefined") return;

    try {
        const cache: CachedShopData = {
            data,
            timestamp: Date.now(),
        };
        sessionStorage.setItem(SHOP_DATA_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
    }
}