/**
 * Shops Factory
 * Creates and wires up shops module dependencies
 */

import { Client } from '@elastic/elasticsearch';
import { ShopsRepository } from './shops.repository';

export function createShopsModule(esClient: Client) {
  const repository = new ShopsRepository(esClient);

  return {
    repository,
  };
}

