/**
 * Product Field Filter
 * Filters product documents to only include essential fields
 * Prevents Elasticsearch field limit errors (1000 field limit)
 */

import { createModuleLogger } from '@shared/utils/logger.util';
import type { shopifyProduct } from './types';

const logger = createModuleLogger('ProductFieldFilter');

/**
 * List of allowed top-level fields for products
 * Only these fields will be indexed to prevent field limit errors
 */
const ALLOWED_FIELDS = [
  'id',
  'productId',
  'title',
  'handle',
  'status',
  'tags',
  'productType',
  'vendor',
  'category',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'templateSuffix',
  'totalInventory',
  'variantsCount',
  'priceRangeV2',
  'options',
  'collections',
  'collectionSortOrder',
  'bestSellerRank',
  'variants',
  'metafields',
  'media',
  'images',
  'imageUrl',
  'imagesUrls',
  'optionPairs',
  'variantOptionKeys',
  'variantOptionLookup',
  'documentType',
  'minPrice',
  'maxPrice',
] as const;

/**
 * Filter product document to only include allowed fields
 * Removes any extra/dynamic fields that might cause field limit errors
 */
export function filterProductFields(doc: any): shopifyProduct {
  const filtered: any = {};

  for (const field of ALLOWED_FIELDS) {
    if (field in doc) {
      filtered[field] = doc[field];
    }
  }

  // Count filtered fields for logging
  const originalFieldCount = Object.keys(doc).length;
  const filteredFieldCount = Object.keys(filtered).length;
  
  if (originalFieldCount > filteredFieldCount) {
    logger.debug(`Filtered product document: ${originalFieldCount} -> ${filteredFieldCount} fields`, {
      productId: doc.productId || doc.id,
      removedFields: originalFieldCount - filteredFieldCount,
    });
  }

  return filtered as shopifyProduct;
}

/**
 * Filter array of product documents
 */
export function filterProductFieldsBatch(docs: any[]): shopifyProduct[] {
  return docs.map(filterProductFields);
}

