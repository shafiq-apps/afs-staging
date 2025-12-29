// app/utils/subscription.server.ts

import { graphqlRequest } from "./graphql.server";
import { SubscriptionPlan } from "./types/PricingTypes";

export async function checkSubscription(shop: string): Promise<SubscriptionPlan | null> {
  try {
    const query = `
      query {
        subscription {
          id
          name
          test
        }
      }
    `;
    const res = await graphqlRequest<{ subscription: SubscriptionPlan | null }>(query, { shop });
    return res.subscription || null;
  } catch (e) {
    console.error("Failed to check subscription", e);
    return null;
  }
}
