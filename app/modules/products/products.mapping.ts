/**
 * Product Elasticsearch Mapping
 * Defines the Elasticsearch index mapping for products
 * Used to filter documents and prevent field limit errors
 */

export const PRODUCT_MAPPING = {
  properties: {
    // Core product fields
    id: { type: 'keyword' },
    productId: { type: 'keyword' },
    title: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword' },
      },
    },
    handle: { type: 'keyword' },
    status: { type: 'keyword' },
    vendor: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword' },
      },
    },
    productType: {
      type: 'text',
      fields: {
        keyword: { type: 'keyword' },
      },
    },
    tags: {
      type: 'keyword', // Direct keyword type for array fields (matches old app)
      eager_global_ordinals: true, // Faster aggregations on arrays
      norms: false,
    },
    collections: {
      type: 'keyword', // Direct keyword type for array fields (matches old app)
      eager_global_ordinals: true, // Faster aggregations on arrays
      norms: false,
    },
    category: {
      properties: {
        name: { type: 'keyword' },
      },
    },
    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
    publishedAt: { type: 'date' },
    templateSuffix: { type: 'keyword' },
    totalInventory: { type: 'integer' },
    variantsCount: {
      properties: {
        count: { type: 'integer' },
        precision: { type: 'keyword' },
      },
    },
    priceRangeV2: {
      properties: {
        minVariantPrice: {
          properties: {
            amount: { type: 'keyword' },
            currencyCode: { type: 'keyword' },
          },
        },
        maxVariantPrice: {
          properties: {
            amount: { type: 'keyword' },
            currencyCode: { type: 'keyword' },
          },
        },
      },
    },
    options: {
      type: 'nested',
      properties: {
        id: { type: 'keyword' },
        name: { type: 'keyword' },
        values: { type: 'keyword' },
      },
    },
    collectionSortOrder: {
      type: 'object',
      enabled: false, // Store as JSON, don't index fields
    },
    bestSellerRank: { type: 'integer' },
    variants: {
      type: 'nested',
      properties: {
        id: { type: 'keyword' },
        title: { type: 'text' },
        displayName: { type: 'text' },
        sku: { type: 'keyword' },
        barcode: { type: 'keyword' },
        price: { 
          type: 'text',
          fields: {
            keyword: { type: 'keyword' }, // For exact match
            numeric: { type: 'float' }, // For range queries and aggregations
          },
        },
        compareAtPrice: { type: 'keyword' },
        availableForSale: { type: 'boolean' },
        inventoryQuantity: { type: 'integer' },
        position: { type: 'integer' },
        sellableOnlineQuantity: { type: 'integer' },
        taxable: { type: 'boolean' },
        createdAt: { type: 'date' },
        options: {
          properties: {
            name: { type: 'keyword' },
            value: { type: 'keyword' },
          },
        },
        optionPairs: {
          type: 'text',
          fields: {
            keyword: {
              type: 'keyword',
              norms: false,
            },
          },
        },
        optionKey: { type: 'keyword' },
        media: {
          type: 'object',
          enabled: false, // Store as JSON, don't index nested fields
        },
      },
    },
    metafields: {
      type: 'nested',
      properties: {
        id: { type: 'keyword' },
        namespace: { type: 'keyword' },
        key: { type: 'keyword' },
        value: { type: 'text' },
        type: { type: 'keyword' },
      },
    },
    media: {
      type: 'object',
      enabled: false, // Store as JSON, don't index nested fields
    },
    imageUrl: { type: 'keyword' },
    imagesUrls: { type: 'keyword' },
    optionPairs: {
      type: 'keyword', // Direct keyword type for array fields (matches old app)
      eager_global_ordinals: true, // Faster aggregations
      norms: false,
    },
    variantOptionKeys: { type: 'keyword' },
    variantOptionLookup: {
      type: 'object',
      enabled: false, // Store as JSON, don't index nested fields
    },
    documentType: { type: 'keyword' },
    minPrice: { type: 'float' },
    maxPrice: { type: 'float' },
  },
};

/**
 * Get product mapping for field filtering
 */
export function getProductMapping() {
  return PRODUCT_MAPPING;
}

