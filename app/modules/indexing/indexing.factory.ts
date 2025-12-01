/**
 * Indexing Factory
 * Creates and wires up indexing module dependencies
 */

import { Client } from '@elastic/elasticsearch';

export interface IndexingModule {
  // Add any exports needed from the indexing module
}

export function createIndexingModule(esClient: Client): IndexingModule {
  // For now, the indexing module doesn't need a factory pattern
  // since the bulk indexer is created on-demand via routes
  // This factory can be extended if needed for shared services
  
  return {};
}

