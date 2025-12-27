/**
 * Subscriptions Factory
 * Creates and wires up subscriptions module dependencies
*/

import { ShopsRepository } from '@modules/shops/shops.repository';
import { SubscriptionsRepository } from './subscriptions.repository';
import { Client } from '@elastic/elasticsearch';

export function createSubscriptionModule(esClient: Client, shopsRepository: ShopsRepository) {
  const repository = new SubscriptionsRepository(esClient, shopsRepository);

  return { repository };
}

