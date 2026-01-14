import { GraphQLError } from "../graphql.server";

export function isGraphQLError(error: any): error is GraphQLError {
  return error instanceof GraphQLError || (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "endpoint" in error
  );
}

export function isNetworkError(error: any): boolean {
  if (isGraphQLError(error)) {
    return error.isNetworkError;
  }
  return (
    error instanceof TypeError &&
    (error.message.includes("fetch") || error.message.includes("network"))
  );
}

export function isServerError(error: any): boolean {
  if (isGraphQLError(error)) {
    return error.isServerError;
  }
  return false;
}

export function getErrorMessage(error: any): string {
  if (isGraphQLError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

export function formatErrorForDisplay(error: any): {
  message: string;
  code: string;
  isRetryable: boolean;
  userMessage: string;
} {
  if (isGraphQLError(error)) {
    const isRetryable = error.isNetworkError || error.isServerError;
    return {
      message: error.message,
      code: error.code,
      isRetryable,
      userMessage: isRetryable
        ? "This appears to be a temporary issue. Please try again."
        : "Please contact support if this issue persists.",
    };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    code: "UNKNOWN",
    isRetryable: true,
    userMessage: "Please try again or contact support if the issue persists.",
  };
}

