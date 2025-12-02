import type { ActionFunctionArgs } from "react-router";
import type { Session } from "@shopify/shopify-app-react-router/server";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);

    const current = payload.current as string[];
    if (session) {
        // Update session with new scope using Elasticsearch session storage
        // Create updated session with new scope - session already has all required properties
        const updatedSession: Session = {
            ...session,
            scope: current.join(','),
        } as Session;
        await sessionStorage.storeSession(updatedSession);
    }
    return new Response();
};
