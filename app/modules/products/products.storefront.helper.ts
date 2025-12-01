/**
 * Product Storefront Helper
 * Filters out indexing-only fields and returns only storefront-relevant product data
 * Supports dynamic field selection via query parameters
 */

import { shopifyProduct, StorefrontProduct } from './products.type';
import {
  parseFieldSelection,
  selectProductFields,
  selectProductsFields,
  DEFAULT_STOREFRONT_FIELDS,
  DEFAULT_VARIANT_FIELDS,
} from './products.field-selector.helper';

/**
 * Fields that are used only for indexing/filtering and should not be exposed to storefront
 */
const INDEXING_ONLY_FIELDS = [
  'optionPairs',
  'variantOptionKeys',
  'variantOptionLookup',
  'documentType',
] as const;

/**
 * Filter product to only include storefront-relevant fields
 * @param product - Full product object from Elasticsearch
 * @param fieldsParam - Optional field selection from query params (e.g., "id,title,imageUrl,variants.id,variants.price")
 * @returns Product with only selected fields
 */
export function filterProductForStorefront(
  product: shopifyProduct,
  fieldsParam?: string | string[]
): Partial<StorefrontProduct> {
  if (!product) {
    return product as Partial<StorefrontProduct>;
  }

  // Parse field selection
  const { productFields, variantFields } = parseFieldSelection(fieldsParam);

  // Select fields dynamically
  return selectProductFields(product, productFields, variantFields);
}

/**
 * Filter array of products for storefront
 * @param products - Array of products from Elasticsearch
 * @param fieldsParam - Optional field selection from query params
 * @returns Array of products with only selected fields
 */
export function filterProductsForStorefront(
  products: shopifyProduct[],
  fieldsParam?: string | string[]
): Partial<StorefrontProduct>[] {
  if (!Array.isArray(products)) {
    return products as Partial<StorefrontProduct>[];
  }

  // Parse field selection
  const { productFields, variantFields } = parseFieldSelection(fieldsParam);

  // Select fields dynamically
  return selectProductsFields(products, productFields, variantFields);
}

