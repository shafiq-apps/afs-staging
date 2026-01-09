/**
 * Search Helpers
 * Business logic utilities for building advanced search inputs from HTTP requests
 * Supports autocomplete, suggestions, synonyms, typo tolerance, and semantic search
 */

import { ProductSearchInput } from '@shared/storefront/types';
import { parseCommaSeparated, parseOptionFilters } from '@shared/helpers/query.helper';

/**
 * Search-specific input interface
 */
export interface SearchInput extends ProductSearchInput {
  // Autocomplete/predictive search
  autocomplete?: boolean;
  suggestions?: boolean;
  suggestionLimit?: number;
  
  // Typo tolerance
  typoTolerance?: boolean;
  minWordLengthForTypo?: number;
  
  // Synonyms
  enableSynonyms?: boolean;
  
  // Semantic/Natural language search
  semanticSearch?: boolean;
  
  // Zero results handling
  handleZeroResults?: boolean;
  suggestAlternatives?: boolean;
  
  // Faceted search
  includeFacets?: boolean;
  facetLimit?: number;
}

/**
 * Build SearchInput from HTTP request query parameters
 * Optimized for fast search with modern features
 */
export function buildSearchInput(query: Record<string, unknown>): SearchInput {
  const searchInput: SearchInput = {};

  // Core search query - required for search endpoint
  const searchQuery = typeof query.q === 'string' ? query.q.trim() : 
                     typeof query.query === 'string' ? query.query.trim() :
                     typeof query.search === 'string' ? query.search.trim() : undefined;
  if (searchQuery) {
    searchInput.search = searchQuery;
  }

  // Autocomplete / Predictive Suggestions
  const autocomplete = query.autocomplete === 'true' || query.autocomplete === '1' || query.autocomplete === true;
  if (autocomplete) {
    searchInput.autocomplete = true;
  }

  const suggestions = query.suggestions === 'true' || query.suggestions === '1' || query.suggestions === true;
  if (suggestions) {
    searchInput.suggestions = true;
  }

  const suggestionLimit = typeof query.suggestionLimit === 'string' ? parseInt(query.suggestionLimit, 10) :
                          typeof query.suggestionLimit === 'number' ? query.suggestionLimit : undefined;
  if (suggestionLimit && suggestionLimit > 0 && suggestionLimit <= 50) {
    searchInput.suggestionLimit = suggestionLimit;
  }

  // Synonyms & Typo Tolerance
  const enableSynonyms = query.enableSynonyms !== 'false' && query.enableSynonyms !== '0'; // Default true
  if (enableSynonyms) {
    searchInput.enableSynonyms = true;
  }

  const typoTolerance = query.typoTolerance !== 'false' && query.typoTolerance !== '0'; // Default true
  if (typoTolerance) {
    searchInput.typoTolerance = true;
  }

  const minWordLengthForTypo = typeof query.minWordLengthForTypo === 'string' ? parseInt(query.minWordLengthForTypo, 10) :
                                typeof query.minWordLengthForTypo === 'number' ? query.minWordLengthForTypo : undefined;
  if (minWordLengthForTypo && minWordLengthForTypo >= 3) {
    searchInput.minWordLengthForTypo = minWordLengthForTypo;
  }

  // Natural Language / Semantic Search
  const semanticSearch = query.semanticSearch === 'true' || query.semanticSearch === '1' || query.semanticSearch === true;
  if (semanticSearch) {
    searchInput.semanticSearch = true;
  }

  // Faceted / Filtered Search
  const includeFacets = query.includeFacets === 'true' || query.includeFacets === '1' || query.includeFacets === true;
  if (includeFacets) {
    searchInput.includeFacets = true;
  }

  const facetLimit = typeof query.facetLimit === 'string' ? parseInt(query.facetLimit, 10) :
                     typeof query.facetLimit === 'number' ? query.facetLimit : undefined;
  if (facetLimit && facetLimit > 0) {
    searchInput.facetLimit = facetLimit;
  }

  // Zero-Results Handling
  const handleZeroResults = query.handleZeroResults !== 'false' && query.handleZeroResults !== '0'; // Default true
  if (handleZeroResults) {
    searchInput.handleZeroResults = true;
  }

  const suggestAlternatives = query.suggestAlternatives === 'true' || query.suggestAlternatives === '1' || query.suggestAlternatives === true;
  if (suggestAlternatives) {
    searchInput.suggestAlternatives = true;
  }

  // Standard filters (for faceted search)
  const vendorValues = parseCommaSeparated(query.vendor || query.vendors);
  if (vendorValues.length) searchInput.vendors = vendorValues;

  const productTypeValues = parseCommaSeparated(query.productType || query.productTypes);
  if (productTypeValues.length) searchInput.productTypes = productTypeValues;

  const tagValues = parseCommaSeparated(query.tag || query.tags);
  if (tagValues.length) searchInput.tags = tagValues;

  const collectionValues = parseCommaSeparated(query.collection || query.collections);
  if (collectionValues.length) searchInput.collections = collectionValues;

  // Collection page ID
  const cpid = typeof query.cpid === 'string' ? query.cpid.trim() : undefined;
  if (cpid) {
    searchInput.cpid = cpid;
    const collectionId = cpid.startsWith('gid://') 
      ? cpid.split('/').pop() || cpid
      : cpid;
    searchInput.collections = [collectionId];
  }

  // Option filters
  const optionFilters = parseOptionFilters(query);
  if (Object.keys(optionFilters).length) {
    searchInput.options = optionFilters;
  }

  const variantOptionKeyValues = parseCommaSeparated(
    query.variantKey ||
    query.variantKeys ||
    query.variant_option_key ||
    query.variant_option_keys
  );
  if (variantOptionKeyValues.length) {
    searchInput.variantOptionKeys = variantOptionKeyValues;
  }

  // Price range filters
  const priceMin = typeof query.priceMin === 'string' ? parseFloat(query.priceMin) : typeof query.priceMin === 'number' ? query.priceMin : undefined;
  if (priceMin !== undefined && !isNaN(priceMin) && priceMin >= 0) searchInput.priceMin = priceMin;

  const priceMax = typeof query.priceMax === 'string' ? parseFloat(query.priceMax) : typeof query.priceMax === 'number' ? query.priceMax : undefined;
  if (priceMax !== undefined && !isNaN(priceMax) && priceMax >= 0) searchInput.priceMax = priceMax;

  // Variant SKU filter
  const variantSkuValues = parseCommaSeparated(query.variantSku || query.variantSkus || query.sku || query.skus);
  if (variantSkuValues.length) searchInput.variantSkus = variantSkuValues;

  // Pagination
  const page = typeof query.page === 'string' ? parseInt(query.page, 10) : undefined;
  if (page && page > 0) searchInput.page = page;

  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : undefined;
  // Maximum 10 products for search endpoint
  if (limit && limit > 0) {
    searchInput.limit = limit > 10 ? 10 : limit;
  } else {
    searchInput.limit = 10; // Default to 10
  }

  // Sort
  const sort = typeof query.sort === 'string' ? query.sort : undefined;
  if (sort) searchInput.sort = sort;

  // Field selection
  const fields = query.fields;
  if (fields) {
    if (typeof fields === 'string' || Array.isArray(fields)) {
      searchInput.fields = fields;
    }
  }

  return searchInput;
}

/**
 * Check if search input has any search-related parameters
 */
export function hasSearchParams(input?: SearchInput): boolean {
  if (!input) return false;
  return Boolean(
    input.search ||
    input.autocomplete ||
    input.suggestions ||
    input.semanticSearch
  );
}

