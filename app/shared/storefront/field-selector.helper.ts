/**
 * Product Field Selector Helper
 * Dynamically selects which fields to return from products based on configuration
 * Supports query parameters for flexible field selection
 */

import { shopifyProduct, StorefrontProduct } from './types';

/**
 * Default fields to include in storefront responses
 * These are the minimal fields needed for product listing
 * Can be overridden via ?fields= query parameter
 */
export const DEFAULT_STOREFRONT_FIELDS = [
  'id',
  'productId',
  'title',
  'imageUrl',
  'imagesUrls',
  'vendor',
  'minPrice',
  'maxPrice',
  'bestSellerRank'
] as const;

/**
 * Default variant fields to include
 * Can be overridden via ?fields=variants.id,variants.title,... query parameter
 */
export const DEFAULT_VARIANT_FIELDS = [
  'id',
  'displayName',
  'price',
  'sku',
  'availableForSale',
  'sellableOnlineQuantity',
] as const;

/**
 * All available product fields that can be selected
 */
export const AVAILABLE_PRODUCT_FIELDS = [
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
  'imageUrl',
  'imagesUrls',
  'minPrice',
  'maxPrice',
] as const;

/**
 * All available variant fields that can be selected
 */
export const AVAILABLE_VARIANT_FIELDS = [
  'id',
  'title',
  'displayName',
  'sku',
  'barcode',
  'price',
  'compareAtPrice',
  'availableForSale',
  'inventoryQuantity',
  'position',
  'sellableOnlineQuantity',
  'taxable',
  'createdAt',
  'selectedOptions',
  'options',
] as const;

/**
 * Fields that should never be exposed (indexing-only)
 */
const INDEXING_ONLY_FIELDS = [
  'optionPairs',
  'variantOptionKeys',
  'variantOptionLookup',
  'documentType',
] as const;

/**
 * Parse field selection from query parameter
 * Supports formats:
 * - fields=id,title,imageUrl
 * - fields=id,title,variants.id,variants.title,variants.price
 */
export function parseFieldSelection(fieldsParam: string | string[] | undefined): {
  productFields: Set<string>;
  variantFields: Set<string>;
} {
  const productFields = new Set<string>(DEFAULT_STOREFRONT_FIELDS);
  const variantFields = new Set<string>(DEFAULT_VARIANT_FIELDS);

  if (!fieldsParam) {
    return { productFields, variantFields };
  }

  // Normalize to array
  const fields = Array.isArray(fieldsParam)
    ? fieldsParam.flatMap((f) => f.split(','))
    : fieldsParam.split(',');

  // Clear defaults if explicit fields are provided
  productFields.clear();
  variantFields.clear();

  for (const field of fields) {
    const trimmed = field.trim();
    if (!trimmed) continue;

    // Check if it's a variant field (starts with "variants." or "variant.")
    if (trimmed.startsWith('variants.') || trimmed.startsWith('variant.')) {
      const variantField = trimmed.replace(/^variants?\./, '');
      if (variantField && AVAILABLE_VARIANT_FIELDS.includes(variantField as any)) {
        variantFields.add(variantField);
      }
    } else {
      // Product field
      if (AVAILABLE_PRODUCT_FIELDS.includes(trimmed as any)) {
        productFields.add(trimmed);
      }
    }
  }

  // If no fields were specified, use defaults
  if (productFields.size === 0) {
    DEFAULT_STOREFRONT_FIELDS.forEach((f) => productFields.add(f));
  }
  if (variantFields.size === 0) {
    DEFAULT_VARIANT_FIELDS.forEach((f) => variantFields.add(f));
  }

  return { productFields, variantFields };
}

/**
 * Select fields from a product object based on field selection
 */
export function selectProductFields(
  product: shopifyProduct,
  productFields: Set<string>,
  variantFields: Set<string>
): Partial<StorefrontProduct> {
  if (!product) {
    return product as any;
  }

  const selected: any = {};

  // Always include id (required)
  if (product.id) {
    selected.id = product.id;
  }

  // Select product-level fields
  for (const field of productFields) {
    if (field === 'variants') {
      // Handle variants separately
      if (Array.isArray(product.variants)) {
        selected.variants = product.variants.map((variant: any) => {
          const selectedVariant: any = {};
          
          // Always include variant id if available
          if (variant.id) {
            selectedVariant.id = variant.id;
          }

          // Select variant fields
          // Include field even if it's null (GraphQL needs to handle null values)
          for (const vField of variantFields) {
            if (vField in variant) {
              selectedVariant[vField] = variant[vField];
            }
          }

          return selectedVariant;
        });
      }
    } else if (field in product) {
      const value = product[field as keyof shopifyProduct];
      // Include field even if it's null (GraphQL needs to handle null values)
      // Skip indexing-only fields
      if (!INDEXING_ONLY_FIELDS.includes(field as any)) {
        selected[field] = value;
      }
    }
  }

  // If variant fields are requested but 'variants' field wasn't explicitly included,
  // automatically include variants with selected fields
  if (variantFields.size > 0 && !selected.variants && Array.isArray(product.variants)) {
    selected.variants = product.variants.map((variant: any) => {
      const selectedVariant: any = {};
      if (variant.id) {
        selectedVariant.id = variant.id;
      }
      // Include field even if it's null (GraphQL needs to handle null values)
      for (const vField of variantFields) {
        if (vField in variant) {
          selectedVariant[vField] = variant[vField];
        }
      }
      return selectedVariant;
    });
  }

  // Remove any indexing-only fields that might have been included
  INDEXING_ONLY_FIELDS.forEach((field) => {
    delete selected[field];
  });

  return selected;
}

/**
 * Select fields from multiple products
 */
export function selectProductsFields(
  products: shopifyProduct[],
  productFields: Set<string>,
  variantFields: Set<string>
): Partial<StorefrontProduct>[] {
  if (!Array.isArray(products)) {
    return products as any;
  }

  return products.map((product) => selectProductFields(product, productFields, variantFields));
}

