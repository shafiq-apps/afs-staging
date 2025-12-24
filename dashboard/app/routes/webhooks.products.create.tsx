import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { graphqlRequest } from "../utils/graphql.client";

// Simple logger for dashboard webhooks
// No-op logger - logging removed per user request
const logger = {
  info: (...args: any) => {},
  error: (...args: any) => {},
};

/**
 * Webhook handler for products/create
 * Processes product creation events from Shopify
 * Uses GraphQL API to process webhook event
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    
    logger.info('Product create webhook received', {
      shop,
      topic,
      productId: payload?.id,
      productTitle: payload?.title,
    });

    // Process webhook via GraphQL API
    try {
      const mutation = `
        mutation ProcessWebhook($input: WebhookEventInput!) {
          processWebhook(input: $input) {
            success
            message
            webhookId
            processedAt
          }
        }
      `;

      const variables = {
        input: {
          topic,
          shop,
          eventType: 'products/create',
          payload: payload,
          receivedAt: new Date().toISOString(),
          productId: payload?.id?.toString(),
          productGid: payload?.admin_graphql_api_id,
          productTitle: payload?.title,
          productHandle: payload?.handle,
        },
      };

      const result = await graphqlRequest(mutation, variables);

      if (result?.processWebhook?.success) {
        logger.info('Webhook processed successfully', {
          shop,
          topic,
          webhookId: result.processWebhook.webhookId,
        });
      } else {
        logger.error('Webhook processing failed', {
          shop,
          topic,
          result,
        });
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
    logger.error('Error processing products/create webhook', {
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

