/**
 * Subscriptions Factory
 * Creates and wires up subscriptions module dependencies
*/

import { SubscriptionsRepository } from './subscriptions.repository';
import { Client } from '@elastic/elasticsearch';

export function createSubscriptionModule(esClient: Client) {
  const repository = new SubscriptionsRepository(esClient);

  return { repository };
}

