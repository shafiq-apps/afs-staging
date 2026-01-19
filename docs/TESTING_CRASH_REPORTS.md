# Testing the Crash Report System

## Quick Test

### 1. Trigger an Error to See the Downtime Screen

**Option A: Temporarily Break Authentication**
```typescript
// In dashboard/app/routes/app.tsx, temporarily change the loader to throw an error:
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Add this line at the top to test:
  throw new Error("Test error for crash reporting");
  
  // ... rest of loader code
}
```

**Option B: Stop the Node.js Backend Server**
```bash
# Stop your Node.js GraphQL server
# The app will show the downtime screen when it can't connect
```

### 2. Test the "Report Issue" Button

Once you see the downtime screen:

1. **Look for the buttons** at the bottom:
   - "Show Technical Details" (secondary button)
   - "Report Issue" (primary red button)

2. **Click "Report Issue"**
   - You should see console logs: `Report Issue button clicked`
   - Then: `Sending crash report...`
   - Then: `Crash report sent: true`
   - Finally: An alert saying "✅ Issue reported successfully!"

3. **Check the crash report was saved:**
   ```bash
   cd dashboard/public/crash-reports/
   ls -lt | head -5
   ```
   You should see a new file like:
   ```
   crash_2026-01-14_15-30-45_HTTP_ERROR_401.txt
   ```

4. **Open the crash report file** to verify it contains:
   - Error information
   - Request/response payloads
   - Shop information (if available)
   - Performance metrics
   - Navigation history
   - Console logs

### 3. Verify Comprehensive Data

Open the crash report file and check for these sections:

```
✅ ERROR INFORMATION
✅ REQUEST INFORMATION (with payload)
✅ RESPONSE INFORMATION (with payload)
✅ PAGE INFORMATION (with navigation history)
✅ USER/BROWSER INFORMATION
✅ SHOP INFORMATION (with contact email)
✅ SESSION INFORMATION
✅ LOCAL STORAGE DATA
✅ SESSION STORAGE DATA
✅ PERFORMANCE METRICS
✅ STACK TRACE
```

## Debugging if Button Doesn't Work

### Check Browser Console

Open browser DevTools (F12) and look for:

1. **When page loads:**
   ```
   No errors should appear
   ```

2. **When clicking "Report Issue":**
   ```
   Report Issue button clicked
   Sending crash report... { errorMessage: "...", ... }
   Crash report sent: true
   ```

3. **If you see no logs:**
   - The click event isn't firing
   - Check if the button element exists: `document.querySelector('s-button[tone="critical"]')`
   - Check if ref is attached: Look for `reportButtonRef.current` in React DevTools

### Common Issues

#### Issue 1: Button Doesn't Respond to Clicks
**Symptoms:** No console logs when clicking
**Fix:** 
- Clear browser cache
- Check if web components are loaded properly
- Verify the ref is attached to the button

#### Issue 2: API Endpoint Not Found
**Symptoms:** Console shows "Failed to fetch" or 404 error
**Fix:**
- Verify the route file exists: `dashboard/app/routes/api.crash-report.tsx`
- Check Remix routes with: `npx remix routes`
- Restart the dev server

#### Issue 3: Crash Report Not Saved
**Symptoms:** Button works but no file created
**Fix:**
- Check server console for errors
- Verify write permissions: `ls -la dashboard/public/crash-reports/`
- Check if directory exists: `mkdir -p dashboard/public/crash-reports/`

#### Issue 4: Empty or Incomplete Crash Report
**Symptoms:** File is created but missing data
**Fix:**
- Check if `window.__SHOP_DETAILS` is set (in browser console)
- Verify GraphQL error includes payload data
- Check performance API availability: `console.log(performance.memory)`

## Manual Test Script

Run this in your browser console on the downtime screen:

```javascript
// Test 1: Check if button exists
const button = document.querySelector('s-button[tone="critical"]');
console.log('Button found:', !!button);

// Test 2: Check if shop details are available
console.log('Shop details:', window.__SHOP_DETAILS);

// Test 3: Manually trigger crash report
const { generateCrashReport, sendCrashReport } = await import('/app/utils/crash-report.ts');
const report = generateCrashReport(
  { message: 'Manual test', code: 'TEST_ERROR' },
  { test: true }
);
console.log('Generated report:', report);

const success = await sendCrashReport(report);
console.log('Report sent:', success);
```

## Expected Console Output

When everything works correctly:

```
Report Issue button clicked
Sending crash report... {
  errorMessage: "Unable to connect to the server...",
  errorCode: "NETWORK_ERROR",
  shop: "example-store.myshopify.com",
  shopDetails: {
    domain: "example-store.myshopify.com",
    name: "Example Store",
    email: "owner@example.com",
    plan: "Shopify Plus"
  },
  requestPayload: { ... },
  performanceMetrics: { ... },
  // ... more data
}
Crash report sent: true
```

## Success Criteria

✅ Button is clickable and responds immediately
✅ Console logs show the entire crash report data
✅ Alert message appears confirming success
✅ File is created in `public/crash-reports/`
✅ File contains all comprehensive data sections
✅ Shop email is captured (if available)
✅ Request/response payloads are included
✅ Performance metrics are present

## Need Help?

1. Check browser console for errors
2. Check server console for API errors
3. Verify all files were saved correctly
4. Try restarting the dev server
5. Clear browser cache and try again

