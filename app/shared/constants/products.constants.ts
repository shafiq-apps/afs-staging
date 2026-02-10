/**
 * Product Constants
 * Constants used for product filtering and searching
*/

import { normalizeShopName } from "@shared/utils/shop.util";

export const PRODUCT_OPTION_PAIR_SEPARATOR = '::';

export const PRODUCT_INDEX_SUFFIX = '-products'; //suffix 

export const PRODUCT_INDEX_NAME = (shop: string) => `${normalizeShopName(shop)}${PRODUCT_INDEX_SUFFIX}`;

/**
 * Elasticsearch Field Names
 * Centralized field names for ES queries to ensure consistency
 */
export const ES_FIELDS = {
  // Product-level fields
  VENDOR_KEYWORD: 'vendor.keyword',
  VENDOR: 'vendor',
  PRODUCT_TYPE_KEYWORD: 'productType.keyword',
  PRODUCT_TYPE: 'productType',
  TITLE_KEYWORD: 'title.keyword',
  TAGS: 'tags', // Use keyword subfield for exact matching and aggregations
  COLLECTIONS: 'collections',
  STATUS: 'status',
  DOCUMENT_TYPE: 'documentType',
  
  // Price fields
  MIN_PRICE: 'minPrice',
  MAX_PRICE: 'maxPrice',
  
  // Variant fields
  VARIANT_OPTION_KEYS_KEYWORD: 'variantOptionKeys.keyword',
  OPTION_PAIRS: 'optionPairs',
  
  // Variant nested fields
  VARIANTS_SKU: 'variants.sku',
  VARIANTS_AVAILABLE_FOR_SALE: 'variants.availableForSale',
  VARIANTS_INVENTORY_QUANTITY: 'variants.inventoryQuantity',
  VARIANTS_SELLABLE_ONLINE_QUANTITY: 'variants.sellableOnlineQuantity',
  
  // Sort fields
  BEST_SELLER_RANK: 'bestSellerRank',
  CREATED_AT: 'createdAt',
} as const;

/**
 * Aggregation Bucket Size Constants
 * Defines bucket sizes for different aggregation types
 */
export const AGGREGATION_BUCKET_SIZES = {
  DEFAULT: 5000,
  TAGS_MULTIPLIER: 2, // Tags need larger buckets (10,000)
  COLLECTIONS_MULTIPLIER: 2, // Collections need larger buckets (10,000)
  OPTION_PAIRS_MULTIPLIER: 2, // Option pairs need larger buckets (10,000)
} as const;