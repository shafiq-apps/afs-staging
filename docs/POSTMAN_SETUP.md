# Postman Setup for Remix App API

This guide shows how to test the authenticated API endpoints from Postman.

## Quick Start

### 1. Set Up Environment Variables

1. Open Postman
2. Click the **Environments** icon (👁️) in the sidebar
3. Click **+** to create a new environment
4. Name it "Development" or "Production"
5. Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `API_KEY` | your-api-key | your-api-key |
| `API_SECRET` | your-api-secret | your-api-secret |
| `API_BASE_URL` | http://localhost:3554 | http://localhost:3554 |

6. Click **Save**
7. Select your environment from the dropdown in the top right

### 2. Add Pre-request Script

1. Create a new collection or open an existing one
2. Right-click the collection → **Edit**
3. Go to the **Pre-request Script** tab
4. Paste this script:

```javascript
// HMAC-SHA256 Authentication for Postman
const apiKey = pm.environment.get("API_KEY") || pm.collectionVariables.get("API_KEY");
const apiSecret = pm.environment.get("API_SECRET") || pm.collectionVariables.get("API_SECRET");

if (!apiKey || !apiSecret) {
    console.error("Set API_KEY and API_SECRET in environment variables");
    return;
}

const method = pm.request.method;
const url = new URL(pm.request.url.toString());
const path = url.pathname;

// Build sorted query string
function buildQueryString(searchParams) {
    if (!searchParams) return '';
    const params = new URLSearchParams(searchParams);
    const sorted = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

const queryString = buildQueryString(url.search);

// Hash request body
let bodyHash = '';
const body = pm.request.body;
if (body && body.raw) {
    const bodyStr = body.raw;
    if (bodyStr && bodyStr.length > 0) {
        try {
            const parsed = JSON.parse(bodyStr);
            const sorted = JSON.stringify(parsed, Object.keys(parsed).sort());
            bodyHash = CryptoJS.SHA256(sorted).toString(CryptoJS.enc.Base64);
        } catch {
            bodyHash = CryptoJS.SHA256(bodyStr).toString(CryptoJS.enc.Base64);
        }
    }
}

// Generate nonce
function generateNonce() {
    const bytes = [];
    for (let i = 0; i < 16; i++) {
        bytes.push(Math.floor(Math.random() * 256));
    }
    return btoa(String.fromCharCode(...bytes));
}

const timestamp = Date.now();
const nonce = generateNonce();

// Build signature payload
const payload = [
    method.toUpperCase(),
    path,
    queryString || '',
    bodyHash || '',
    timestamp.toString(),
    nonce,
].join('\n');

// Generate signature
const signature = CryptoJS.HmacSHA256(payload, apiSecret).toString(CryptoJS.enc.Base64);

// Set authorization header
const authHeader = `HMAC-SHA256 apiKey=${apiKey},timestamp=${timestamp},nonce=${nonce},signature=${signature}`;
pm.request.headers.add({
    key: 'Authorization',
    value: authHeader
});
```

5. Click **Save**

### 3. Create Test Requests

#### Example: GraphQL Query

1. Create a new request
2. Method: **POST**
3. URL: `{{API_BASE_URL}}/graphql`
4. Headers: (will be added automatically by script)
5. Body tab:
   - Select **raw**
   - Select **JSON**
   - Paste:
   ```json
   {
     "query": "query { shop(shop: \"shop.myshopify.com\") { name } }"
   }
   ```
6. Click **Send**

#### Example: GraphQL with Variables

1. Create a new request
2. Method: **POST**
3. URL: `{{API_BASE_URL}}/graphql`
4. Body:
   ```json
   {
     "query": "query GetShop($shop: String!) { shop(shop: $shop) { name } }",
     "variables": {
       "shop": "shop.myshopify.com"
     }
   }
   ```
5. Click **Send**

## Testing Different Endpoints

### Public Endpoints (No Auth Required)

Storefront endpoints don't require authentication:

- `GET {{API_BASE_URL}}/storefront/products?shop=shop.myshopify.com`
- `GET {{API_BASE_URL}}/storefront/filters?shop=shop.myshopify.com`
- `GET {{API_BASE_URL}}/storefront/search?shop=shop.myshopify.com&q=shoes`

### Protected Endpoints (Auth Required)

These require authentication (added automatically by script):

- `POST {{API_BASE_URL}}/graphql`
- `POST {{API_BASE_URL}}/admin/reindex?shop=shop.myshopify.com`
- `POST {{API_BASE_URL}}/app/events`

## Troubleshooting

### Script Error: "CryptoJS is not defined"

Postman includes CryptoJS by default. If you get this error:
1. Make sure you're using the latest version of Postman
2. Try restarting Postman
3. Check that the script is in the Pre-request Script tab, not Tests tab

### "Invalid signature" Error

1. Check that `API_KEY` and `API_SECRET` match your backend configuration
2. Verify the environment is selected
3. Check Postman console (View → Show Postman Console) for errors

### "Missing authorization header"

1. Make sure the pre-request script is in the collection or request
2. Check that environment variables are set
3. Verify the script ran (check console)

## Tips

- Use **Collection Variables** if you want to share credentials across all requests
- Use **Environment Variables** for different environments (dev/staging/prod)
- Check the **Postman Console** (View → Show Postman Console) to see generated headers
- Save requests to your collection for easy reuse

