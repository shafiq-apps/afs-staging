/**
 * Search Factory
 * Creates and wires up search module dependencies
 * Reuses existing StorefrontSearchService and StorefrontSearchRepository
 * for optimal performance and consistency
 */

import { StorefrontSearchRepository } from '@shared/storefront/repository';
import { StorefrontSearchService } from '@shared/storefront/service';
import { Client } from '@elastic/elasticsearch';

export function createSearchModule(esClient: Client) {
  const repo = new StorefrontSearchRepository(esClient);
  const service = new StorefrontSearchService(repo);

  return { service, repository: repo };
}

