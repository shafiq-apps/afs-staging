import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { graphqlRequest } from "../utils/graphql.client";
import { createLogger } from "app/utils/logger";

const logger = createLogger({ prefix: "webhooks.collection.delete" });

// Best seller collection handle constant
const BEST_SELLER_COLLECTION_HANDLE = 'afs_best_sellers_ranking';

/**
 * Webhook handler for collections/delete
 * Processes collection deletion events from Shopify
 * Specifically tracks best_seller_collections deletions
 * Uses GraphQL API to process webhook event
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);
    
    const collectionHandle = payload?.handle;
    const isBestSellerCollection = collectionHandle === BEST_SELLER_COLLECTION_HANDLE;
    
    logger.info('Collection delete webhook received', {
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
          eventType: 'collections/delete',
          payload: payload,
          receivedAt: new Date().toISOString(),
          collectionId: payload?.id?.toString(),
          collectionGid: payload?.admin_graphql_api_id,
          collectionHandle,
          isBestSellerCollection,
        },
        shop
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
    logger.error('Error processing collections/delete webhook', {
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

