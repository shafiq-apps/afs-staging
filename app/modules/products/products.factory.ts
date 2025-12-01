/**
 * Products Factory
 * Creates and wires up products module dependencies
 */

import { productsRepository } from './products.repository';
import { productsService } from './products.service';
import { Client } from '@elastic/elasticsearch';

export function createProductsModule(esClient: Client) {
  const repo = new productsRepository(esClient);
  const service = new productsService(repo);

  return { service, repository: repo };
}

