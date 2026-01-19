# Silent Crash Report System

## How It Works

The crash report system now operates **completely silently** in the background:

✅ **Automatic**: Crash reports are generated automatically when errors occur  
✅ **Silent**: No UI messages, buttons, or alerts  
✅ **Background**: Files are saved to `public/crash-reports/` without user interaction  
✅ **Developer Logs**: Console logs are available for debugging (only visible in DevTools)

---

## User Experience

When an error occurs:
1. User sees the downtime screen with helpful information
2. Crash report is **automatically generated and saved** in the background
3. **No popups, no alerts, no buttons** - completely silent
4. Optional: "Show Technical Details" button for developers to debug

---

## Checking If It's Working

### 1. Trigger an Error

**Stop the Node.js backend:**
```bash
# Stop your GraphQL server
# The app will automatically generate a crash report
```

**Or temporarily add an error:**
```typescript
// In dashboard/app/routes/app.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  throw new Error("Test crash report");
  // ...
}
```

### 2. Check Browser Console (F12)

You should see these logs:

```
[Crash Report] Generating crash report...
[Crash Report] Report data: { errorMessage: "...", shop: "...", ... }
[Crash Report] Sending crash report to /api/crash-report...
[Crash Report] Response status: 200 OK
[Crash Report] Server response: { success: true, filename: "crash_2026-01-14_..." }
[Crash Report] ✅ Crash report saved successfully
```

### 3. Check Server Console

You should see these logs:

```
[Crash Report API] Received request, method: POST
[Crash Report API] Parsing request body...
[Crash Report API] Report received: { errorCode: "...", shop: "...", ... }
[Crash Report API] Generated filename: crash_2026-01-14_15-30-45_HTTP_ERROR_401.txt
[Crash Report API] Crash reports directory: /path/to/dashboard/public/crash-reports
[Crash Report API] Directory exists
[Crash Report API] Formatting crash report...
[Crash Report API] Saving to file: /path/to/dashboard/public/crash-reports/crash_...txt
[Crash Report API] ✅ Crash report saved successfully: crash_2026-01-14_15-30-45_HTTP_ERROR_401.txt
```

### 4. Check the File System

```bash
cd dashboard/public/crash-reports/
ls -lt | head -5
```

You should see a new file:
```
crash_2026-01-14_15-30-45_HTTP_ERROR_401.txt
```

---

## Troubleshooting: File Not Saving

### Issue 1: API Route Not Found

**Symptoms:**
- Browser console shows: "Failed to fetch" or 404 error
- Server console shows nothing

**Check:**
```bash
# Verify the route file exists
ls dashboard/app/routes/api.crash-report.tsx

# List all Remix routes
npx remix routes
```

**Expected output should include:**
```
/api/crash-report
```

**Fix:**
- Restart your Remix dev server
- Clear `.cache` directory: `rm -rf .cache`

---

### Issue 2: Directory Permissions

**Symptoms:**
- Server console shows: "EACCES: permission denied"
- Browser shows success but file isn't created

**Check:**
```bash
# Check if directory exists
ls -la dashboard/public/ | grep crash-reports

# Check permissions
ls -la dashboard/public/crash-reports/
```

**Fix:**
```bash
# Create directory manually
mkdir -p dashboard/public/crash-reports

# Set permissions (if needed)
chmod 755 dashboard/public/crash-reports
```

---

### Issue 3: Route Not Handling POST

**Symptoms:**
- Browser console shows: 405 Method Not Allowed
- Server console shows: "Invalid method: GET"

**Issue:**
The API route expects POST but is receiving GET.

**Fix:**
- Check that `sendCrashReport()` is using `method: 'POST'`
- Verify the route file exports `action` (not `loader`)

---

### Issue 4: JSON Parse Error

**Symptoms:**
- Server console shows: "SyntaxError: Unexpected token" or "Failed to parse JSON"

**Debug:**
Add this to `api.crash-report.tsx`:
```typescript
const text = await request.text();
console.log('Raw request body:', text);
const report = JSON.parse(text);
```

**Common causes:**
- Empty request body
- Malformed JSON
- Request body already consumed elsewhere

---

### Issue 5: Crash Report Not Generated

**Symptoms:**
- No console logs appear
- Nothing happens when error occurs

**Check:**
1. Is the error boundary actually catching the error?
2. Is `DowntimeScreen` being rendered?
3. Is the useEffect running?

**Debug in browser console:**
```javascript
// Check if the component is mounted
document.querySelector('[data-page-id="downtime"]')

// Check if crash report functions exist
import('/app/utils/crash-report').then(m => console.log(m))
```

---

## Manual Testing

Run this in browser console on the downtime screen:

```javascript
// Import crash report utilities
const { generateCrashReport, sendCrashReport } = await import('/app/utils/crash-report.ts');

// Generate a test report
const testReport = generateCrashReport(
  { 
    message: 'Manual test error',
    code: 'TEST_ERROR',
    statusCode: 500
  },
  { 
    manual: true,
    testTime: new Date().toISOString()
  }
);

console.log('Test report:', testReport);

// Send it
const success = await sendCrashReport(testReport);
console.log('Send result:', success);

// Check the file was created
console.log('Check: dashboard/public/crash-reports/');
```

---

## Expected File Structure

```
dashboard/
├── public/
│   └── crash-reports/
│       ├── .gitignore (exists - prevents commits)
│       └── crash_2026-01-14_15-30-45_HTTP_ERROR_401.txt (auto-generated)
├── app/
│   ├── routes/
│   │   └── api.crash-report.tsx (API endpoint)
│   ├── components/
│   │   └── DowntimeScreen.tsx (generates reports)
│   └── utils/
│       └── crash-report.ts (utilities)
```

---

## Verification Checklist

Run through this checklist to verify everything is working:

- [ ] **Route exists**: `ls dashboard/app/routes/api.crash-report.tsx` ✓
- [ ] **Directory exists**: `ls dashboard/public/crash-reports/` ✓
- [ ] **Directory writable**: `touch dashboard/public/crash-reports/test.txt && rm dashboard/public/crash-reports/test.txt` ✓
- [ ] **Dev server running**: Check terminal for "Local: http://..." ✓
- [ ] **Error triggers**: Stop backend or add test error ✓
- [ ] **Browser logs**: Open DevTools, see "[Crash Report]" logs ✓
- [ ] **Server logs**: Check terminal for "[Crash Report API]" logs ✓
- [ ] **File created**: `ls -lt dashboard/public/crash-reports/ | head -1` shows new file ✓
- [ ] **File readable**: `cat dashboard/public/crash-reports/crash_*.txt` shows formatted report ✓
- [ ] **No UI messages**: No alerts, popups, or buttons on screen ✓

---

## Production Deployment

### Ensure Directory Exists

Add to your deployment script:

```bash
# Create crash reports directory
mkdir -p public/crash-reports

# Set proper permissions
chmod 755 public/crash-reports
```

### Gitignore

The `.gitignore` file in `public/crash-reports/` ensures crash logs are never committed:

```gitignore
# Ignore all crash reports
*.txt
*.log

# Keep the directory structure
!.gitignore
!README.md
```

### Monitoring

Set up automated monitoring:

```bash
# Daily check for new crash reports
#!/bin/bash
cd /path/to/app/public/crash-reports
COUNT=$(find . -name "crash_*.txt" -mtime -1 | wc -l)
if [ $COUNT -gt 0 ]; then
  echo "⚠️ $COUNT new crash reports in last 24 hours"
  # Send notification to your team
fi
```

---

## What Gets Logged

### Browser Console (Developer-Facing)
```
[Crash Report] Generating crash report...
[Crash Report] Report data: { ... }
[Crash Report] Sending crash report to /api/crash-report...
[Crash Report] Response status: 200 OK
[Crash Report] ✅ Crash report saved successfully
```

### Server Console (Developer-Facing)
```
[Crash Report API] Received request, method: POST
[Crash Report API] Report received: { ... }
[Crash Report API] ✅ Crash report saved successfully: crash_...txt
```

### User Experience (End User)
- **Sees**: Clean downtime screen with helpful message
- **Does NOT see**: Any crash report messages, buttons, or alerts
- **Result**: Professional, polished error handling

---

## Success!

Your crash report system is now:
- ✅ **Silent** - No user-facing messages
- ✅ **Automatic** - Generates on every error
- ✅ **Comprehensive** - Captures all debugging data
- ✅ **Production-Ready** - Logs for developers, clean for users

Files are saved to: `dashboard/public/crash-reports/crash_*.txt`

