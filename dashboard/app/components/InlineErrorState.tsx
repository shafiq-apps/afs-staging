import { useState } from "react";

interface InlineErrorStateProps {
  error: Error | string;
  onRetry?: () => void;
  errorDetails?: {
    message: string;
    timestamp?: string;
    endpoint?: string;
  };
  compact?: boolean;
}

export function InlineErrorState({ 
  error, 
  onRetry, 
  errorDetails,
  compact = false 
}: InlineErrorStateProps) {
  const [showDebug, setShowDebug] = useState(false);
  const errorMessage = typeof error === "string" ? error : error?.message || "An error occurred";

  if (compact) {
    return (
      <s-banner tone="critical">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text>{errorMessage}</s-text>
          {onRetry && (
            <s-button variant="secondary" size="small" onClick={onRetry}>
              Retry
            </s-button>
          )}
        </s-stack>
      </s-banner>
    );
  }

  return (
    <s-section>
      <s-box
        padding="base"
        borderWidth="base"
        borderRadius="base"
        background="base"
      >
        <s-stack direction="block" gap="base">
          {/* Error Header */}
          <s-stack direction="inline" gap="small" alignItems="center">
            <span style={{ fontSize: "24px" }}>⚠️</span>
            <s-heading>Unable to Load Data</s-heading>
          </s-stack>

          {/* Error Message */}
          <s-banner tone="critical">
            <s-text>{errorMessage}</s-text>
          </s-banner>

          {/* Actions */}
          {onRetry && (
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" onClick={onRetry} icon="refresh">
                Try Again
              </s-button>
              <s-button variant="secondary" href="/app/support">
                Contact Support
              </s-button>
            </s-stack>
          )}

          {/* Debug Toggle */}
          {errorDetails && (
            <s-stack direction="block" gap="small">
              <s-button
                variant="secondary"
                size="small"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? "Hide" : "Show"} Technical Details
              </s-button>

              {showDebug && (
                <s-box
                  padding="small"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <div style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}>
                    <div><strong>Error:</strong> {errorDetails.message}</div>
                    {errorDetails.endpoint && (
                      <div style={{ marginTop: "8px" }}>
                        <strong>Endpoint:</strong> {errorDetails.endpoint}
                      </div>
                    )}
                    {errorDetails.timestamp && (
                      <div style={{ marginTop: "8px" }}>
                        <strong>Time:</strong> {new Date(errorDetails.timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                </s-box>
              )}
            </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-section>
  );
}

