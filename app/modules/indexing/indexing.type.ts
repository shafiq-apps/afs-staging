/**
 * Indexing Types
 * Types for product bulk indexing functionality
 */

export interface IndexerOptions {
  shop: string;
  esIndex?: string;
  batchSize?: number;
  maxRetries?: number; // Maximum retry attempts for failed items (default: 3)
  retryDelay?: number; // Base delay for retries in ms (default: 1000)
}

export interface CheckpointData {
  lastProcessedLine: number;
  status: 'in_progress' | 'success' | 'failed';
  totalLines?: number;
  totalIndexed?: number;
  totalFailed?: number;
  failedItems?: Array<{
    id: string;
    line: number;
    error?: string;
    retryCount?: number;
  }>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  lastShopifyUpdatedAt?: string; // Last updatedAt from Shopify when checkpoint was created
  indexExists?: boolean; // Whether the ES index existed when checkpoint was created
  progress?: number; // Progress percentage (0-100), calculated automatically
}

