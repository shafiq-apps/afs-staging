// app/utils/require-subscription.ts
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { checkSubscription } from "app/subscription.server";

export async function requireSubscription({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop;

  if (!shop) {
    throw redirect("/login"); // user not logged in
  }

  const subscription = await checkSubscription(shop);

  if (!subscription) {
    // redirect to pricing page
    throw redirect("/pricing");
  }

  return subscription;
}
