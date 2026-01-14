import { useRouteError, isRouteErrorResponse } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type React from "react";
import { DowntimeScreen } from "./DowntimeScreen";

export function GraphQLErrorBoundary() {
  const error = useRouteError();

  // Get API key from window (set by app.tsx)
  const apiKey = (typeof window !== "undefined" && (window as any).__SHOPIFY_API_KEY) || "";

  // Render function that wraps content in AppProvider
  const renderWithProvider = (content: React.ReactNode) => {
    return (
      <AppProvider apiKey={apiKey} embedded={true}>
        {content}
      </AppProvider>
    );
  };

  // Handle Remix route errors (Response throws)
  if (isRouteErrorResponse(error)) {
    
    // Try to parse the data (might be string or object)
    let errorData: any = error.data;
    if (typeof errorData === "string") {
      try {
        errorData = JSON.parse(errorData);
      } catch (e) {
      }
    }

    
    // Check if it's a GraphQL error from our Response throw
    if (errorData && typeof errorData === "object" && errorData.isGraphQLError) {
      return renderWithProvider(
        <DowntimeScreen
          error={{
            ...errorData,
            message: errorData.message || error.statusText,
          }}
          errorDetails={{
            message: errorData.message || error.statusText,
            stack: errorData.stack,
            timestamp: errorData.timestamp || new Date().toISOString(),
            endpoint: errorData.endpoint,
            serverMessage: errorData.serverMessage,
            serverResponse: errorData.serverResponse,
            statusCode: errorData.statusCode,
            code: errorData.code,
          }}
          onRetry={() => window.location.reload()}
        />
      );
    }
    
    // Generic route error
    return renderWithProvider(
      <DowntimeScreen
        error={error.statusText}
        errorDetails={{
          message: error.statusText,
          timestamp: new Date().toISOString(),
        }}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Handle direct GraphQL error objects
  if (error && typeof error === "object" && ("code" in error || "isGraphQLError" in error)) {
   
    const gqlError = error as any;
    
    return renderWithProvider(
      <DowntimeScreen
        error={gqlError}
        errorDetails={{
          message: gqlError.message,
          stack: gqlError.stack,
          timestamp: gqlError.timestamp || new Date().toISOString(),
          endpoint: gqlError.endpoint,
          serverMessage: gqlError.serverMessage,
          serverResponse: gqlError.serverResponse,
          statusCode: gqlError.statusCode,
          code: gqlError.code,
        }}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Handle regular Error instances
  if (error instanceof Error) {
    return renderWithProvider(
      <DowntimeScreen
        error={error}
        errorDetails={{
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        }}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Fallback for unknown errors
  return renderWithProvider(
    <DowntimeScreen
      error="An unknown error occurred"
      errorDetails={{
        message: String(error),
        timestamp: new Date().toISOString(),
      }}
      onRetry={() => window.location.reload()}
    />
  );
}

