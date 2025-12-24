import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { graphqlRequest } from "../utils/graphql.client";

// Simple logger for dashboard webhooks
// No-op logger - logging removed per user request
const logger = {
  info: (...args: any) => {},
  error: (...args: any) => {},
};

// Best seller collection handle constant
const BEST_SELLER_COLLECTION_HANDLE = 'afs_best_sellers_ranking';

/**
 * Webhook handler for collections/update
 * Processes collection update events from Shopify
 * Specifically tracks best_seller_collections updates
 * Uses GraphQL API to process webhook event
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    
    const collectionHandle = payload?.handle;
    const isBestSellerCollection = collectionHandle === BEST_SELLER_COLLECTION_HANDLE;
    
    logger.info('Collection update webhook received', {
      shop,
      topic,
      collectionId: payload?.id,
      collectionHandle,
      isBestSellerCollection,
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
          eventType: 'collections/update',
          payload: payload,
          receivedAt: new Date().toISOString(),
          collectionId: payload?.id?.toString(),
          collectionGid: payload?.admin_graphql_api_id,
          collectionHandle,
          collectionTitle: payload?.title,
          isBestSellerCollection,
          sortOrderUpdated: payload?.sort_order !== undefined,
        },
      };

      const result = await graphqlRequest(mutation, variables);

      if (result?.processWebhook?.success) {
        logger.info('Webhook processed successfully', {
          shop,
          topic,
          webhookId: result.processWebhook.webhookId,
          isBestSellerCollection,
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
    logger.error('Error processing collections/update webhook', {
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

