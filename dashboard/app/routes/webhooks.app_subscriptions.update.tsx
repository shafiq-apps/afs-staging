import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { graphqlRequest } from "../utils/graphql.client";

// Simple logger for dashboard webhooks
// No-op logger - logging removed per user request
const logger = {
  info: (...args: any) => { },
  error: (...args: any) => { },
};

/**
 * Webhook handler for products/update
 * Processes product update events from Shopify
 * Uses GraphQL API to process webhook event
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);

    const { app_subscription } = payload;

    logger.info('Product update webhook received', {
      shop,
      topic,
      app_subscription: app_subscription
    });

    // Process webhook via GraphQL API
    try {
      const query = `
            mutation UpdateSubscriptionStatus($id: String!) {
              updateSubscriptionStatus(
                id: $id
              ) {
                id
                status
                updatedAt
              }
            }
        `;

      if (app_subscription && app_subscription.admin_graphql_api_id && app_subscription.status === "ACTIVE") {
        const result = await graphqlRequest(query, { id: app_subscription.admin_graphql_api_id, shop });
        console.log("GraphQL response for app_subscription update:", result);
      }
      else{
        console.log("Subscription Invalid:", app_subscription);
      }

    } catch (graphqlError: any) {
      // Log GraphQL error but don't fail the webhook
      logger.error('Error processing webhook via GraphQL', {
        shop,
        topic,
        error: graphqlError?.message || graphqlError,
      });
    }

    // Return 200 OK immediately (async processing)
    return new Response(JSON.stringify({ success: true, shop, topic }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logger.error('Error processing products/update webhook', {
      error: error?.message || error,
      stack: error?.stack,
    });

    // Return 200 to prevent Shopify from retrying
    return new Response(JSON.stringify({ success: false, error: error?.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};