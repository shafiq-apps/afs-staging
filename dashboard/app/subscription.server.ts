// app/utils/subscription.server.ts

import { graphqlRequest } from "./graphql.server";
import { FETCH_BILLING_PLANS_AND_SUBSCRIPTION, FETCH_CURRENT_SUBSCRIPTION } from "./graphql/subscriptions.query";
import { Subscription } from "./types/Subscriptions";


export async function checkSubscription(shop: string): Promise<Subscription | null> {
  try {
    const res = await graphqlRequest<{ subscription: Subscription | null }>(FETCH_CURRENT_SUBSCRIPTION, { shop });
    return res.subscription || null;
  } catch (e) {
    return null;
  }
}

export async function fetchSubscriptionWithPlans(params:{shop: string}): Promise<{ subscriptionPlans: Subscription[]; subscription: Subscription; }> {
  return await graphqlRequest(FETCH_BILLING_PLANS_AND_SUBSCRIPTION, { shop: params.shop });
}