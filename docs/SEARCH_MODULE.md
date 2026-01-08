# Search Module Features

## Overview
The search module provides configurable, high-performance product search with typo tolerance and dynamic field weighting. This document explains the features, what has been implemented, and how the search algorithm works.

## What Has Been Implemented

### 1. **Dynamic Search Configuration System**
- **GraphQL Schema**: Added `SearchConfig` and `SearchField` types with queries and mutations
- **Repository Layer**: `SearchRepository` handles CRUD operations in Elasticsearch `app_search` index
- **Data Persistence**: Single document per shop (using normalized shop name as `_id`) prevents duplicates
- **Validation**: Input validation ensures no empty fields, no duplicates, and weights between 1-10

### 2. **Admin UI for Search Management**
- **Remix Page**: Created `/app/search` route with Shopify Polaris components
- **Field Management**: Add/remove searchable fields via chip-based UI
- **Weight Configuration**: Dropdown selector (1x-10x) for each field
- **Real-time Updates**: GraphQL mutations update configuration immediately

### 3. **Typo-Tolerant Search Algorithm**
- **Fuzzy Matching**: Implemented Elasticsearch fuzzy queries with `fuzziness: 1`
- **Prefix Matching**: Requires first 2 characters to match (prevents irrelevant results)
- **Query Optimization**: Single query approach (faster than multiple bool queries)
- **Score Ranking**: Exact matches ranked higher than typo matches automatically

### 4. **Performance Optimizations**
- **Field Limiting**: Reduced from unlimited to top 4 fields by weight
- **Nested Field Filtering**: Limits nested `variants.*` fields to top 2
- **Source Filtering**: Only retrieves necessary fields from Elasticsearch
- **Query Simplification**: Removed query variations, singular/plural handling (ES analyzer handles it)
- **Timeout Management**: Set to 1 second to balance speed and accuracy
- **Cache Strategy**: Shared cache with 30-second TTL and automatic invalidation

### 5. **Cache Invalidation System**
- **Shared Cache**: Map-based cache shared across all repository instances
- **Invalidation Function**: `invalidateSharedSearchConfigCache()` called on config updates
- **TTL Management**: 30-second cache prevents stale data while maintaining performance

## Key Features

### 1. **Configurable Search Fields**
- Admin can configure which fields are searchable (title, tags, vendor, productType, variants, etc.)
- Each field can have a custom weight to control relevance
- Fields can be added/removed dynamically without code changes

### 2. **Admin Configuration UI**
- Remix-based admin page (`/app/search`) for managing search settings
- Visual interface to add/remove searchable fields
- Dropdown selector for field weights (1x to 10x)
- Real-time configuration updates

### 3. **Typo Tolerance**
- Automatic handling of 1-character typos (e.g., "sportx" → "sports", "demale" → "female")
- Uses Elasticsearch fuzzy matching with optimized settings
- Exact matches ranked higher than typo matches

### 4. **Performance Optimizations**
- Optimized Elasticsearch queries for sub-300ms target response times
- Limited field searches to top 4 fields by weight
- Minimal field retrieval from Elasticsearch
- Request caching enabled
- Aggressive timeout settings

### 5. **Dynamic Field Weights**
- Default weights: title (7x), variants.displayName (6x), variants.sku (6x), tags (5x)
- Customizable per shop via admin UI
- Weights affect search result ranking

### 6. **Cache Management**
- Shared cache across all repository instances
- 30-second TTL for search configurations
- Automatic cache invalidation on configuration updates
- Service-level result caching

## How the Algorithm Works

### Search Query Construction

1. **Field Selection & Weighting**
   - Retrieves shop-specific search configuration from Elasticsearch (cached for 30 seconds)
   - Selects top 4 fields by weight (performance optimization)
   - Filters out nested `variants.*` fields if more than 2 exist (keeps only top 2 by weight)
   - Falls back to default fields if no configuration exists

2. **Query Building**
   - **Single Field**: Uses Elasticsearch `match` query with fuzziness
   - **Multiple Fields**: Uses `multi_match` with `best_fields` type
   - Both query types include:
     - `fuzziness: 1` - Handles 1-character typos (e.g., "sportx" → "sports")
     - `prefix_length: 2` - Requires first 2 characters to match (performance optimization)
     - `max_expansions: 50` - Limits fuzzy expansions for speed
     - `operator: 'or'` - Matches any word in the query

3. **Typo Tolerance Mechanism**
   - Exact matches receive highest relevance scores
   - Typo matches (1 character difference) are included but ranked lower
   - First 2 characters must match to prevent irrelevant results
   - Example: "demale" finds "female" because:
     - First 2 chars match: "de" vs "fe" (close enough with fuzziness)
     - Only 1 character difference overall

4. **Result Ranking**
   - Results sorted by `_score` (relevance) in descending order
   - Exact matches score higher than typo matches
   - Field weights affect scoring (e.g., title matches weighted 7x vs vendor 0.8x)

5. **Performance Optimizations**
   - Limited to top 4 fields by weight (reduces query complexity)
   - Minimal field retrieval (`_source` filtering)
   - Request caching enabled
   - `track_total_hits: false` (faster count calculation)
   - `terminate_after` removed (was skipping valid fuzzy matches)
   - Timeout set to 1 second

### Configuration Management

1. **Storage**
   - Single document per shop in `app_search` index
   - Shop name normalized and used as document `_id` (prevents duplicates)
   - Fields stored as array: `[{ field: "title", weight: 7 }, ...]`

2. **Cache Strategy**
   - Shared cache across all repository instances
   - 30-second TTL for search configurations
   - Automatic invalidation when configuration is updated
   - Service-level result caching for repeated queries

3. **Default Configuration**
   - Created automatically if no config exists
   - Default fields: `title` (7x), `variants.displayName` (6x), `variants.sku` (6x), `tags` (5x)
   - Preserved on updates (only fields and weights change)

## Technical Details

- **Storage**: Elasticsearch index per shop (`app_search` index)
- **GraphQL API**: `searchConfig` query and `updateSearchConfig` mutation
- **Data Model**: Single document per shop (using normalized shop name as `_id`)
- **Query Type**: `multi_match` with `best_fields` type for multiple fields, `match` for single field
- **Fuzziness**: Fixed at 1 (handles 1-character typos)
- **Prefix Length**: 2 characters required to match (performance optimization)
- **Max Expansions**: 50 (limits fuzzy query expansions)

## Usage

### Admin Configuration
Navigate to `/app/search` in the admin dashboard to configure searchable fields and weights.

### Storefront API
Use the `searchProductsWithAutocomplete` endpoint with search query parameter for typo-tolerant search.

