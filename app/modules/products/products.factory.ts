/**
 * Products Factory
 * Creates and wires up products module dependencies
 */

import { StorefrontSearchRepository } from '@shared/storefront/repository';
import { StorefrontSearchService } from '@shared/storefront/service';
import { Client } from '@elastic/elasticsearch';

export function createProductsModule(esClient: Client) {
  const repo = new StorefrontSearchRepository(esClient);
  const service = new StorefrontSearchService(repo);

  return { service, repository: repo };
}

