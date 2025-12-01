# Postman Pre-request Script for CSRF Tokens

## Overview

This Pre-request Script automatically handles CSRF token management for Postman requests. It:
1. Fetches the CSRF token from the `/test/csrf` endpoint (if not already in cookies)
2. Extracts the token from cookies
3. Sets the `X-XSRF-TOKEN` header for state-changing requests (POST, PUT, PATCH, DELETE)

## Setup Instructions

### Step 1: Add Pre-request Script to Collection

1. Open Postman
2. Right-click on your **Collection** (not individual requests)
3. Select **Edit**
4. Go to the **Pre-request Script** tab
5. Paste the script from `postman-pre-request-csrf.js`
6. Click **Save**

### Step 2: Configure Environment Variables (Optional)

Create environment variables in Postman:
- `csrf_token_url`: URL to get CSRF token (default: `{{base_url}}/test/csrf`)
- `csrf_cookie_name`: Cookie name (default: `XSRF-TOKEN`)
- `csrf_header_name`: Header name (default: `X-XSRF-TOKEN`)

## Pre-request Script

The script is located in `postman-pre-request-csrf.js` in the project root. Copy its contents to your Postman collection's Pre-request Script tab.

## Usage Examples

### Example 1: Collection-Level Script

1. **Collection Settings** → **Pre-request Script** tab
2. Paste the script from `postman-pre-request-csrf.js`
3. All requests in the collection will automatically include CSRF tokens

### Example 2: Request-Level Script

1. Open a specific request (POST, PUT, PATCH, or DELETE)
2. Go to **Pre-request Script** tab
3. Paste the script
4. Only this request will include CSRF token

### Example 3: Environment Variables

Create a Postman environment with:
```json
{
  "base_url": "http://localhost:3554",
  "csrf_token_url": "http://localhost:3554/test/csrf"
}
```

## Testing

### Test 1: GET Request (Should Skip CSRF)
```
GET /test/csrf
```
- Script should log: `[CSRF] Skipping CSRF token for GET request (safe method)`
- No CSRF header should be added

### Test 2: POST Request (Should Include CSRF)
```
POST /test/csrf
Headers:
  X-XSRF-TOKEN: <token>
```
- Script should log: `[CSRF] ✓ Token added to X-XSRF-TOKEN header`
- Request should succeed with 200 status

### Test 3: POST Without Token (Should Fail)
```
POST /test/csrf
(No CSRF header)
```
- Request should fail with 403 status
- Response: `{"success": false, "message": "CSRF token validation failed"}`

## Troubleshooting

### Issue: "No CSRF token available"

**Solution:**
1. Make sure you've made a GET request to `/test/csrf` first
2. Check that cookies are enabled in Postman settings
3. Verify the cookie name matches (`XSRF-TOKEN`)

### Issue: "Failed to fetch CSRF token"

**Solution:**
1. Check that `csrf_token_url` is correct
2. Verify the server is running
3. Check network connectivity

### Issue: "CSRF token validation failed"

**Solution:**
1. Ensure the token in the header matches the token in the cookie
2. Check that the cookie hasn't expired
3. Verify the header name is `X-XSRF-TOKEN`

## Notes

- The script only adds CSRF tokens to state-changing methods (POST, PUT, PATCH, DELETE)
- GET, HEAD, and OPTIONS requests are skipped (safe methods)
- The script fails gracefully - if token fetch fails, it logs an error but doesn't block the request
- You can uncomment the `throw error;` line to make requests fail if no token is available

