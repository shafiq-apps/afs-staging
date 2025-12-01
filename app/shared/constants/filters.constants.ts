import { normalizeShopName } from "@shared/utils/shop.util";

export const FILTERS_INDEX_SUFFIX = "_filters";

export const FILTERS_INDEX_NAME = (shop: string) => `${normalizeShopName(shop)}${FILTERS_INDEX_SUFFIX}`;