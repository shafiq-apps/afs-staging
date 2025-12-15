/**
 * Indexer Helper Functions
 * Utilities for product indexing operations
 */

import fs from 'fs';
import path from 'path';
import { createModuleLogger } from '@shared/utils/logger.util';
import { normalizeShopifyId, extractShopifyResourceType } from '@shared/utils/shopify-id.util';
import { normalizeGraphQLNode } from '@shared/utils/graphql.util';
import { PRODUCT_OPTION_PAIR_SEPARATOR } from '@shared/constants/products.constants';
import type { shopifyProduct, productOption, productVariant, productVariantOption, productMetafield } from '@shared/storefront/types';

const logger = createModuleLogger('IndexerHelper');

export function ensureCacheDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function appendLog(message: string) {
  try {
    // Write logs to app/system/logs (project root) instead of dist/system/logs
    // This prevents PM2 watch from detecting log file changes and restarting the server
    // In production, process.cwd() is already the app directory (set in ecosystem.config.js)
    const baseDir = process.cwd(); // Always use current working directory (app folder)
    const logDir = path.join(baseDir, 'system', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, `indexer-${new Date().toISOString().split('T')[0]}.log`);
    const entry = { ts: new Date().toISOString(), message };
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (err) {
    // best-effort
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Transform a Shopify product JSON (from bulk export) into a normalized ES document
export function transformProductToESDoc(raw: any): shopifyProduct {
  const unwrapNode = (value: any) => (value && value.node ? value.node : value);
  const normalizeNodeArray = (value: any): any[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(unwrapNode).filter(Boolean);
    if (Array.isArray(value.edges)) return value.edges.map(unwrapNode).filter(Boolean);
    if (Array.isArray(value.nodes)) return value.nodes.map(unwrapNode).filter(Boolean);
    return [];
  };

  let node = raw;
  if (raw?.node) node = raw.node;
  if (raw?.products?.edges?.length) {
    const first = raw.products.edges[0];
    if (first?.node) node = first.node;
  }

  const normalizedProduct = normalizeGraphQLNode(node);
  const id = normalizedProduct?.id || normalizedProduct?.gid || null;

  const optionNodes = Array.isArray(normalizedProduct?.options)
    ? normalizedProduct.options
    : normalizeNodeArray(normalizedProduct?.options);

  const options: productOption[] = optionNodes
    .map((opt: any) => {
      // Ensure values is always an array of strings (matching productOption type)
      const values = Array.isArray(opt?.values) 
        ? opt.values.filter(Boolean).map((v: any) => String(v))
        : [];
      
      return {
        id: opt?.id ?? null,
        name: opt?.name ?? null,
        values: values,
      } as productOption;
    })
    .filter((opt) => Boolean(opt.name) && opt.values.length > 0);

  const variantNodes = Array.isArray(normalizedProduct?.variants)
    ? normalizedProduct.variants
    : normalizeNodeArray(normalizedProduct?.variants);

  const variantOptionKeysSet = new Set<string>();
  const variantOptionLookup: Record<string, string> = {};

  const variants: productVariant[] = variantNodes.map((variantNode: any) => {
    const selectedOptions = Array.isArray(variantNode?.selectedOptions)
      ? variantNode.selectedOptions.map((opt: any) => ({
        name: opt?.name ?? null,
        value: opt?.value ?? null,
      }))
      : Array.isArray(variantNode?.options)
        ? variantNode.options.map((value: any, idx: number) => ({
          name: optionNodes[idx]?.name ?? `Option ${idx + 1}`,
          value: value ?? null,
        }))
        : [];

    const filteredOptions = (selectedOptions as productVariantOption[]).filter((opt) => opt.name && opt.value);

    const optionPairs = filteredOptions.map(
      (opt) => `${opt.name}${PRODUCT_OPTION_PAIR_SEPARATOR}${opt.value}`,
    );

    const optionKey =
      filteredOptions
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((opt) => `${opt.name}:${opt.value}`)
        .join('|') || null;

    if (optionKey) {
      variantOptionKeysSet.add(optionKey);
      if (variantNode?.id) {
        variantOptionLookup[optionKey] = variantNode.id;
      }
    }

    const priceValue = variantNode?.price ?? null;
    const compareAtPriceValue = variantNode?.compareAtPrice ?? null;

    return {
      ...variantNode,
      id: variantNode?.id ?? null,
      title: variantNode?.title ?? null,
      displayName: variantNode?.displayName ?? null,
      sku: variantNode?.sku ?? null,
      barcode: variantNode?.barcode ?? null,
      price: priceValue != null ? String(priceValue) : null,
      compareAtPrice: compareAtPriceValue != null ? String(compareAtPriceValue) : null,
      availableForSale: variantNode?.availableForSale ?? null,
      inventoryQuantity: variantNode?.inventoryQuantity ?? null,
      position: variantNode?.position ?? null,
      sellableOnlineQuantity: variantNode?.sellableOnlineQuantity ?? null,
      taxable: variantNode?.taxable ?? null,
      createdAt: variantNode?.createdAt ?? null,
      options: selectedOptions as productVariantOption[],
      optionPairs,
      optionKey
    };
  });

  const optionPairSet = new Set<string>();

  for (const opt of options) {
    for (const value of opt.values) {
      if (!value) continue;
      optionPairSet.add(`${opt.name}${PRODUCT_OPTION_PAIR_SEPARATOR}${value}`);
    }
  }

  for (const variant of variants) {
    for (const pair of variant.optionPairs) {
      optionPairSet.add(pair);
    }
  }

  const optionPairs = Array.from(optionPairSet);
  const variantOptionKeys = Array.from(variantOptionKeysSet);

  // Extract image URLs for imagesUrls field (media field removed - not using it anymore)
  // Handle both 'media' (from GraphQL) and 'images' (from JSONL parsing)
  let mediaNodes: any[] = [];
  
  if (Array.isArray(normalizedProduct?.images) && normalizedProduct.images.length > 0) {
    // JSONL format - images are already collected as separate rows with MediaImage structure
    mediaNodes = normalizedProduct.images;
  } else if (Array.isArray(normalizedProduct?.media) && normalizedProduct.media.length > 0) {
    // GraphQL format - media comes from the product node
    mediaNodes = normalizedProduct.media;
  } else {
    // Try to normalize from edges/nodes structure
    const normalizedMedia = normalizeNodeArray(normalizedProduct?.media);
    if (normalizedMedia.length > 0) {
      mediaNodes = normalizedMedia;
    }
  }

  // Extract image URLs from mediaNodes - try various possible locations
  const images: string[] = mediaNodes
    .map((media: any) => {
      if (!media || typeof media !== 'object' || Array.isArray(media)) return null;
      return media.preview?.image?.url || media.url || media.image?.url || null;
    })
    .filter((url): url is string => Boolean(url));

  const metafields: productMetafield[] = normalizeNodeArray(normalizedProduct?.metafields).map((m: any) => ({
    id: m?.id ?? null,
    key: m?.key ?? null,
    namespace: m?.namespace ?? null,
    value: m?.value ?? null,
    type: m?.type ?? m?.typeName ?? null,
  }));

  const tags = Array.isArray(normalizedProduct?.tags)
    ? normalizedProduct.tags
    : typeof normalizedProduct?.tags === 'string'
      ? normalizedProduct.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

  const collections: string[] = Array.isArray(normalizedProduct?.collections)
    ? normalizedProduct.collections
    : normalizeNodeArray(normalizedProduct?.collections)
        .map((c: any) => normalizeShopifyId(c?.id??c))
        .filter((id: any) => typeof id === 'string');

  const collectionSortOrder =
    typeof normalizedProduct?.collectionSortOrder === 'object' && normalizedProduct?.collectionSortOrder !== null
      ? normalizedProduct.collectionSortOrder
      : {};

  // Extract bestSellerRank - ensure it's an integer
  const bestSellerRank =
    typeof normalizedProduct?.bestSellerRank === 'number'
      ? Math.floor(normalizedProduct.bestSellerRank) // Ensure integer
      : null;

  // Compute min/max price from variants for fast sorting
  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  if (variants.length > 0) {
    const prices = variants
      .map((v) => {
        const price = v.price ? parseFloat(v.price) : null;
        return price;
      })
      .filter((p): p is number => p !== null && !isNaN(p));
    
    if (prices.length > 0) {
      minPrice = Math.min(...prices);
      maxPrice = Math.max(...prices);
    }
  }

  // Use priceRangeV2 if available, otherwise compute from variants
  const priceRangeV2 = normalizedProduct?.priceRangeV2;
  if (priceRangeV2?.minVariantPrice?.amount) {
    const min = parseFloat(priceRangeV2.minVariantPrice.amount);
    if (!isNaN(min)) minPrice = min;
  }
  if (priceRangeV2?.maxVariantPrice?.amount) {
    const max = parseFloat(priceRangeV2.maxVariantPrice.amount);
    if (!isNaN(max)) maxPrice = max;
  }

  // Build the document, excluding fields that shouldn't be indexed
  const doc: shopifyProduct = {
    id: id || normalizedProduct?.id || '',
    productId: normalizeShopifyId(id || normalizedProduct?.id || ''),
    title: normalizedProduct?.title ?? null,
    handle: normalizedProduct?.handle ?? null,
    status: normalizedProduct?.status ?? normalizedProduct?.publishedStatus ?? null,
    tags,
    productType: normalizedProduct?.productType ?? null,
    vendor: normalizedProduct?.vendor ?? null,
    category: normalizedProduct?.category ?? null,
    createdAt: normalizedProduct?.createdAt ?? null,
    updatedAt: normalizedProduct?.updatedAt ?? null,
    publishedAt: normalizedProduct?.publishedAt ?? null,
    templateSuffix: normalizedProduct?.templateSuffix ?? null,
    totalInventory: normalizedProduct?.totalInventory ?? null,
    priceRangeV2: normalizedProduct?.priceRangeV2 ?? null,
    variantsCount: normalizedProduct?.variantsCount ?? null,
    options,
    collections,
    collectionSortOrder,
    bestSellerRank,
    variants,
    metafields,
    // Media field removed - using imagesUrls instead for product display
    imageUrl: images.length > 0 ? images[0] : null,
    imagesUrls: images,
    optionPairs,
    variantOptionKeys,
    variantOptionLookup,
    documentType: 'product',
    // Add computed price fields for fast sorting
    minPrice: minPrice ?? null,
    maxPrice: maxPrice ?? null,
  };

  return doc;
}

export function detectType(row: any): string | null {
  if (!row?.id) return null;

  // Extract exact resource type from GraphQL ID
  const resourceType = extractShopifyResourceType(row.id);
  const parentResourceType = row.__parentId ? extractShopifyResourceType(row.__parentId) : null;

  // Root level nodes (no parent)
  if (!parentResourceType) {
    if (resourceType === "Product") return "Product";
    if (resourceType === "Collection") return "Collection";
    return null;
  }

  // Child nodes with Product parent
  if (parentResourceType === "Product") {
    if (resourceType === "ProductOption") return "ProductOption";
    if (resourceType === "ProductVariant") return "ProductVariant";
    if (resourceType === "MediaImage") return "MediaImage";
    if (resourceType === "Collection") return "Collection"; // Collection with Product parent = product-to-collection relationship
    // Fallback for legacy detection
    if (row.values) return "ProductOption";
    if (row.price || row.sku) return "ProductVariant";
    if (row.url) return "MediaImage";
  }

  // Child nodes with Collection parent
  if (parentResourceType === "Collection") {
    if (resourceType === "MediaImage") return "CollectionImage";
    if (resourceType === "Product") return "CollectionProduct";
    // Fallback for legacy detection
    if (row.url) return "CollectionImage";
    if (extractShopifyResourceType(row.id) === "Product") return "CollectionProduct";
  }

  return null;
}

