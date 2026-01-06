import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createModuleLogger } from "app/utils/logger";

const logger = createModuleLogger("webhooks.callback");

/**
 * Webhook handler for products/update
 * Processes product update events from Shopify
 * Uses GraphQL API to process webhook event
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic, payload } = await authenticate.webhook(request);

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