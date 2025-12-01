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
 * Scan all modules and their routes (matches router.ts walk function logic)
 */
function scanAllRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];

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
        routes.push(...moduleRoutes);
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

  return {
    name: `${route.method} ${route.path}`,
    request: {
      method: route.method,
      header: [
        {
          key: 'Content-Type',
          value: 'application/json',
          type: 'text',
        },
      ],
      url: {
        raw: rawUrl,
        host: ['{{base_url}}'],
        path: urlPath.length > 0 ? urlPath : [''],
        query: queryParams.length > 0 ? queryParams : undefined,
      },
      description: `Route from ${route.file}${route.module ? ` (${route.module} module)` : ''}`,
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

function generateCollection(routes: RouteInfo[]): PostmanCollection {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3554';

  // Organize routes into folders
  const folders = organizeRoutesIntoFolders(routes);

  return {
    info: {
      name: 'Advanced Filters & Search App API',
      description: 'Auto-generated Postman collection from route files',
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
console.log(`\n💡 You can import this file into Postman to test all endpoints.`);

