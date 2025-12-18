/**
 * Product Types
 * Types for product filtering, searching, and data structures
 */

/**
 * Elasticsearch aggregation bucket structure
 */
export interface AggregationBucket {
  key: string;
  doc_count: number;
}

/**
 * Elasticsearch terms aggregation response structure
 */
export interface TermsAggregation {
  buckets: AggregationBucket[];
  doc_count_error_upper_bound?: number;
  sum_other_doc_count?: number;
}

export interface FacetAggregations {
  vendors?: TermsAggregation;
  productTypes?: TermsAggregation;
  tags?: TermsAggregation;
  collections?: TermsAggregation;
  optionPairs?: TermsAggregation;
  price?: {
    min: number;
    max: number;
  };
  variantPriceRange?: {
    min: number;
    max: number;
  };
}

export interface ProductFilterInput {
  vendors?: string[];
  productTypes?: string[];
  tags?: string[];
  collections?: string[];
  options?: Record<string, string[]>;
  search?: string;
  variantOptionKeys?: string[];
  // Price range filters (product-level minPrice/maxPrice)
  priceMin?: number;
  priceMax?: number;
  // Variant price range filters (variant.price)
  variantPriceMin?: number;
  variantPriceMax?: number;
  // Variant SKU filter
  variantSkus?: string[];
  // Keep specific filter aggregations (by query key/handle)
  keep?: string[];
  // Collection page ID - filters products to only show those from the collection the user is viewing
  cpid?: string;
}

export interface FacetValue {
  value: string;
  count: number;
  label: string;
}

export interface StorefrontFilterDescriptor {
  key: string;
  type: 'option' | 'vendor' | 'productType' | 'tag' | 'collection' | 'price' | 'variantPriceRange';
  queryKey: string;
  label: string;
  handle?: string;
  position?: number;
  optionType?: string | null;
  optionKey?: string;
  displayType?: string;
  selectionType?: string;
  allowedOptions?: string[];
  collapsed?: boolean;
  searchable?: boolean;
  showTooltip?: boolean;
  tooltipContent?: string;
  showCount?: boolean;
  showMenu?: boolean;
  status?: string;
  values?: FacetValue[];
  range?: {
    min: number;
    max: number;
  };
}

export interface ProductFilters {
  vendors: FacetValue[];
  productTypes: FacetValue[];
  tags: FacetValue[];
  collections: FacetValue[];
  options: Record<string, FacetValue[]>;
  price?: {
    min: number;
    max: number;
  };
  variantPriceRange?: {
    min: number;
    max: number;
  };
}

export interface ProductSearchInput {
  vendors?: string[];
  productTypes?: string[];
  tags?: string[];
  collections?: string[];
  options?: Record<string, string[]>;
  search?: string;
  variantOptionKeys?: string[];
  // Price range filters (product-level minPrice/maxPrice)
  priceMin?: number;
  priceMax?: number;
  // Variant price range filters (variant.price)
  variantPriceMin?: number;
  variantPriceMax?: number;
  // Variant SKU filter
  variantSkus?: string[];
  page?: number;
  limit?: number;
  sort?: string;
  includeFilters?: boolean;
  // Field selection (comma-separated or array)
  fields?: string | string[];
  // Filter settings from filter configuration
  hideOutOfStockItems?: boolean;
  // Keep specific filter aggregations (by query key/handle)
  keep?: string[];
  // Collection page ID - filters products to only show those from the collection the user is viewing
  cpid?: string;
}

export interface productOption {
  id?: string | null;
  name: string | null;
  values: string[];
}

export interface productVariantOption {
  name: string | null;
  value: string | null;
}

export interface productVariant {
  id: string | null;
  title: string | null;
  displayName?: string | null;
  sku: string | null;
  barcode: string | null;
  price: string | null;
  compareAtPrice: string | null;
  availableForSale?: boolean | null;
  inventoryQuantity: number | null;
  position?: number | null;
  sellableOnlineQuantity?: number | null;
  taxable?: boolean | null;
  createdAt?: string | null;
  selectedOptions?: productVariantOption[];
  options: productVariantOption[];
  optionPairs: string[];
  optionKey: string | null;
  [key: string]: any;
}

export interface productMetafield {
  id: string | null;
  namespace: string | null;
  key: string | null;
  value: string | null;
  type: string | null;
}

export interface productCategory {
  name?: string | null;
}

export interface productMediaImage {
  url?: string | null;
  altText?: string | null;
  thumbhash?: string | null;
}

export interface productMedia {
  id?: string | null;
  alt?: string | null;
  preview?: {
    image?: productMediaImage | null;
  } | null;
  status?: string | null;
}

export interface productPriceMoney {
  amount: string | null;
  currencyCode: string | null;
}

export interface productPriceRangeV2 {
  maxVariantPrice?: productPriceMoney | null;
  minVariantPrice?: productPriceMoney | null;
}

export interface productVariantsCount {
  count?: number | null;
  precision?: string | null;
}

export interface shopifyProduct {
  id: string;
  productId: string | null;
  title: string | null;
  handle: string | null;
  status: string | null;
  tags: string[];
  productType: string | null;
  vendor: string | null;
  category?: productCategory | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  templateSuffix?: string | null;
  totalInventory?: number | null;
  variantsCount?: productVariantsCount | null;
  priceRangeV2?: productPriceRangeV2 | null;
  options: productOption[];
  collections: string[];
  collectionSortOrder: Record<string, number>;
  bestSellerRank: number | null;
  variants: productVariant[];
  metafields: productMetafield[];
  media?: productMedia[];
  imageUrl: string | null;
  imagesUrls: string[];
  optionPairs: string[];
  variantOptionKeys: string[];
  variantOptionLookup: Record<string, string>;
  documentType: 'product' | 'collection' | 'page' | 'article' | 'blog';
  minPrice?: number | null;
  maxPrice?: number | null;
  [key: string]: any;
}

export type StorefrontProduct = Omit<shopifyProduct, 'optionPairs' | 'variantOptionKeys' | 'variantOptionLookup' | 'documentType'>;

export interface ProductSearchResult {
  products: Partial<StorefrontProduct>[]; // Partial because fields are dynamically selected
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters?: FacetAggregations;
}

