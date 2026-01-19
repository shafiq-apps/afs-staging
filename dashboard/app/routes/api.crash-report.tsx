import type { ActionFunctionArgs } from "react-router";
import { promises as fs } from "fs";
import path from "path";
import { createModuleLogger } from "app/utils/logger";

const logger = createModuleLogger("crash-repoirt");

/**
 * Check if a similar crash report already exists (server-side deduplication)
 */
async function isDuplicateReport(
  crashReportsDir: string,
  signature: string
): Promise<{ isDuplicate: boolean; existingFile?: string }> {
  try {
    const files = await fs.readdir(crashReportsDir);
    const recentFiles = files.filter(f => f.startsWith('crash_') && f.endsWith('.crashlog'));
    
    // Check files from the last 10 minutes
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    
    for (const file of recentFiles) {
      const filePath = path.join(crashReportsDir, file);
      try {
        const stats = await fs.stat(filePath);
        
        // Only check recent files
        if (stats.mtimeMs < tenMinutesAgo) continue;
        
        // Read file and check for signature
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Check if signature exists in file
        if (content.includes(`Signature: ${signature}`)) {
          return { isDuplicate: true, existingFile: file };
        }
      } catch (err) {
        // Skip files we can't read
        continue;
      }
    }
    
    return { isDuplicate: false };
  } catch (error) {
    logger.warn('[Crash Report API] Could not check for duplicates:', error);
    return { isDuplicate: false };
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  
  if (request.method !== "POST") {
    logger.warn('[Crash Report API] Invalid method:', request.method);
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const report = await request.json();
    
    logger.log('[Crash Report API] Report received:', {
      errorCode: report.errorCode,
      errorMessage: report.errorMessage,
      shop: report.shop,
      pageUrl: report.pageUrl,
      signature: report.signature,
    });
    
    // Create crash reports directory if it doesn't exist
    // Save OUTSIDE public directory for security (contains sensitive user data)
    const crashReportsDir = path.join(process.cwd(), 'crash-reports');
    logger.log('[Crash Report API] Crash reports directory:', crashReportsDir);
    logger.log('[Crash Report API] Current working directory:', process.cwd());
    logger.log('[Crash Report API] __dirname:', __dirname);
    
    try {
      await fs.access(crashReportsDir);
      logger.log('[Crash Report API] Directory exists:', crashReportsDir);
    } catch (err) {
      logger.log('[Crash Report API] Directory does not exist, creating...', crashReportsDir);
      try {
        await fs.mkdir(crashReportsDir, { recursive: true });
        logger.log('[Crash Report API] Directory created successfully:', crashReportsDir);
      } catch (mkdirErr: any) {
        logger.error('[Crash Report API] Failed to create directory:', mkdirErr.message);
        throw mkdirErr;
      }
    }
    
    // Check for duplicate reports (server-side deduplication)
    if (report.signature) {
      const duplicateCheck = await isDuplicateReport(crashReportsDir, report.signature);
      if (duplicateCheck.isDuplicate) {
        logger.log('[Crash Report API] Skipping duplicate crash report, existing file:', duplicateCheck.existingFile);
        return new Response(
          JSON.stringify({ 
            success: true,
            duplicate: true,
            existingFile: duplicateCheck.existingFile,
            message: 'Duplicate crash report skipped (already exists)' 
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString()
      .replace(/:/g, '-')
      .replace(/\./g, '-')
      .replace('T', '_')
      .split('Z')[0];
    
    const errorCode = report.errorCode || 'UNKNOWN';
    const statusCode = report.statusCode || 'XXX';
    const filename = `crash_${timestamp}_${errorCode}_${statusCode}.crashlog`;
    
    logger.log('[Crash Report API] Generated filename:', filename);
    
    // Format the crash report
    logger.log('[Crash Report API] Formatting crash report...');
    const reportText = formatCrashReportForFile(report);
    logger.log('[Crash Report API] Report text length:', reportText.length, 'bytes');
    
    // Save to file
    const filePath = path.join(crashReportsDir, filename);
    logger.log('[Crash Report API] Full file path:', filePath);
    logger.log('[Crash Report API] Attempting to write file...');
    
    try {
      await fs.writeFile(filePath, reportText, 'utf-8');
      logger.log('[Crash Report API] File written successfully');
      
      // Verify file was created
      const stats = await fs.stat(filePath);
      logger.log('[Crash Report API] File verified, size:', stats.size, 'bytes');
    } catch (writeErr: any) {
      logger.error('[Crash Report API] Failed to write file:', writeErr.message);
      logger.error('[Crash Report API] Error code:', writeErr.code);
      logger.error('[Crash Report API] Error stack:', writeErr.stack);
      throw writeErr;
    }
    
    logger.log('[Crash Report API] Crash report saved successfully:', filename);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        duplicate: false,
        filename,
        filePath,
        message: 'Crash report saved successfully' 
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    logger.error('[Crash Report API] Failed to save crash report:', error);
    logger.error('[Crash Report API] Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

function formatCrashReportForFile(report: any): string {
  const separator = '='.repeat(80);
  const miniSeparator = '-'.repeat(80);
  
  return `
${separator}
                           CRASH REPORT
${separator}

Generated: ${report.formattedTime} (${report.timestamp})
Timezone: ${report.timezone}
${report.signature ? `Signature: ${report.signature}\n` : ''}
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
Method:          ${report.method || 'UNKNOWN'}

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
${report.navigationHistory.map((h: string, i: number) => `  ${i + 1}. ${h}`).join('\n')}
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
${report.consoleErrors.map((err: string, i: number) => `${i + 1}. ${err}`).join('\n')}

` : ''}${report.recentLogs && report.recentLogs.length > 0 ? `${miniSeparator}
RECENT CONSOLE LOGS (Last 10)
${miniSeparator}
${report.recentLogs.map((log: string, i: number) => `${i + 1}. ${log}`).join('\n')}

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

