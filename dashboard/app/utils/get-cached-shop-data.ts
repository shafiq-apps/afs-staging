import { CACHE_DURATION, SHOP_DATA_CACHE_KEY } from "app/config";
import { ShopLocaleData } from "app/contexts/ShopContext";
import { CachedShopData } from "app/types";

export function getCachedShopData(): ShopLocaleData | null {
    if (typeof window === "undefined") return null;

    try {
        const cached = sessionStorage.getItem(SHOP_DATA_CACHE_KEY);
        if (!cached) return null;

        const parsed: CachedShopData = JSON.parse(cached);
        const now = Date.now();

        // Check if cache is still valid (1 hour)
        if (now - parsed.timestamp < CACHE_DURATION) {
            return parsed.data;
        }

        // Cache expired, remove it
        sessionStorage.removeItem(SHOP_DATA_CACHE_KEY);
        return null;
    } catch (error) {
        return null;
    }
}