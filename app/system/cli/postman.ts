#!/usr/bin/env ts-node

/**
 * Postman Collection Generator
 * Scans route files and generates a Postman collection for API testing
 * 
 * Usage: npm run postman
 * Output: postman-collection.json
 */

import fs from 'fs';
import path from 'path';

// Root directory
const root = process.cwd();
const modulesPath = path.join(root, 'modules');
const outputPath = path.join(root, 'postman-collection.json');

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

interface RouteInfo {
  method: string;
  path: string;
  file: string;
  module?: string;
}

interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: Array<{ key: string; value: string; type: string }>;
    url: {
      raw: string;
      host: string[];
      path: string[];
      query?: Array<{ key: string; value: string; description?: string }>;
    };
    description?: string;
  };
  response: any[];
}

interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: string;
    _exporter_id: string;
  };
  item: PostmanItem[];
  variable?: Array<{ key: string; value: string; type: string }>;
  event?: Array<{
    listen: string;
    script: {
      type: string;
      exec: string[];
    };
  }>;
}

function toRoutePart(name: string): string {
  if (name === 'index') return '';

  // dynamic: [id] -> :id
  if (name.startsWith('[') && name.endsWith(']')) {
    const inner = name.slice(1, -1);

    // catch-all: [...slug] → *slug
    if (inner.startsWith('...')) {
      const param = inner.slice(3) || 'all';
      return `*${param}`;
    }

    return `:${inner}`;
  }

  return name;
}

function extractMethodsFromFile(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const methods: string[] = [];

    // Look for exported HTTP methods
    for (const method of VALID_METHODS) {
      // Match patterns like: export const GET = ... or export const POST = ...
      const regex = new RegExp(`export\\s+(const|function)\\s+${method}\\s*=`, 'g');
      if (regex.test(content)) {
        methods.push(method);
      }
    }

    return methods;
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    return [];
  }
}


/**
 * Get route prefix for a module (matches router.ts logic)
 * Checks for route.config.ts or routes.config.ts, then falls back to module name
 */
function getRoutePrefix(moduleDir: string, moduleName: string): string {
  // Check for route.config.ts or routes.config.ts in module directory
  const configFiles = [
    path.join(moduleDir, 'route.config.ts'),
    path.join(moduleDir, 'routes.config.ts'),
    path.join(moduleDir, 'route.config.js'),
    path.join(moduleDir, 'routes.config.js'),
  ];

  for (const configFile of configFiles) {
    if (fs.existsSync(configFile)) {
      try {
        const content = fs.readFileSync(configFile, 'utf-8');
        // Extract routePrefix from: export const routePrefix = '/storefront/products';
        const match = content.match(/export\s+const\s+routePrefix\s*=\s*['"`]([^'"`]+)['"`]/);
        if (match && match[1]) {
          const prefix = match[1];
          // Ensure it starts with / (matches router.ts logic)
          return prefix.startsWith('/') ? prefix : `/${prefix}`;
        }
      } catch (err) {
        // Ignore errors reading config
      }
    }
  }

  // Check routes/index.ts for routePrefix export
  const routesIndex = path.join(moduleDir, 'routes', 'index.ts');
  if (fs.existsSync(routesIndex)) {
    try {
      const content = fs.readFileSync(routesIndex, 'utf-8');
      const match = content.match(/export\s+const\s+routePrefix\s*=\s*['"`]([^'"`]+)['"`]/);
      if (match && match[1]) {
        const prefix = match[1];
        return prefix.startsWith('/') ? prefix : `/${prefix}`;
      }
    } catch (err) {
      // Ignore errors, fall back to default
    }
  }

  // Default: use module name as route prefix (matches router.ts logic)
  return `/${moduleName}`;
}

/**
 * Scan routes in a module (matches router.ts walkRoutes logic exactly)
 * This function recursively walks the routes directory and builds paths exactly like the router
 */
function scanModuleRoutes(moduleDir: string, moduleName: string, baseRoute: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const routesDir = path.join(moduleDir, 'routes');

  if (!fs.existsSync(routesDir)) {
    return routes;
  }

  // This function is called with baseRoute already set to routePrefix
  // Now we walk the routes directory recursively, just like router.ts walkRoutes function
  const items = fs.readdirSync(routesDir);

  for (const item of items) {
    const fullPath = path.join(routesDir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories (matches router.ts walkRoutes logic)
      const seg = toRoutePart(item);
      const nextBase = baseRoute + (seg ? `/${seg}` : '');
      routes.push(...scanModuleRoutes(moduleDir, moduleName, nextBase));
      continue;
    }

    if (!item.endsWith('.ts') && !item.endsWith('.js')) continue;

    const name = item.replace(/\.(ts|js)$/, '');
    const seg = toRoutePart(name);
    
    // Build route path exactly like router.ts walkRoutes: baseRoute + (seg ? `/${seg}` : '')
    const routePath = baseRoute + (seg ? `/${seg}` : '') || '/';

    const methods = extractMethodsFromFile(fullPath);

    for (const method of methods) {
      routes.push({
        method,
        path: routePath,
        file: path.relative(root, fullPath),
        module: moduleName,
      });
    }
  }

  return routes;
}

/**
 * Check if a route requires authentication by examining the route file
 */
function requiresAuthentication(route: RouteInfo): boolean {
  try {
    const filePath = path.join(root, route.file);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check if authenticate() is in middleware (not commented out)
    // Look for: authenticate() or authenticate({...}) in middleware array
    const hasAuthMiddleware = /authenticate\s*\([^)]*\)/.test(content) && 
                              !content.includes('// authenticate()') &&
                              !content.includes('//authenticate()');
    
    // Protected routes based on path patterns
    const protectedPaths = [
      '/graphql',
      '/indexing/',
      '/app/',
    ];
    
    const isProtectedPath = protectedPaths.some(protectedPath => 
      route.path.includes(protectedPath)
    );
    
    return hasAuthMiddleware || isProtectedPath;
  } catch (err) {
    // If we can't read the file, default to false (public)
    return false;
  }
}

/**
 * Check if a route should be excluded from the collection
 * Returns true if the route should be excluded
 */
function shouldExcludeRoute(route: RouteInfo): boolean {
  // Exclude deprecated reindexing REST endpoints (now only available via GraphQL)
  const deprecatedPaths = [
    '/indexing/reindex',
  ];
  
  return deprecatedPaths.some(deprecatedPath => route.path === deprecatedPath);
}

/**
 * Scan all modules and their routes (matches router.ts walk function logic)
 * Returns deduplicated routes, excluding deprecated endpoints
 */
function scanAllRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const routeSet = new Set<string>(); // Track unique method+path combinations

  if (!fs.existsSync(modulesPath)) {
    console.warn(`Modules directory not found: ${modulesPath}`);
    return routes;
  }

  const modules = fs.readdirSync(modulesPath);

  for (const module of modules) {
    const moduleDir = path.join(modulesPath, module);
    const stat = fs.statSync(moduleDir);

    if (stat.isDirectory()) {
      // Check if this directory has a routes folder (matches router.ts logic)
      const routesInDir = path.join(moduleDir, 'routes');
      if (fs.existsSync(routesInDir) && fs.statSync(routesInDir).isDirectory()) {
        // Determine route prefix: check for config file, then use module name as default
        const routePrefix = getRoutePrefix(moduleDir, module);
        const baseRoute = routePrefix; // Start with routePrefix as baseRoute
        const moduleRoutes = scanModuleRoutes(moduleDir, module, baseRoute);
        
        // Deduplicate routes and exclude deprecated ones
        for (const route of moduleRoutes) {
          // Skip deprecated routes
          if (shouldExcludeRoute(route)) {
            console.log(`⚠️  Excluding deprecated route: ${route.method} ${route.path} (use GraphQL instead)`);
            continue;
          }
          
          const routeKey = `${route.method}:${route.path}`;
          if (!routeSet.has(routeKey)) {
            routeSet.add(routeKey);
            routes.push(route);
          } else {
            console.log(`⚠️  Skipping duplicate route: ${route.method} ${route.path}`);
          }
        }
      }
    }
  }

  return routes;
}

function generateQueryParams(route: RouteInfo): Array<{ key: string; value: string; description?: string }> {
  const queryParams: Array<{ key: string; value: string; description?: string }> = [];
  const paramKeys = new Set<string>(); // Track added params to avoid duplicates

  // Add common query parameters based on route path
  if (route.path.includes('filters')) {
    const params = [
      { key: 'shop', value: '{{shop_domain}}', description: 'Shop domain (required)' },
      { key: 'search', value: '', description: 'Search query' },
      { key: 'vendor', value: '', description: 'Filter by vendor' },
      { key: 'productType', value: '', description: 'Filter by product type' },
      { key: 'tag', value: '', description: 'Filter by tag' },
    ];
    params.forEach(p => {
      if (!paramKeys.has(p.key)) {
        queryParams.push(p);
        paramKeys.add(p.key);
      }
    });
  }

  if (route.path.includes('fetch') || (route.path.includes('products') && !route.path.includes('filters'))) {
    const params = [
      { key: 'shop', value: '{{shop_domain}}', description: 'Shop domain (required)' },
      { key: 'search', value: '', description: 'Search query' },
      { key: 'vendor', value: '', description: 'Filter by vendor' },
      { key: 'productType', value: '', description: 'Filter by product type' },
      { key: 'tag', value: '', description: 'Filter by tag' },
      { key: 'collection', value: '', description: 'Filter by collection' },
      { key: 'page', value: '1', description: 'Page number (default: 1)' },
      { key: 'limit', value: '20', description: 'Items per page (default: 20, max: 100)' },
      { key: 'sort', value: '', description: 'Sort order (e.g., "createdAt:desc", "title:asc")' },
    ];
    params.forEach(p => {
      if (!paramKeys.has(p.key)) {
        queryParams.push(p);
        paramKeys.add(p.key);
      }
    });
  }

  if (route.path.includes('reindex')) {
    if (!paramKeys.has('shop')) {
      queryParams.push({
        key: 'shop',
        value: '{{shop_domain}}',
        description: 'Shop domain (required)',
      });
      paramKeys.add('shop');
    }
  }

  // Add shop parameter for most routes if not already added
  if (!paramKeys.has('shop') && route.path.includes('/')) {
    queryParams.push({
      key: 'shop',
      value: '{{shop_domain}}',
      description: 'Shop domain (optional)',
    });
  }

  return queryParams;
}

function generatePostmanItem(route: RouteInfo, baseUrl: string): PostmanItem {
  const pathSegments = route.path.split('/').filter(Boolean);
  const queryParams = generateQueryParams(route);
  const needsAuth = requiresAuthentication(route);

  // Build URL path with example values for dynamic segments
  const urlPath = pathSegments.map((seg) => {
    if (seg.startsWith(':')) {
      const paramName = seg.slice(1);
      return `:${paramName}`;
    }
    if (seg.startsWith('*')) {
      const paramName = seg.slice(1);
      return `*${paramName}`;
    }
    return seg;
  });

  // Build raw URL for Postman
  const pathString = urlPath.length > 0 ? '/' + urlPath.join('/') : '/';
  const queryString = queryParams.length > 0 ? '?' + queryParams.map((p) => `${p.key}=${p.value}`).join('&') : '';
  const rawUrl = `{{base_url}}${pathString}${queryString}`;

  // Build headers
  const headers: Array<{ key: string; value: string; type: string }> = [
    {
      key: 'Content-Type',
      value: 'application/json',
      type: 'text',
    },
  ];

  // Add Authorization header placeholder for protected routes
  // The pre-request script will automatically generate the actual auth header
  if (needsAuth) {
    headers.push({
      key: 'Authorization',
      value: '{{auth_header}}', // Placeholder - will be generated by pre-request script
      type: 'text',
    });
  }

  // Build description with additional context
  let description = `Route from ${route.file}${route.module ? ` (${route.module} module)` : ''}${needsAuth ? ' [Requires Authentication]' : ' [Public]'}`;
  
  // Add note about GraphQL reindexing for GraphQL endpoint
  if (route.path === '/graphql') {
    description += '\n\nNote: Reindexing is now only available via GraphQL mutation. Use the `reindexProducts` mutation instead of the deprecated REST endpoint.';
  }

  return {
    name: `${route.method} ${route.path}`,
    request: {
      method: route.method,
      header: headers,
      url: {
        raw: rawUrl,
        host: ['{{base_url}}'],
        path: urlPath.length > 0 ? urlPath : [''],
        query: queryParams.length > 0 ? queryParams : undefined,
      },
      description: description,
    },
    response: [],
  };
}

function organizeRoutesIntoFolders(routes: RouteInfo[]): any[] {
  const folderMap = new Map<string, RouteInfo[]>();

  for (const route of routes) {
    const pathParts = route.path.split('/').filter(Boolean);
    // Use first segment as folder name, or module name, or "Root" for root-level routes
    let folderName = 'Root';
    
    if (pathParts.length > 0) {
      folderName = pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
    } else if (route.module) {
      folderName = route.module.charAt(0).toUpperCase() + route.module.slice(1);
    }
    
    const items = folderMap.get(folderName) || [];
    items.push(route);
    folderMap.set(folderName, items);
  }

  const folders: any[] = [];

  for (const [folderName, folderRoutes] of folderMap.entries()) {
    folders.push({
      name: folderName,
      item: folderRoutes.map((route) => {
        const baseUrl = '{{base_url}}';
        return generatePostmanItem(route, baseUrl);
      }),
    });
  }

  return folders;
}

/**
 * Generate HMAC-SHA256 authentication pre-request script for Postman
 */
function generateAuthPreRequestScript(): string {
  return `// HMAC-SHA256 Authentication Pre-request Script
// Automatically generates authentication headers for protected routes
// Uses native crypto API (not CryptoJS)

// Wrap in async IIFE to use async/await
(async function() {
// Get request details first
const method = pm.request.method;

// Handle Postman URL object - it can be an object or string
let path = '/';
let queryParams = [];
let queryString = '';

try {
    // pm.request.url is a PostmanUrl object in Postman
    // Extract path and query from the URL object directly
    const url = pm.request.url;
    
    if (url && typeof url === 'object') {
        // Postman URL object structure: { protocol, host, path, query, etc. }
        // Extract path - must match Express req.path (path without query string)
        const pathParts = url.path || [];
        const extractedPath = Array.isArray(pathParts) ? pathParts.filter(p => p).join('/') : (pathParts || '');
        // Ensure path starts with / and normalize (matches Express req.path)
        path = extractedPath.startsWith('/') ? extractedPath : '/' + extractedPath;
        
        // Extract query parameters - will be built later with sorting
        // Store query params for later processing
        queryParams = url.query || [];
    } else if (typeof url === 'string') {
        // If it's a string, try to parse it
        try {
            // Resolve Postman variables first
            let resolvedUrl = url;
            if (url.includes('{{')) {
                const baseUrl = pm.environment.get("base_url") || pm.collectionVariables.get("base_url") || "http://localhost:3554";
                resolvedUrl = url.replace(/\\{\\{base_url\\}\\}/g, baseUrl);
                resolvedUrl = resolvedUrl.replace(/\\{\\{([^}]+)\\}\\}/g, function(match, varName) {
                    return pm.environment.get(varName) || pm.collectionVariables.get(varName) || match;
                });
            }
            
            const urlObj = new URL(resolvedUrl);
            path = urlObj.pathname;
            // Extract query params from URL string for later sorting
            if (urlObj.search) {
                const params = new URLSearchParams(urlObj.search.substring(1));
                queryParams = Array.from(params.entries()).map(function(entry) {
                    return { key: entry[0], value: entry[1] };
                });
            }
        } catch (parseError) {
            console.warn('Failed to parse URL string, using fallback:', parseError);
            // Extract path manually from string
            const pathMatch = url.match(/\\/([^?]*)/);
            if (pathMatch) {
                path = pathMatch[0];
            }
            const queryMatch = url.match(/\\?([^#]*)/);
            if (queryMatch) {
                // Extract query params from string for later sorting
                const params = new URLSearchParams(queryMatch[1]);
                queryParams = Array.from(params.entries()).map(function(entry) {
                    return { key: entry[0], value: entry[1] };
                });
            }
        }
    }
} catch (error) {
    console.error('Error extracting URL components:', error);
    // Skip authentication if URL parsing fails
    return;
}

// Check if route requires authentication (has Authorization header placeholder)
const hasAuthHeader = pm.request.headers.has('Authorization');
if (!hasAuthHeader) {
    // Route doesn't require authentication, skip
    console.log('⏭ Skipping authentication for public route:', method, path);
    return;
}

const apiKey = pm.environment.get("API_KEY") || pm.collectionVariables.get("API_KEY");
const apiSecret = pm.environment.get("API_SECRET") || pm.collectionVariables.get("API_SECRET");

// Only generate auth header if credentials are available
if (!apiKey || !apiSecret) {
    console.warn('⚠️  API_KEY and API_SECRET must be set for authenticated routes');
    return;
}

// Helper function to convert string to Uint8Array
function stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        if (charCode < 0x80) {
            bytes.push(charCode);
        } else if (charCode < 0x800) {
            bytes.push(0xc0 | (charCode >> 6));
            bytes.push(0x80 | (charCode & 0x3f));
        } else {
            bytes.push(0xe0 | (charCode >> 12));
            bytes.push(0x80 | ((charCode >> 6) & 0x3f));
            bytes.push(0x80 | (charCode & 0x3f));
        }
    }
    return new Uint8Array(bytes);
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Get request body
// IMPORTANT: Server hashes the parsed JSON object (not raw string)
// Express body parser parses JSON, so we need to hash the parsed object with sorted keys
let bodyHash = '';
const body = pm.request.body;
if (body && body.raw) {
    const bodyStr = body.raw;
    if (bodyStr && bodyStr.length > 0) {
        try {
            // Parse JSON first (matches what Express body parser does)
            const parsed = JSON.parse(bodyStr);
            
            // Stringify with sorted keys (matches server's hashRequestBody logic)
            // Server uses: JSON.stringify(body, Object.keys(body).sort())
            // Note: JSON.stringify with replacer array sorts keys automatically
            const sortedKeys = Object.keys(parsed).sort();
            // Use replacer array to ensure keys are in sorted order
            const sortedBody = JSON.stringify(parsed, sortedKeys);
            
            // Hash the sorted JSON string (matches server's hashRequestBody)
            if (crypto && crypto.subtle) {
                const data = stringToBytes(sortedBody);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                bodyHash = arrayBufferToBase64(hashBuffer);
            } else {
                console.warn('crypto.subtle not available, skipping body hash');
                bodyHash = '';
            }
        } catch (parseError) {
            // If not JSON, hash as-is (but this shouldn't happen for GraphQL)
            try {
                if (crypto && crypto.subtle) {
                    const data = stringToBytes(bodyStr);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    bodyHash = arrayBufferToBase64(hashBuffer);
                } else {
                    console.warn('crypto.subtle not available, skipping body hash');
                    bodyHash = '';
                }
            } catch (e) {
                console.error('Error hashing body:', e);
                bodyHash = '';
            }
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

// Build query string (sorted and URL-encoded)
// IMPORTANT: Must match server's buildQueryString logic exactly
// Server sorts keys and URL-encodes both key and value
function buildQueryStringFromPostman(params) {
    if (!params || params.length === 0) return '';
    
    // Extract key-value pairs from Postman query params
    const pairs = [];
    for (let i = 0; i < params.length; i++) {
        const param = params[i];
        if (param && (param.key || param.name)) {
            const key = param.key || param.name || '';
            const value = param.value || '';
            // Store key-value pair (will sort and encode later)
            pairs.push({
                key: key,
                value: String(value)
            });
        }
    }
    
    // Sort by key (matches server's Object.keys(query).sort())
    pairs.sort(function(a, b) {
        return a.key.localeCompare(b.key);
    });
    
    // Build query string with URL encoding (matches server logic)
    return pairs.map(function(pair) {
        return encodeURIComponent(pair.key) + '=' + encodeURIComponent(pair.value);
    }).join('&');
}

// Build query string from Postman URL object
// Server uses buildQueryString(req.query) which sorts keys and URL-encodes
const sortedQueryString = queryParams && queryParams.length > 0 ? buildQueryStringFromPostman(queryParams) : '';

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
].join('\\n');

// Generate HMAC-SHA256 signature using native crypto API
let signature = '';
try {
    if (!crypto || !crypto.subtle) {
        throw new Error('crypto.subtle not available');
    }
    
    const keyData = stringToBytes(apiSecret);
    const messageData = stringToBytes(payload);
    
    // Import key for HMAC
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    // Sign the message
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
    signature = arrayBufferToBase64(signatureBuffer);
} catch (error) {
    console.error('Failed to generate HMAC signature:', error);
    // Skip authentication if signature generation fails
    return;
}

// Build authorization header
const authHeader = 'HMAC-SHA256 apiKey=' + apiKey + ',timestamp=' + timestamp + ',nonce=' + nonce + ',signature=' + signature;

// Debug logging (only in development)
if (pm.environment.get('DEBUG_AUTH') === 'true' || pm.collectionVariables.get('DEBUG_AUTH') === 'true') {
    console.log('=== Authentication Debug Info ===');
    console.log('Method:', method);
    console.log('Path:', path);
    console.log('Query String:', sortedQueryString);
    console.log('Body Hash:', bodyHash);
    console.log('Timestamp:', timestamp);
    console.log('Nonce:', nonce);
    console.log('Payload (for signature):', payload.replace(/\\n/g, ' | '));
    console.log('Signature:', signature);
    console.log('================================');
}

// Update the authorization header
pm.request.headers.upsert({
    key: 'Authorization',
    value: authHeader
});

console.log('✓ Authentication header generated for', method, path);
})(); // End async IIFE`;
}

function generateCollection(routes: RouteInfo[]): PostmanCollection {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3554';

  // Organize routes into folders
  const folders = organizeRoutesIntoFolders(routes);

  // Generate pre-request script for authentication
  const authScript = generateAuthPreRequestScript();

  return {
    info: {
      name: 'Advanced Filters & Search App API',
      description: 'Auto-generated Postman collection from route files with HMAC-SHA256 authentication support',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _exporter_id: 'postman-generator',
    },
    item: folders,
    variable: [
      {
        key: 'base_url',
        value: baseUrl,
        type: 'string',
      },
      {
        key: 'shop_domain',
        value: 'digitalcoo-filter-demo-10.myshopify.com', // test shop name, replace your dev shop 
        type: 'string',
      },
      {
        key: 'API_KEY',
        value: '',
        type: 'string',
      },
      {
        key: 'API_SECRET',
        value: '',
        type: 'string',
      },
    ],
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: authScript.split('\n'),
        },
      },
    ],
  };
}

// Main execution
console.log('🔍 Scanning routes...');
const routes = scanAllRoutes();

if (routes.length === 0) {
  console.log('❌ No routes found!');
  process.exit(1);
}

console.log(`✅ Found ${routes.length} route(s):`);
routes.forEach((route) => {
  console.log(`   ${route.method} ${route.path} (${route.file})`);
});

console.log('\n📦 Generating Postman collection...');
const collection = generateCollection(routes);

fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
console.log(`✅ Postman collection generated: ${outputPath}`);

// Count protected vs public routes
const protectedCount = routes.filter(r => requiresAuthentication(r)).length;
const publicCount = routes.length - protectedCount;

console.log(`\n📊 Collection Statistics:`);
console.log(`   Total routes: ${routes.length}`);
console.log(`   Protected routes (require auth): ${protectedCount}`);
console.log(`   Public routes: ${publicCount}`);

const baseUrl = process.env.BASE_URL || 'http://localhost:3554';

console.log(`\n💡 Setup Instructions:`);
console.log(`   1. Import ${outputPath} into Postman`);
console.log(`   2. Set environment variables:`);
console.log(`      - API_KEY: Your API key`);
console.log(`      - API_SECRET: Your API secret`);
console.log(`      - base_url: ${baseUrl}`);
console.log(`      - shop_domain: Your shop domain`);
console.log(`   3. The pre-request script will automatically add authentication headers to protected routes`);
console.log(`   4. Public routes (storefront/*, system/health) don't require authentication`);

