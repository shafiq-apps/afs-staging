/**
 * Filters Factory
 * Creates and wires up filters module dependencies
 */

import { FiltersRepository } from './filters.repository';
import { Client } from '@elastic/elasticsearch';

export function createFiltersModule(esClient: Client) {
  const repository = new FiltersRepository(esClient);

  return { repository };
}

