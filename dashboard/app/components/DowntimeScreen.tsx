import { useState, useEffect } from "react";
import { generateCrashReport, sendCrashReport } from "../utils/crash-report";

interface DowntimeScreenProps {
  error?: Error | string;
  errorDetails?: {
    message: string;
    stack?: string;
    timestamp: string;
    endpoint?: string;
    serverMessage?: string; // Original server error message
    serverResponse?: any; // Full server response
    statusCode?: number;
    code?: string;
  };
  onRetry?: () => void;
}

export function DowntimeScreen({ error, errorDetails, onRetry }: DowntimeScreenProps) {
  const [showDebug, setShowDebug] = useState(false);
  const [crashReportSaved, setCrashReportSaved] = useState(false);
  const [savingReport, setSavingReport] = useState(false);

  const errorMessage = typeof error === "string" ? error : error?.message || "An unexpected error occurred";

  // Automatically generate and send crash report on mount (SILENT - no UI feedback)
  useEffect(() => {
    const saveCrashReport = async () => {
      if (crashReportSaved || savingReport) return;
      
      setSavingReport(true);
      
      try {
        const errorObj = typeof error === "string" ? { message: error } : error;
        const report = generateCrashReport(
          { ...errorObj, ...errorDetails },
          { page: 'ErrorBoundary', component: 'DowntimeScreen' }
        );
        
        const success = await sendCrashReport(report);
        setCrashReportSaved(success);
        
      } catch (err) {
        console.error('[Crash Report] Error saving crash report:', err);
      } finally {
        setSavingReport(false);
      }
    };
    
    saveCrashReport();
  }, [error, errorDetails, crashReportSaved, savingReport]);


  return (
    <s-page heading="Service Unavailable" data-page-id="downtime">
      <s-section heading="Service Temporarily Unavailable">
        <s-stack direction="block" gap="large">
          <s-text tone="auto">
            We're experiencing technical difficulties. Our team has been notified and is working to resolve this issue.
          </s-text>
          <s-stack direction="block" gap="large" alignItems="center">
            {/* Status Banner */}
            <s-banner tone="warning">
              <s-stack direction="block" gap="small">
                <s-text type="strong">What's happening?</s-text>
                <s-text>
                  Our backend service is currently unavailable. This could be due to maintenance, high traffic, or a temporary network issue.
                </s-text>
              </s-stack>
            </s-banner>
          </s-stack>
        </s-stack>
      </s-section>

      {/* Suggestions */}
      <s-section>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-text type="strong">Things you can try:</s-text>
            <s-unordered-list>
              <s-list-item>
                <s-text>Wait a few minutes and try again</s-text>
              </s-list-item>
              <s-list-item>
                <s-text>Check your internet connection</s-text>
              </s-list-item>
              <s-list-item>
                <s-text>Clear your browser cache</s-text>
              </s-list-item>
              <s-list-item>
                <s-text>Contact support if the issue persists</s-text>
              </s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-box>
      </s-section>

      {/* Debug Toggle (for developers only) */}
      {errorDetails && (
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-button
              variant="secondary"
              onClick={() => setShowDebug(!showDebug)}
            >
              {showDebug ? "Hide" : "Show"} Technical Details
            </s-button>
          </s-stack>

          {showDebug && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="base"
            >
              <div style={{
                fontFamily: "monospace",
                fontSize: "12px",
                backgroundColor: "#1a1a1a",
                color: "#e8e8e8",
                padding: "16px",
                borderRadius: "6px",
                maxHeight: "500px",
                overflow: "auto",
              }}>
                <s-stack direction="block" gap="base">
                  {/* Error Code & Status */}
                  <div>
                    <div style={{ color: "#ff6b6b", fontWeight: "bold" }}>Error Code:</div>
                    <div style={{ marginTop: "4px", color: "#ffd93d" }}>
                      {errorDetails.code || "UNKNOWN"} 
                      {errorDetails.statusCode && ` (HTTP ${errorDetails.statusCode})`}
                    </div>
                  </div>

                  {/* User-Friendly Message */}
                  <div>
                    <div style={{ color: "#74c0fc", fontWeight: "bold" }}>User Message:</div>
                    <div style={{ marginTop: "4px", color: "#ffd93d" }}>{errorMessage}</div>
                  </div>

                  {/* Server Error Message */}
                  {errorDetails.serverMessage && (
                    <div>
                      <div style={{ color: "#ffa94d", fontWeight: "bold" }}>Server Message:</div>
                      <div style={{ marginTop: "4px", color: "#ffe066" }}>
                        {errorDetails.serverMessage}
                      </div>
                    </div>
                  )}

                  {/* Endpoint */}
                  {errorDetails.endpoint && (
                    <div>
                      <div style={{ color: "#51cf66", fontWeight: "bold" }}>Endpoint:</div>
                      <div style={{ color: "#ffffff", marginTop: "4px", wordBreak: "break-all" }}>
                        {errorDetails.endpoint}
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  <div>
                    <div style={{ color: "#4dabf7", fontWeight: "bold" }}>Timestamp:</div>
                    <div style={{ color: "#ffffff", marginTop: "4px" }}>
                      {new Date(errorDetails.timestamp).toLocaleString()}
                    </div>
                  </div>

                  {/* Server Response (JSON) */}
                  {errorDetails.serverResponse && (
                    <div>
                      <div style={{ color: "#da77f2", fontWeight: "bold" }}>Server Response:</div>
                      <pre style={{
                        marginTop: "4px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: "11px",
                        lineHeight: "1.4",
                        margin: 0,
                        color: "#ffffff",
                        backgroundColor: "#0a0a0a",
                        padding: "8px",
                        borderRadius: "4px",
                      }}>
                        {JSON.stringify(errorDetails.serverResponse, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Stack Trace */}
                  {errorDetails.stack && (
                    <div>
                      <div style={{ color: "#ff8787", fontWeight: "bold" }}>Stack Trace:</div>
                      <pre style={{
                        marginTop: "4px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: "11px",
                        lineHeight: "1.4",
                        margin: 0,
                        color: "#ffffff",
                        backgroundColor: "#0a0a0a",
                        padding: "8px",
                        borderRadius: "4px",
                      }}>
                        {errorDetails.stack}
                      </pre>
                    </div>
                  )}
                </s-stack>
              </div>
            </s-box>
          )}
        </s-stack>
      )}
    </s-page>
  );
}

