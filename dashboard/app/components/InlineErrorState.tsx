import { useState } from "react";
import { t } from "app/utils/translations";
import { createPath } from "../utils/paths";

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
  const errorMessage = typeof error === "string" ? error : error?.message || t("errors.generic");

  if (compact) {
    return (
      <s-banner tone="critical">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text>{errorMessage}</s-text>
          {onRetry && (
            <s-button variant="secondary" onClick={onRetry}>
              {t("errors.retry")}
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
            <s-heading>{t("errors.unableToLoad")}</s-heading>
          </s-stack>

          {/* Error Message */}
          <s-banner tone="critical">
            <s-text>{errorMessage}</s-text>
          </s-banner>

          {/* Actions */}
          {onRetry && (
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" onClick={onRetry} icon="refresh">
                {t("errors.tryAgain")}
              </s-button>
              <s-button variant="secondary" href={createPath("app/support")}>
                {t("errors.contactSupport")}
              </s-button>
            </s-stack>
          )}

          {/* Debug Toggle */}
          {errorDetails && (
            <s-stack direction="block" gap="small">
              <s-button
                variant="secondary"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? t("errors.hideDetails") : t("errors.showDetails")}
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
                    <div><strong>{t("errors.technicalDetails.error")}:</strong> {errorDetails.message}</div>
                    {errorDetails.endpoint && (
                      <div style={{ marginTop: "8px" }}>
                        <strong>{t("errors.technicalDetails.endpoint")}:</strong> {errorDetails.endpoint}
                      </div>
                    )}
                    {errorDetails.timestamp && (
                      <div style={{ marginTop: "8px" }}>
                        <strong>{t("errors.technicalDetails.time")}:</strong> {new Date(errorDetails.timestamp).toLocaleString()}
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

