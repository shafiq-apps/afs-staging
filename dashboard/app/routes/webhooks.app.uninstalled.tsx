import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { ElasticsearchSessionStorage } from "../session-storage/elasticsearch-session-storage";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    // Delete all sessions for the shop using Elasticsearch session storage
    // Access the ElasticsearchSessionStorage instance directly to use deleteSessionsByShop method
    const esSessionStorage = sessionStorage as unknown as ElasticsearchSessionStorage;
    if (esSessionStorage && typeof esSessionStorage.deleteSessionsByShop === 'function') {
      await esSessionStorage.deleteSessionsByShop(shop);
    } else if (session.id) {
      // Fallback to deleteSession if deleteSessionsByShop is not available
      await sessionStorage.deleteSession(session.id);
    }
  }

  return new Response();
};
