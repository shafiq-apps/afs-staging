import { LoaderFunctionArgs } from "react-router";
import { authenticate } from "./shopify.server";
import { fetchSubscriptionWithPlans } from "./subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const response1 = await fetchSubscriptionWithPlans({ shop: session.shop });
    console.log("response1", response1)
    const { subscription, subscriptionPlans } = response1 || {};
    const response = await admin.graphql(
      `
      query {
        productsCount(query: "limit:null") {
          count
          precision
        }
      }
    `
    );
    const { data: { productsCount } } = await response.json().catch(() => ({
      data: { productsCount: { count: 0, precision: "EXACT" } },
    }));

    return {
      admin, session, subscription, subscriptionPlans, productsCount
    };
  } catch (error) {
    console.error(error);
    return {
      admin: null,
      session: null,
      subscription: null,
      subscriptionPlans: null,
      productsCount: null
    }
  }
};