/**
 * Postman Pre-request Script for CSRF Token Management
 * 
 * Instructions:
 * 1. Copy this entire script
 * 2. In Postman: Collection → Edit → Pre-request Script tab
 * 3. Paste this script
 * 4. Save
 * 
 * This script automatically:
 * - Fetches CSRF token if not in cookies
 * - Adds X-XSRF-TOKEN header to POST/PUT/PATCH/DELETE requests
 * - Skips CSRF for safe methods (GET, HEAD, OPTIONS)
 */

// ============================================
// CONFIGURATION
// ============================================
const CSRF_TOKEN_URL = pm.environment.get('csrf_token_url') || 
                       pm.collectionVariables.get('csrf_token_url') || 
                       '{{base_url}}/test/csrf';
const CSRF_COOKIE_NAME = pm.environment.get('csrf_cookie_name') || 
                         pm.collectionVariables.get('csrf_cookie_name') || 
                         'XSRF-TOKEN';
const CSRF_HEADER_NAME = pm.environment.get('csrf_header_name') || 
                         pm.collectionVariables.get('csrf_header_name') || 
                         'X-XSRF-TOKEN';

// State-changing HTTP methods that require CSRF token
const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get CSRF token from Postman cookies
 */
function getCSRFTokenFromCookies() {
    const cookies = pm.cookies.all();
    const csrfCookie = cookies.find(cookie => cookie.name === CSRF_COOKIE_NAME);
    
    if (csrfCookie && csrfCookie.value) {
        console.log(`[CSRF] ✓ Found token in cookies: ${csrfCookie.value.substring(0, 10)}...`);
        return csrfCookie.value;
    }
    
    return null;
}

/**
 * Fetch CSRF token from server
 */
function fetchCSRFToken() {
    return new Promise((resolve, reject) => {
        // Replace {{base_url}} with actual base URL if needed
        let tokenUrl = CSRF_TOKEN_URL;
        if (pm.environment.get('base_url')) {
            tokenUrl = tokenUrl.replace('{{base_url}}', pm.environment.get('base_url'));
        }
        
        console.log(`[CSRF] Fetching token from: ${tokenUrl}`);
        
        pm.sendRequest({
            url: tokenUrl,
            method: 'GET',
            header: {
                'Accept': 'application/json'
            }
        }, (err, response) => {
            if (err) {
                console.error(`[CSRF] ✗ Error fetching token:`, err);
                reject(err);
                return;
            }
            
            if (response.code === 200) {
                let token = null;
                
                // Try to get token from response body
                try {
                    const jsonData = response.json();
                    if (jsonData && jsonData.token) {
                        token = jsonData.token;
                        console.log(`[CSRF] ✓ Token from response body: ${token.substring(0, 10)}...`);
                    }
                } catch (e) {
                    // Response might not be JSON, that's OK
                }
                
                // Also check cookies set by the response
                const cookies = response.cookies.all();
                const csrfCookie = cookies.find(cookie => cookie.name === CSRF_COOKIE_NAME);
                
                if (csrfCookie && csrfCookie.value) {
                    token = csrfCookie.value;
                    console.log(`[CSRF] ✓ Token from Set-Cookie header: ${token.substring(0, 10)}...`);
                }
                
                if (token) {
                    resolve(token);
                } else {
                    reject(new Error('CSRF token not found in response'));
                }
            } else {
                reject(new Error(`Failed to fetch CSRF token: ${response.code} ${response.status}`));
            }
        });
    });
}

/**
 * Set CSRF token in request header
 */
function setCSRFTokenHeader(token) {
    // Remove existing header if present
    pm.request.headers.remove(CSRF_HEADER_NAME);
    
    // Add new header
    pm.request.headers.add({
        key: CSRF_HEADER_NAME,
        value: token,
        type: 'text'
    });
    
    console.log(`[CSRF] ✓ Token added to ${CSRF_HEADER_NAME} header`);
}

// ============================================
// MAIN EXECUTION
// ============================================

// Get current request method
const requestMethod = pm.request.method;

// Only process state-changing methods
if (!STATE_CHANGING_METHODS.includes(requestMethod)) {
    console.log(`[CSRF] ⏭ Skipping CSRF token for ${requestMethod} request (safe method)`);
} else {
    // Execute async function
    (async function() {
        try {
            // First, try to get token from existing cookies
            let csrfToken = getCSRFTokenFromCookies();
            
            // If no token in cookies, fetch it from server
            if (!csrfToken) {
                console.log('[CSRF] ⚠ No token in cookies, fetching from server...');
                csrfToken = await fetchCSRFToken();
            }
            
            // Set the CSRF token header
            if (csrfToken) {
                setCSRFTokenHeader(csrfToken);
            } else {
                console.warn('[CSRF] ⚠ No CSRF token available');
                // Uncomment the line below to fail requests without CSRF token
                // throw new Error('CSRF token is required but not available');
            }
        } catch (error) {
            console.error('[CSRF] ✗ Error:', error.message);
            // Don't fail the request by default, just log the error
            // Uncomment the line below to make requests fail if token fetch fails
            // throw error;
        }
    })();
}

