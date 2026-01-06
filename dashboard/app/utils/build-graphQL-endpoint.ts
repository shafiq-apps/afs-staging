import { extractShopifyDomain } from "./extract-shopify-domain";

/**
 * Builds a valid GraphQL endpoint with optional shop query param
 */
export function buildGraphQLEndpoint(
  options?: {
    shop?: string;
    appUrl?: string;
    graphqlPath?: string;
    fallbackUrl?: string;
  }
): string {
  const {
    shop,
    appUrl = process.env.SHOPIFY_APP_URL,
    graphqlPath = process.env.GRAPHQL_ENDPOINT || "/graphql",
    fallbackUrl = "https://fstaging.digitalcoo.com/graphql",
  } = options || {};

  let baseUrl: string;

  console.log("process.env.NODE_ENV", process.env.NODE_ENV);

  let localAppUrl;

  if (process.env.NODE_ENV === 'development') {
    localAppUrl = 'http://localhost:3554';
  }

  // Validate base app URL
  if (appUrl) {
    try {
      baseUrl = new URL(graphqlPath, localAppUrl??appUrl).toString();
    } catch {
      baseUrl = fallbackUrl;
    }
  } else {
    baseUrl = fallbackUrl;
  }

  // Append shop query param safely
  if (shop) {
    const domain = extractShopifyDomain(shop);
    if (domain) {
      const url = new URL(baseUrl);
      url.searchParams.set("shop", domain);
      return url.toString();
    }
  }

  return baseUrl;
}
