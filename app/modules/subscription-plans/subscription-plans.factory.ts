import { Client } from '@elastic/elasticsearch';
import { SubscriptionPlansRepository } from './subscription-plans.repository';

export function createSubscriptionPlansModule(esClient: Client) {
  const repository = new SubscriptionPlansRepository(esClient);

  return { repository };
}
