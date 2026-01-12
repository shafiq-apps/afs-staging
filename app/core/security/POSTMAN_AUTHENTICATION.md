# Postman Authentication Guide

This guide shows you how to send authenticated requests from Postman using HMAC-SHA256 authentication.

## Quick Setup (Recommended)

### Option 1: Use Postman Pre-request Script (Automatic)

1. **Open your request in Postman**
2. **Go to the "Pre-request Script" tab**
3. **Paste this script:**

```javascript
// HMAC-SHA256 Authentication Pre-request Script for Postman
// Set these variables in your Postman environment or collection

const apiKey = pm.environment.get("API_KEY") || pm.collectionVariables.get("API_KEY");
const apiSecret = pm.environment.get("API_SECRET") || pm.collectionVariables.get("API_SECRET");

if (!apiKey || !apiSecret) {
    console.error("API_KEY and API_SECRET must be set in environment or collection variables");
    throw new Error("Missing API credentials");
}

// Get request details
const method = pm.request.method;
const url = new URL(pm.request.url.toString());
const path = url.pathname;
const queryString = url.search.substring(1); // Remove leading '?'

// Get request body
let bodyHash = '';
const body = pm.request.body;
if (body && body.raw) {
    const bodyStr = body.raw;
    if (bodyStr && bodyStr.length > 0) {
        // Parse JSON if possible, then stringify with sorted keys
        try {
            const parsed = JSON.parse(bodyStr);
            const sorted = JSON.stringify(parsed, Object.keys(parsed).sort());
            bodyHash = CryptoJS.SHA256(sorted).toString(CryptoJS.enc.Base64);
        } catch {
            // If not JSON, hash as-is
            bodyHash = CryptoJS.SHA256(bodyStr).toString(CryptoJS.enc.Base64);
        }
    }
}

// Generate nonce (random base64 string)
function generateNonce() {
    const bytes = [];
    for (let i = 0; i < 16; i++) {
        bytes.push(Math.floor(Math.random() * 256));
    }
    return btoa(String.fromCharCode(...bytes));
}

// Build query string (sorted)
function buildQueryString(searchParams) {
    if (!searchParams) return '';
    const params = new URLSearchParams(searchParams);
    const sorted = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

// Sort query string if it exists
const sortedQueryString = queryString ? buildQueryString(queryString) : '';

// Generate timestamp and nonce
const timestamp = Date.now();
const nonce = generateNonce();

// Build signature payload
const payload = [
    method.toUpperCase(),
    path,
    sortedQueryString || '',
    bodyHash || '',
    timestamp.toString(),
    nonce,
].join('\n');

// Generate HMAC-SHA256 signature
const signature = CryptoJS.HmacSHA256(payload, apiSecret).toString(CryptoJS.enc.Base64);

// Build authorization header
const authHeader = `HMAC-SHA256 apiKey=${apiKey},timestamp=${timestamp},nonce=${nonce},signature=${signature}`;

// Set the authorization header
pm.request.headers.add({
    key: 'Authorization',
    value: authHeader
});

console.log('Authentication header generated:', authHeader.substring(0, 50) + '...');
```

4. **Set Environment Variables:**
   - Click the "Environments" icon (eye icon) in Postman
   - Create a new environment or select an existing one
   - Add these variables:
     - `API_KEY` = your API key
     - `API_SECRET` = your API secret

5. **Select your environment** from the dropdown in the top right

6. **Send your request** - the authentication header will be added automatically!

### Option 2: Manual Header Construction

If you prefer to set the header manually:

1. **Calculate the signature** using the script above or a tool
2. **Add Authorization header** with this format:
   ```
   HMAC-SHA256 apiKey=<your-key>,timestamp=<timestamp>,nonce=<nonce>,signature=<signature>
   ```

## Example Request

### GET Request (with query parameters)

**URL:** `http://localhost:3554/graphql?shop=shop.myshopify.com`

**Method:** GET

**Headers:**
```
Authorization: HMAC-SHA256 apiKey=your-key,timestamp=1705068000000,nonce=abc123...,signature=xyz789...
```

### POST Request (with body)

**URL:** `http://localhost:3554/graphql`

**Method:** POST

**Headers:**
```
Content-Type: application/json
Authorization: HMAC-SHA256 apiKey=your-key,timestamp=1705068000000,nonce=abc123...,signature=xyz789...
```

**Body (raw JSON):**
```json
{
  "query": "query { shop { name } }",
  "variables": {
    "shop": "shop.myshopify.com"
  }
}
```

## Postman Collection Setup

### Step 1: Create Environment Variables

1. Click the **Environments** icon (👁️) in Postman
2. Click **+** to create a new environment
3. Name it (e.g., "Development" or "Production")
4. Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `API_KEY` | your-api-key | your-api-key |
| `API_SECRET` | your-api-secret | your-api-secret |
| `API_BASE_URL` | http://localhost:3554 | http://localhost:3554 |

5. Click **Save**

### Step 2: Add Pre-request Script to Collection

1. Right-click your collection → **Edit**
2. Go to **Pre-request Script** tab
3. Paste the script from Option 1 above
4. Click **Save**

Now all requests in the collection will automatically use authentication!

### Step 3: Use Variables in URLs

In your request URL, you can use:
```
{{API_BASE_URL}}/graphql?shop=shop.myshopify.com
```

## Testing

### Test 1: Simple GET Request

1. Create a new GET request
2. URL: `{{API_BASE_URL}}/graphql?shop=shop.myshopify.com`
3. The pre-request script will automatically add the Authorization header
4. Send the request

### Test 2: POST Request with Body

1. Create a new POST request
2. URL: `{{API_BASE_URL}}/graphql`
3. Body tab → raw → JSON:
   ```json
   {
     "query": "query GetShop($shop: String!) { shop(shop: $shop) { name } }",
     "variables": {
       "shop": "shop.myshopify.com"
     }
   }
   ```
4. Send the request

## Troubleshooting

### "Missing API credentials" Error

- Make sure `API_KEY` and `API_SECRET` are set in your environment
- Select the correct environment from the dropdown
- Check that the variable names are exactly `API_KEY` and `API_SECRET` (case-sensitive)

### "Invalid signature" Error

- Check that your API secret matches the backend configuration
- Verify the timestamp is current (within 5 minutes)
- Ensure the request body matches exactly (sorted keys)
- Check the console log in Postman for the generated header

### "Timestamp validation failed" Error

- Your system clock might be out of sync
- The request might be too old (retry with a fresh request)
- Check that timestamp is in milliseconds (not seconds)

## Advanced: Custom Script for Specific Requests

If you need different behavior for specific requests, you can add this to individual requests instead of the collection:

```javascript
// Request-specific pre-request script
// This will override collection-level script if both exist
const apiKey = pm.environment.get("API_KEY");
const apiSecret = pm.environment.get("API_SECRET");

// ... (rest of the script from Option 1)
```

## Security Notes

⚠️ **Important:**
- Never commit Postman collections with real API secrets
- Use environment variables, not hardcoded values
- Use different environments for dev/staging/production
- Rotate secrets regularly
- Don't share Postman collections with secrets

## Alternative: Using Postman Scripts with External Tools

If you prefer to calculate signatures outside Postman:

1. Use the Node.js example from `auth-client.example.ts`
2. Calculate the signature
3. Copy the full Authorization header
4. Paste it into Postman's Authorization header

## Quick Reference

**Header Format:**
```
HMAC-SHA256 apiKey=<key>,timestamp=<ms>,nonce=<base64>,signature=<base64>
```

**Signature Payload (newline-separated):**
```
METHOD
/path
query=string
bodyHash
timestamp
nonce
```

**Required Environment Variables:**
- `API_KEY` - Your API key
- `API_SECRET` - Your API secret (minimum 32 characters)

