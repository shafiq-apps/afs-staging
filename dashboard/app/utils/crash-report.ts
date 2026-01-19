/**
 * Crash Report System
 * Captures COMPREHENSIVE error information and sends to server for logging
 * 
 * CAPTURED DATA INCLUDES:
 * 
 * 1. Error Details:
 *    - Error message, code, status, stack trace
 *    - Server error message and full response
 * 
 * 2. Request/Response Payloads (COMPLETE):
 *    - GraphQL query and variables (sanitized)
 *    - Request headers (auth tokens redacted)
 *    - Response payload and headers
 * 
 * 3. Shop Information (for customer contact):
 *    - Shop name, domain, contact email
 *    - Shopify plan, owner identifier
 * 
 * 4. Application State:
 *    - localStorage (sanitized)
 *    - sessionStorage (sanitized)
 *    - Cookies (names only)
 * 
 * 5. Performance Metrics:
 *    - Memory usage
 *    - Page load timing
 *    - Resource count
 * 
 * 6. Browser Context:
 *    - User agent, platform, viewport
 *    - Navigation history
 *    - Console errors and logs
 * 
 * All sensitive data (tokens, passwords, secrets) is automatically redacted.
 */

export interface CrashReport {
  // Error Information
  errorMessage: string;
  errorCode?: string;
  statusCode?: number;
  stack?: string;
  serverMessage?: string;
  serverResponse?: any;
  
  // Deduplication
  signature?: string;
  
  // Request Information
  endpoint?: string;
  method?: string;
  requestPayload?: any; // GraphQL query, variables, body, etc.
  requestHeaders?: Record<string, string>; // Sanitized headers
  
  // Response Information
  responsePayload?: any; // Full response data
  responseHeaders?: Record<string, string>;
  
  // Page Information
  pageUrl: string;
  pagePath: string;
  referrer: string;
  
  // Navigation History
  navigationHistory?: string[];
  
  // User Information
  userAgent: string;
  platform: string;
  screenResolution: string;
  viewport: string;
  
  // Session/Shop Information
  shop?: string;
  shopDetails?: {
    domain: string;
    name?: string;
    email?: string;
    contactEmail?: string;
    customerEmail?: string;
    myshopifyDomain?: string;
    plan?: string;
    owner?: string;
  };
  sessionData?: any;
  
  // Application State
  localStorage?: Record<string, any>; // Sanitized local storage
  sessionStorage?: Record<string, any>; // Sanitized session storage
  cookies?: string[]; // Cookie names only (not values)
  
  // Performance Metrics
  performanceMetrics?: {
    memory?: any;
    timing?: any;
    navigation?: any;
    resourceCount?: number;
  };
  
  // Browser/Console Information
  consoleErrors?: string[];
  recentLogs?: string[];
  
  // Timing Information
  timestamp: string;
  formattedTime: string;
  
  // Browser Information
  browserLanguage: string;
  timezone: string;
  
  // Additional Context
  additionalContext?: Record<string, any>;
}

/**
 * Generate a comprehensive crash report
 */
export function generateCrashReport(error: any, additionalContext?: Record<string, any>): CrashReport {
  const now = new Date();
  
  return {
    // Error Information
    errorMessage: error?.message || String(error),
    errorCode: error?.code,
    statusCode: error?.statusCode,
    stack: error?.stack,
    serverMessage: error?.serverMessage,
    serverResponse: error?.serverResponse,
    
    // Request Information
    endpoint: error?.endpoint,
    method: error?.method || 'UNKNOWN',
    requestPayload: extractRequestPayload(error),
    requestHeaders: extractSanitizedHeaders(error?.requestHeaders),
    
    // Response Information
    responsePayload: error?.responsePayload || error?.data,
    responseHeaders: extractSanitizedHeaders(error?.responseHeaders),
    
    // Page Information
    pageUrl: typeof window !== 'undefined' ? window.location.href : 'SSR',
    pagePath: typeof window !== 'undefined' ? window.location.pathname : 'SSR',
    referrer: typeof window !== 'undefined' ? document.referrer : 'NONE',
    
    // Navigation History
    navigationHistory: extractNavigationHistory(),
    
    // User Information
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'UNKNOWN',
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'UNKNOWN',
    screenResolution: typeof window !== 'undefined' 
      ? `${window.screen.width}x${window.screen.height}`
      : 'UNKNOWN',
    viewport: typeof window !== 'undefined'
      ? `${window.innerWidth}x${window.innerHeight}`
      : 'UNKNOWN',
    
    // Session/Shop Information
    shop: (typeof window !== 'undefined' && (window as any).__SHOP) || 'UNKNOWN',
    shopDetails: extractShopDetails(),
    sessionData: extractSafeSessionData(),
    
    // Application State
    localStorage: extractLocalStorage(),
    sessionStorage: extractSessionStorageData(),
    cookies: extractCookieNames(),
    
    // Performance Metrics
    performanceMetrics: extractPerformanceMetrics(),
    
    // Console Information
    consoleErrors: extractConsoleErrors(),
    recentLogs: extractRecentLogs(),
    
    // Timing Information
    timestamp: now.toISOString(),
    formattedTime: now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    
    // Browser Information
    browserLanguage: typeof navigator !== 'undefined' ? navigator.language : 'UNKNOWN',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    
    // Additional Context
    additionalContext,
  };
}

/**
 * Extract shop details from window
 */
function extractShopDetails(): any {
  if (typeof window === 'undefined') return null;
  
  try {
    const shopData = (window as any).__SHOP_DETAILS;
    if (!shopData) return null;
    
    return {
      domain: shopData.domain || shopData.shop,
      name: shopData.name || shopData.shopName,
      email: shopData.email,
      contactEmail: shopData.contactEmail,
      customerEmail: shopData.customerEmail,
      myshopifyDomain: shopData.myshopifyDomain,
      plan: shopData.plan,
      owner: shopData.owner,
    };
  } catch {
    return null;
  }
}

/**
 * Extract safe session data (no sensitive info)
 */
function extractSafeSessionData(): any {
  if (typeof window === 'undefined') return null;
  
  try {
    return {
      apiKeyPresent: !!(window as any).__SHOPIFY_API_KEY,
      shopPresent: !!(window as any).__SHOP,
      shopDetailsPresent: !!(window as any).__SHOP_DETAILS,
    };
  } catch {
    return null;
  }
}

/**
 * Extract request payload (GraphQL queries, variables, etc.)
 */
function extractRequestPayload(error: any): any {
  if (!error) return null;
  
  try {
    // Extract GraphQL query and variables if present
    const payload: any = {};
    
    if (error.query || error.graphqlQuery) {
      payload.graphqlQuery = error.query || error.graphqlQuery;
    }
    
    if (error.variables || error.graphqlVariables) {
      // Sanitize sensitive data from variables
      payload.graphqlVariables = sanitizeObject(error.variables || error.graphqlVariables);
    }
    
    if (error.body || error.requestBody) {
      payload.body = sanitizeObject(error.body || error.requestBody);
    }
    
    return Object.keys(payload).length > 0 ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Extract and sanitize headers
 */
function extractSanitizedHeaders(headers: any): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  
  const sanitized: Record<string, string> = {};
  const sensitiveKeys = ['authorization', 'cookie', 'x-shopify-access-token', 'api-key'];
  
  try {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = String(value);
      }
    }
    return sanitized;
  } catch {
    return undefined;
  }
}

/**
 * Extract navigation history
 */
function extractNavigationHistory(): string[] {
  if (typeof window === 'undefined') return [];
  
  try {
    // Try to get navigation history from browser
    const history: string[] = [];
    
    // Get current and previous pages if available
    if (document.referrer) {
      history.push(`Previous: ${document.referrer}`);
    }
    history.push(`Current: ${window.location.href}`);
    
    // Add any custom navigation tracking if exists
    const customHistory = (window as any).__NAVIGATION_HISTORY;
    if (Array.isArray(customHistory)) {
      history.push(...customHistory.slice(-5)); // Last 5 navigations
    }
    
    return history;
  } catch {
    return [];
  }
}

/**
 * Extract localStorage (sanitized)
 */
function extractLocalStorage(): Record<string, any> | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  
  try {
    const storage: Record<string, any> = {};
    const keysToInclude = ['theme', 'preferences', 'settings', 'cache'];
    const keysToExclude = ['token', 'password', 'secret', 'key', 'auth'];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      const lowerKey = key.toLowerCase();
      const shouldExclude = keysToExclude.some(excludeKey => lowerKey.includes(excludeKey));
      const shouldInclude = keysToInclude.some(includeKey => lowerKey.includes(includeKey));
      
      if (shouldInclude && !shouldExclude) {
        try {
          const value = localStorage.getItem(key);
          storage[key] = value ? JSON.parse(value) : value;
        } catch {
          storage[key] = localStorage.getItem(key);
        }
      }
    }
    
    return Object.keys(storage).length > 0 ? storage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract sessionStorage (sanitized)
 */
function extractSessionStorageData(): Record<string, any> | undefined {
  if (typeof window === 'undefined' || !window.sessionStorage) return undefined;
  
  try {
    const storage: Record<string, any> = {};
    const keysToInclude = ['shop_locale_data', 'cache', 'temp'];
    const keysToExclude = ['token', 'password', 'secret', 'key', 'auth'];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      
      const lowerKey = key.toLowerCase();
      const shouldExclude = keysToExclude.some(excludeKey => lowerKey.includes(excludeKey));
      const shouldInclude = keysToInclude.some(includeKey => lowerKey.includes(includeKey));
      
      if (shouldInclude && !shouldExclude) {
        try {
          const value = sessionStorage.getItem(key);
          storage[key] = value ? JSON.parse(value) : value;
        } catch {
          storage[key] = sessionStorage.getItem(key);
        }
      }
    }
    
    return Object.keys(storage).length > 0 ? storage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract cookie names (not values for privacy)
 */
function extractCookieNames(): string[] | undefined {
  if (typeof document === 'undefined') return undefined;
  
  try {
    const cookies = document.cookie.split(';').map(c => c.trim().split('=')[0]);
    return cookies.length > 0 ? cookies : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract performance metrics
 */
function extractPerformanceMetrics(): any {
  if (typeof window === 'undefined' || !window.performance) return undefined;
  
  try {
    const metrics: any = {};
    
    // Memory usage (if available)
    if ((performance as any).memory) {
      metrics.memory = {
        usedJSHeapSize: Math.round((performance as any).memory.usedJSHeapSize / 1048576) + ' MB',
        totalJSHeapSize: Math.round((performance as any).memory.totalJSHeapSize / 1048576) + ' MB',
        jsHeapSizeLimit: Math.round((performance as any).memory.jsHeapSizeLimit / 1048576) + ' MB',
      };
    }
    
    // Navigation timing
    if (performance.timing) {
      const timing = performance.timing;
      metrics.timing = {
        pageLoadTime: timing.loadEventEnd - timing.navigationStart + ' ms',
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart + ' ms',
        responseTime: timing.responseEnd - timing.requestStart + ' ms',
      };
    }
    
    // Navigation type
    if (performance.navigation) {
      const navTypes = ['Navigate', 'Reload', 'Back/Forward', 'Reserved'];
      metrics.navigation = {
        type: navTypes[performance.navigation.type] || 'Unknown',
        redirectCount: performance.navigation.redirectCount,
      };
    }
    
    // Resource count
    if (performance.getEntriesByType) {
      const resources = performance.getEntriesByType('resource');
      metrics.resourceCount = resources.length;
    }
    
    return Object.keys(metrics).length > 0 ? metrics : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract console errors (if captured)
 */
function extractConsoleErrors(): string[] | undefined {
  if (typeof window === 'undefined') return undefined;
  
  try {
    const errors = (window as any).__CONSOLE_ERRORS;
    return Array.isArray(errors) && errors.length > 0 ? errors.slice(-10) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract recent logs (if captured)
 */
function extractRecentLogs(): string[] | undefined {
  if (typeof window === 'undefined') return undefined;
  
  try {
    const logs = (window as any).__CONSOLE_LOGS;
    return Array.isArray(logs) && logs.length > 0 ? logs.slice(-10) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sanitize sensitive data from objects
 */
function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'accessToken', 'access_token', 'auth', 'authorization'];
  const sanitized: any = Array.isArray(obj) ? [] : {};
  
  try {
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk));
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  } catch {
    return obj;
  }
}

/**
 * Generate a unique signature for an error to detect duplicates
 */
function generateErrorSignature(report: CrashReport): string {
  const parts = [
    report.errorCode || 'UNKNOWN',
    report.errorMessage.substring(0, 100), // First 100 chars
    report.endpoint || '',
    report.pagePath,
    // Use first 2 lines of stack trace for signature
    report.stack?.split('\n').slice(0, 2).join('|') || '',
  ];
  
  return parts.join('::');
}

/**
 * Check if this error was recently reported (client-side deduplication)
 */
function isRecentlyReported(signature: string): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  
  try {
    const key = 'crash_reports_sent';
    const stored = sessionStorage.getItem(key);
    const reported: Record<string, number> = stored ? JSON.parse(stored) : {};
    
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    // Check if this error was reported in the last 5 minutes
    if (reported[signature] && (now - reported[signature]) < fiveMinutes) {
      return true;
    }
    
    // Clean up old entries (older than 5 minutes)
    Object.keys(reported).forEach(key => {
      if (now - reported[key] > fiveMinutes) {
        delete reported[key];
      }
    });
    
    // Mark this error as reported
    reported[signature] = now;
    sessionStorage.setItem(key, JSON.stringify(reported));
    
    return false;
  } catch (error) {
    console.warn('[Crash Report] Failed to check duplicate:', error);
    return false;
  }
}

/**
 * Send crash report to server for logging
 */
export async function sendCrashReport(report: CrashReport): Promise<boolean> {
  if (typeof window === 'undefined') {
    console.warn('[Crash Report] Cannot send crash report: window is undefined (SSR)');
    return false;
  }
  
  // Check for duplicates (client-side)
  const signature = generateErrorSignature(report);
  if (isRecentlyReported(signature)) {
    return true; // Return true because report already exists
  }
  
  try {
    
    const response = await fetch('/api/crash-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...report, signature }),
    });
  
    
    if (response.ok) {
     await response.json();
      return true;
    } else {
      const errorText = await response.text();
      return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Generate formatted crash report text
 */
export function formatCrashReportText(report: CrashReport): string {
  const separator = '='.repeat(80);
  const miniSeparator = '-'.repeat(80);
  
  return `
${separator}
                           CRASH REPORT
${separator}

Generated: ${report.formattedTime} (${report.timestamp})
Timezone: ${report.timezone}

${miniSeparator}
ERROR INFORMATION
${miniSeparator}
Error Code:      ${report.errorCode || 'UNKNOWN'}
Status Code:     ${report.statusCode || 'N/A'}
Error Message:   ${report.errorMessage}

${report.serverMessage ? `Server Message:  ${report.serverMessage}\n` : ''}
${miniSeparator}
REQUEST INFORMATION
${miniSeparator}
Endpoint:        ${report.endpoint || 'N/A'}
Method:          ${report.method}

${report.requestPayload ? `
Request Payload:
${JSON.stringify(report.requestPayload, null, 2)}
` : ''}
${report.requestHeaders ? `
Request Headers:
${JSON.stringify(report.requestHeaders, null, 2)}
` : ''}
${report.responsePayload ? `${miniSeparator}
RESPONSE INFORMATION
${miniSeparator}
Response Payload:
${JSON.stringify(report.responsePayload, null, 2)}

` : ''}${report.responseHeaders ? `Response Headers:
${JSON.stringify(report.responseHeaders, null, 2)}

` : ''}${miniSeparator}
PAGE INFORMATION
${miniSeparator}
Page URL:        ${report.pageUrl}
Page Path:       ${report.pagePath}
Referrer:        ${report.referrer || 'DIRECT'}

${report.navigationHistory && report.navigationHistory.length > 0 ? `
Navigation History:
${report.navigationHistory.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}
` : ''}
${miniSeparator}
USER/BROWSER INFORMATION
${miniSeparator}
User Agent:      ${report.userAgent}
Platform:        ${report.platform}
Screen:          ${report.screenResolution}
Viewport:        ${report.viewport}
Language:        ${report.browserLanguage}

${miniSeparator}
SHOP INFORMATION
${miniSeparator}
Shop Domain:     ${report.shop}
${report.shopDetails ? `
Shop Name:       ${report.shopDetails.name || 'N/A'}
Contact Email:   ${report.shopDetails.email || report.shopDetails.contactEmail || report.shopDetails.customerEmail || 'N/A'}
Myshopify:       ${report.shopDetails.myshopifyDomain || 'N/A'}
Plan:            ${report.shopDetails.plan || 'N/A'}
Owner:           ${report.shopDetails.owner || 'N/A'}
` : 'Shop details not available\n'}
${miniSeparator}
SESSION INFORMATION
${miniSeparator}
${report.sessionData ? `Session Data:    ${JSON.stringify(report.sessionData, null, 2)}\n` : 'No session data\n'}

${report.localStorage ? `${miniSeparator}
LOCAL STORAGE DATA
${miniSeparator}
${JSON.stringify(report.localStorage, null, 2)}

` : ''}${report.sessionStorage ? `${miniSeparator}
SESSION STORAGE DATA
${miniSeparator}
${JSON.stringify(report.sessionStorage, null, 2)}

` : ''}${report.cookies && report.cookies.length > 0 ? `${miniSeparator}
COOKIES (Names Only)
${miniSeparator}
${report.cookies.join(', ')}

` : ''}${report.performanceMetrics ? `${miniSeparator}
PERFORMANCE METRICS
${miniSeparator}
${JSON.stringify(report.performanceMetrics, null, 2)}

` : ''}${report.consoleErrors && report.consoleErrors.length > 0 ? `${miniSeparator}
CONSOLE ERRORS (Last 10)
${miniSeparator}
${report.consoleErrors.map((err, i) => `${i + 1}. ${err}`).join('\n')}

` : ''}${report.recentLogs && report.recentLogs.length > 0 ? `${miniSeparator}
RECENT CONSOLE LOGS (Last 10)
${miniSeparator}
${report.recentLogs.map((log, i) => `${i + 1}. ${log}`).join('\n')}

` : ''}${report.serverResponse ? `${miniSeparator}
SERVER RESPONSE
${miniSeparator}
${JSON.stringify(report.serverResponse, null, 2)}

` : ''}${report.additionalContext ? `${miniSeparator}
ADDITIONAL CONTEXT
${miniSeparator}
${JSON.stringify(report.additionalContext, null, 2)}

` : ''}${report.stack ? `${miniSeparator}
STACK TRACE
${miniSeparator}
${report.stack}

` : ''}${separator}
END OF REPORT
${separator}
`;
}

