/**
 * ERROR HANDLING EXAMPLES
 * 
 * This file demonstrates how to use the error handling system in your Remix routes.
 * DO NOT IMPORT THIS FILE - Use the patterns shown here in your actual routes.
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { graphqlRequest } from "../graphql.server";
import { safeGraphqlRequest } from "../utils/safe-graphql-request";
import { GraphQLErrorBoundary } from "../components/GraphQLErrorBoundary";
import { InlineErrorState } from "../components/InlineErrorState";

// ============================================================================
// EXAMPLE 1: Critical Route - Show Full Error Page if GraphQL Fails
// ============================================================================

export const criticalRouteLoader = async ({ request }: LoaderFunctionArgs) => {
  // This will throw a GraphQLError if it fails
  // The error boundary will catch it and show the downtime screen
  const data = await graphqlRequest(`
    query GetCriticalData($shop: String!) {
      shop(domain: $shop) {
        id
        name
      }
    }
  `, { shop: "example.myshopify.com" });

  return { data };
};

export function CriticalRoute() {
  const { data } = useLoaderData<typeof criticalRouteLoader>();
  
  return (
    <s-page heading="Critical Data">
      <s-text>{data.shop.name}</s-text>
    </s-page>
  );
}

// Add error boundary to catch GraphQL errors
export function ErrorBoundary() {
  const error = useRouteError();
  
  if (error && typeof error === "object" && ("code" in error || "isNetworkError" in error)) {
    return <GraphQLErrorBoundary />;
  }
  
  // Handle other errors...
  return <div>An error occurred</div>;
}

// ============================================================================
// EXAMPLE 2: Non-Critical Route - Show Inline Error if GraphQL Fails
// ============================================================================

export const nonCriticalRouteLoader = async ({ request }: LoaderFunctionArgs) => {
  // Use safeGraphqlRequest to catch errors without throwing
  const { data, error } = await safeGraphqlRequest(`
    query GetOptionalData($shop: String!) {
      filters(shop: $shop) {
        filters {
          id
          title
        }
      }
    }
  `, { shop: "example.myshopify.com" });

  // Return both data and error
  return { data, error: error ? {
    message: error.message,
    code: error.code,
    endpoint: error.endpoint,
    timestamp: error.timestamp,
  } : null };
};

export function NonCriticalRoute() {
  const { data, error } = useLoaderData<typeof nonCriticalRouteLoader>();
  
  return (
    <s-page heading="Optional Data">
      {error ? (
        <InlineErrorState
          error={error.message}
          errorDetails={error}
          onRetry={() => window.location.reload()}
        />
      ) : (
        <s-section>
          <s-text>Filters: {data?.filters?.filters?.length || 0}</s-text>
        </s-section>
      )}
    </s-page>
  );
}

// ============================================================================
// EXAMPLE 3: Mixed Route - Critical and Optional Data
// ============================================================================

export const mixedRouteLoader = async ({ request }: LoaderFunctionArgs) => {
  // Critical data - will throw if it fails
  const criticalData = await graphqlRequest(`
    query GetShop($shop: String!) {
      shop(domain: $shop) {
        id
        name
      }
    }
  `, { shop: "example.myshopify.com" });

  // Optional data - won't throw if it fails
  const { data: optionalData, error } = await safeGraphqlRequest(`
    query GetFilters($shop: String!) {
      filters(shop: $shop) {
        total
      }
    }
  `, { shop: "example.myshopify.com" });

  return {
    shop: criticalData.shop,
    filtersTotal: optionalData?.filters?.total || 0,
    filtersError: error ? {
      message: error.message,
      timestamp: error.timestamp,
    } : null,
  };
};

export function MixedRoute() {
  const { shop, filtersTotal, filtersError } = useLoaderData<typeof mixedRouteLoader>();
  
  return (
    <s-page heading={shop.name}>
      {/* Critical data is always shown */}
      <s-section>
        <s-text>Shop ID: {shop.id}</s-text>
      </s-section>

      {/* Optional data shows error inline if failed */}
      <s-section>
        {filtersError ? (
          <InlineErrorState
            error={filtersError.message}
            errorDetails={filtersError}
            compact
          />
        ) : (
          <s-text>Total Filters: {filtersTotal}</s-text>
        )}
      </s-section>
    </s-page>
  );
}

// Error boundary for critical data failures
export function MixedRouteErrorBoundary() {
  return <GraphQLErrorBoundary />;
}

// ============================================================================
// EXAMPLE 4: Action with Error Handling
// ============================================================================

export const actionWithErrorHandling = async ({ request }: LoaderFunctionArgs) => {
  const formData = await request.formData();
  const name = formData.get("name") as string;

  try {
    const result = await graphqlRequest(`
      mutation CreateFilter($input: CreateFilterInput!) {
        createFilter(input: $input) {
          id
          title
        }
      }
    `, {
      input: { shop: "example.myshopify.com", title: name }
    });

    return { success: true, data: result };
  } catch (error: any) {
    // Return error to be displayed inline
    return {
      success: false,
      error: {
        message: error.message || "Failed to create filter",
        code: error.code || "UNKNOWN",
        timestamp: error.timestamp || new Date().toISOString(),
      },
    };
  }
};

export function ActionRoute() {
  const actionData = useLoaderData<typeof actionWithErrorHandling>();
  
  return (
    <s-page heading="Create Filter">
      {actionData?.error && (
        <InlineErrorState
          error={actionData.error.message}
          errorDetails={actionData.error}
          onRetry={() => window.location.reload()}
        />
      )}
      
      {actionData?.success && (
        <s-banner tone="success">
          <s-text>Filter created successfully!</s-text>
        </s-banner>
      )}
      
      <form method="post">
        <input name="name" placeholder="Filter name" />
        <button type="submit">Create</button>
      </form>
    </s-page>
  );
}

// ============================================================================
// KEY POINTS
// ============================================================================

/*
1. USE graphqlRequest() FOR CRITICAL DATA
   - Throws GraphQLError on failure
   - Error boundary catches it and shows full downtime screen
   - User sees nice UI with retry option and debug toggle

2. USE safeGraphqlRequest() FOR OPTIONAL DATA
   - Returns { data, error } without throwing
   - Show InlineErrorState component for errors
   - Page still loads, just shows error for failed section

3. ERROR BOUNDARIES
   - Add ErrorBoundary export to routes using graphqlRequest()
   - Check for GraphQL errors and use GraphQLErrorBoundary
   - Falls back to default boundary for other errors

4. DEBUG INFO
   - Downtime screen has collapsible debug section
   - Shows error message, stack trace, endpoint, timestamp
   - Hidden by default - users must click to see
   - Perfect for production debugging without exposing errors

5. RETRY FUNCTIONALITY
   - Both screens have retry button
   - Simple window.location.reload() works
   - Can implement smarter retry logic if needed
*/

