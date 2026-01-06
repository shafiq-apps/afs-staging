import { LoaderFunctionArgs } from "react-router";
import { authenticate } from "./shopify.server";
import { fetchSubscriptionWithPlans } from "./subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const response = await fetchSubscriptionWithPlans({ shop: session.shop });

    const { subscription, subscriptionPlans } = response ?? {};
    const pcResponse = await admin.graphql(
      `
      query {
        productsCount(query: "limit:null") {
          count
          precision
        }
      }
    `
    );
    const { data: { productsCount } } = await pcResponse.json().catch(() => ({
      data: { productsCount: { count: 0, precision: "EXACT" } },
    }));

    return {
      admin, session, subscription, subscriptionPlans, productsCount
    };
  } catch (error) {
    return {
      admin: null,
      session: null,
      subscription: null,
      subscriptionPlans: null,
      productsCount: null
    }
  }
};