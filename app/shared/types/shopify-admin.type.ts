/**
 * Shopify Admin API Types
 * Type definitions for Shopify Admin API GraphQL responses
 * 
 * These types represent the raw structure returned by Shopify Admin API GraphQL queries,
 * before transformation to our internal product format.
 */

import type { productOption, productCategory, productPriceRangeV2 } from '@shared/storefront/types';

/**
 * Shopify Admin API GraphQL Media Image Node
 * Represents a media image in the GraphQL response
 */
export interface ShopifyAdminMediaImageNode {
  url?: string;
  altText?: string | null;
}

/**
 * Shopify Admin API GraphQL Media Preview Node
 * Represents media preview information
 */
export interface ShopifyAdminMediaPreviewNode {
  image?: ShopifyAdminMediaImageNode | null;
}

/**
 * Shopify Admin API GraphQL Media Node
 * Represents a media item (image, video, etc.) in the GraphQL response
 */
export interface ShopifyAdminMediaNode {
  id?: string;
  alt?: string | null;
  preview?: ShopifyAdminMediaPreviewNode | null;
  status?: string | null;
}

/**
 * Shopify Admin API GraphQL Media Edge
 * GraphQL connection edge for media items
 */
export interface ShopifyAdminMediaEdge {
  node?: ShopifyAdminMediaNode | null;
}

/**
 * Shopify Admin API GraphQL Media Connection
 * GraphQL connection structure for media items
 */
export interface ShopifyAdminMediaConnection {
  edges?: ShopifyAdminMediaEdge[] | null;
}

/**
 * Shopify Admin API GraphQL Variant Selected Option
 * Represents a selected option for a product variant
 */
export interface ShopifyAdminVariantSelectedOption {
  name?: string | null;
  value?: string | null;
}

/**
 * Shopify Admin API GraphQL Variant Node
 * Represents a product variant in the GraphQL response
 */
export interface ShopifyAdminVariantNode {
  id?: string;
  title?: string | null;
  displayName?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  availableForSale?: boolean | null;
  inventoryQuantity?: number | null;
  position?: number | null;
  sellableOnlineQuantity?: number | null;
  taxable?: boolean | null;
  createdAt?: string | null;
  selectedOptions?: ShopifyAdminVariantSelectedOption[] | null;
}

/**
 * Shopify Admin API GraphQL Variant Edge
 * GraphQL connection edge for product variants
 */
export interface ShopifyAdminVariantEdge {
  node?: ShopifyAdminVariantNode | null;
}

/**
 * Shopify Admin API GraphQL Variant Connection
 * GraphQL connection structure for product variants
 */
export interface ShopifyAdminVariantConnection {
  edges?: ShopifyAdminVariantEdge[] | null;
}

/**
 * Shopify Admin API GraphQL Collection Node
 * Represents a collection reference in the GraphQL response
 */
export interface ShopifyAdminCollectionNode {
  id?: string;
}

/**
 * Shopify Admin API GraphQL Collection Edge
 * GraphQL connection edge for collections
 */
export interface ShopifyAdminCollectionEdge {
  node?: ShopifyAdminCollectionNode | null;
}

/**
 * Shopify Admin API GraphQL Collection Connection
 * GraphQL connection structure for collections
 */
export interface ShopifyAdminCollectionConnection {
  edges?: ShopifyAdminCollectionEdge[] | null;
}

/**
 * Shopify Admin API GraphQL Metafield Node
 * Represents a product metafield in the GraphQL response
 */
export interface ShopifyAdminMetafieldNode {
  id?: string;
  namespace?: string | null;
  key?: string | null;
  value?: string | null;
  type?: string | null;
}

/**
 * Shopify Admin API GraphQL Metafield Edge
 * GraphQL connection edge for metafields
 */
export interface ShopifyAdminMetafieldEdge {
  node?: ShopifyAdminMetafieldNode | null;
}

/**
 * Shopify Admin API GraphQL Metafield Connection
 * GraphQL connection structure for metafields
 */
export interface ShopifyAdminMetafieldConnection {
  edges?: ShopifyAdminMetafieldEdge[] | null;
}

/**
 * Shopify Admin API GraphQL Product Node
 * 
 * Represents the raw product data structure returned by Shopify Admin API GraphQL queries.
 * This type matches the structure returned by GET_PRODUCT_QUERY in indexing.graphql.ts.
 * 
 * The product data is in its raw GraphQL format with edges/nodes structure for connections.
 * Use transformProductToESDoc() to convert this to the internal shopifyProduct format.
 * 
 * @see GET_PRODUCT_QUERY in app/modules/indexing/indexing.graphql.ts
 * @see transformProductToESDoc in app/modules/indexing/indexing.helper.ts
 */
export interface ShopifyAdminProductNode {
  /** Product GraphQL ID (e.g., "gid://shopify/Product/123456") */
  id: string;
  /** Product title */
  title?: string | null;
  /** Product handle (URL slug) */
  handle?: string | null;
  /** Product category information */
  category?: productCategory | null;
  /** Product creation timestamp (ISO 8601) */
  createdAt?: string | null;
  /** Product last update timestamp (ISO 8601) */
  updatedAt?: string | null;
  /** Product publication timestamp (ISO 8601) */
  publishedAt?: string | null;
  /** Product tags array */
  tags?: string[];
  /** Product vendor name */
  vendor?: string | null;
  /** Product type */
  productType?: string | null;
  /** Product status (e.g., "ACTIVE", "DRAFT", "ARCHIVED") */
  status?: string | null;
  /** Template suffix for product page */
  templateSuffix?: string | null;
  /** Total inventory across all variants */
  totalInventory?: number | null;
  /** Whether the product tracks inventory */
  tracksInventory?: boolean | null;
  /** Price range information */
  priceRangeV2?: productPriceRangeV2 | null;
  /** Product options (e.g., Size, Color) */
  options?: productOption[];
  /** Media items (images, videos) - GraphQL connection structure */
  media?: ShopifyAdminMediaConnection | null;
  /** Product variants - GraphQL connection structure */
  variants?: ShopifyAdminVariantConnection | null;
  /** Collections this product belongs to - GraphQL connection structure */
  collections?: ShopifyAdminCollectionConnection | null;
  /** Product metafields - GraphQL connection structure */
  metafields?: ShopifyAdminMetafieldConnection | null;
}

/**
 * Shopify Admin API GraphQL Product Response
 * 
 * Wrapper type for GraphQL responses that return a single product.
 * This is the structure returned by the product(id: ID!) query.
 * 
 * @example
 * ```typescript
 * const response = await graphqlRepo.post<ShopifyAdminProductGraphQLResponse>(shop, {
 *   query: GET_PRODUCT_QUERY,
 *   variables: { id: productGID }
 * });
 * 
 * if (response.data?.product) {
 *   const product = response.data.product;
 *   // Transform to internal format
 *   const transformed = transformProductToESDoc(product);
 * }
 * ```
 */
export interface ShopifyAdminProductGraphQLResponse {
  /** The product node, or null if not found */
  product: ShopifyAdminProductNode | null;
}

