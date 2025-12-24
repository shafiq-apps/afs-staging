import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { ElasticsearchSessionStorage } from "../session-storage/elasticsearch-session-storage";
import { graphqlRequest } from "../utils/graphql.client";

// Simple logger for dashboard webhooks
// No-op logger - logging removed per user request
const logger = {
  info: (...args: any) => {},
  error: (...args: any) => {},
};

/**
 * Webhook handler for app/uninstalled
 * Processes app uninstallation events from Shopify
 * Uses GraphQL API to process uninstallation cleanup
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    logger.info('App uninstall webhook received', {
      shop,
      topic,
    });

    // Delete all sessions for the shop using Elasticsearch session storage
    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      const esSessionStorage = sessionStorage as unknown as ElasticsearchSessionStorage;
      if (esSessionStorage && typeof esSessionStorage.deleteSessionsByShop === 'function') {
        await esSessionStorage.deleteSessionsByShop(shop);
      } else if (session.id) {
        // Fallback to deleteSession if deleteSessionsByShop is not available
        await sessionStorage.deleteSession(session.id);
      }
    }

    // Process uninstallation via GraphQL API
    // This handles: delete product index, delete filters, clean up checkpoints/locks, update shop status
    try {
      const mutation = `
        mutation ProcessAppUninstall($shop: String!) {
          processAppUninstall(shop: $shop) {
            success
            message
            webhookId
            processedAt
          }
        }
      `;

      const variables = { shop };
      const result = await graphqlRequest(mutation, variables);

      if (result?.processAppUninstall?.success) {
        logger.info('App uninstallation processed successfully', {
          shop,
          webhookId: result.processAppUninstall.webhookId,
          processedAt: result.processAppUninstall.processedAt,
        });
      } else {
        logger.error('App uninstallation processing failed', {
          shop,
          result,
        });
      }
    } catch (graphqlError: any) {
      // Log GraphQL error but don't fail the webhook
      // This prevents Shopify from retrying
      logger.error('Error processing uninstallation via GraphQL', {
        shop,
        error: graphqlError?.message || graphqlError,
      });
    }

    return new Response(JSON.stringify({ success: true, shop, topic }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logger.error('Error processing app/uninstalled webhook', {
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
