/**
 * Router
 * Automatic route loading system
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import express, { Express } from 'express';
import { RouteModule } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('router');

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Get route prefix for a module
 * Checks for route.config.ts or routes.config.ts, then falls back to module name
 */
async function getRoutePrefix(moduleDir: string, moduleName: string): Promise<string> {
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
        const configPath = configFile.replace(/\.ts$/, '').replace(/\.js$/, '');
        const configUrl = pathToFileURL(configPath).href;
        const config = await import(configUrl);
        
        if (config.routePrefix && typeof config.routePrefix === 'string') {
          return config.routePrefix.startsWith('/') ? config.routePrefix : `/${config.routePrefix}`;
        }
      } catch (err: any) {
        logger.warn(`Failed to load route config from ${configFile}:`, err?.message);
      }
    }
  }

  // Check routes/index.ts for routePrefix export
  const routesIndex = path.join(moduleDir, 'routes', 'index.ts');
  if (fs.existsSync(routesIndex)) {
    try {
      const indexPath = routesIndex.replace(/\.ts$/, '');
      const indexUrl = pathToFileURL(indexPath).href;
      const indexModule = await import(indexUrl);
      
      if (indexModule.routePrefix && typeof indexModule.routePrefix === 'string') {
        return indexModule.routePrefix.startsWith('/') ? indexModule.routePrefix : `/${indexModule.routePrefix}`;
      }
    } catch (err: any) {
      // Ignore errors, fall back to default
    }
  }

  // Default: use module name as route prefix
  return `/${moduleName}`;
}

function isRouteFile(file: string): boolean {
  return file.endsWith('.ts') || file.endsWith('.js');
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

export async function loadRoutes(app: Express, options?: { routesDir?: string }): Promise<void> {
  const baseDir = process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'dist')
    : process.cwd();

  const routesPath = options?.routesDir || path.join(baseDir, 'modules');

  logger.info(`Loading routes from ${routesPath}`);

  if (!fs.existsSync(routesPath)) {
    logger.warn(`Routes directory not found: ${routesPath}`);
    return;
  }

  const walk = async (dir: string, baseRoute = ''): Promise<void> => {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        // Check if this directory has a routes folder
        const routesInDir = path.join(full, 'routes');
        if (fs.existsSync(routesInDir) && fs.statSync(routesInDir).isDirectory()) {
          // Determine route prefix: check for config file, then use module name as default
          let routePrefix = await getRoutePrefix(full, item);
          
          const nextBase = baseRoute + routePrefix;
          await walkRoutes(routesInDir, nextBase);
        }
        continue;
      }

      if (!isRouteFile(item)) continue;

      const name = item.replace(/\.(ts|js)$/, '');
      const seg = toRoutePart(name);
      const routePath = baseRoute + (seg ? `/${seg}` : '');

      // Load module
      let mod: RouteModule;
      try {
        // Use dynamic import for ES modules
        // Remove .ts extension for import
        const modulePath = full.replace(/\.ts$/, '');
        // Convert to file:// URL for ES module import
        const moduleUrl = pathToFileURL(modulePath).href;
        const imported = await import(moduleUrl);
        mod = imported as RouteModule;
      } catch (err: any) {
        logger.error(`Failed to import route file ${full}:`, err?.message || err);
        continue;
      }

      const middleware = Array.isArray(mod.middleware) ? mod.middleware : [];

      for (const key of Object.keys(mod)) {
        const method = key.toUpperCase();
        if (!VALID_METHODS.has(method)) continue;

        const handler = (mod as any)[key] as express.RequestHandler;

        // Register with middleware
        (app as any)[method.toLowerCase()](routePath || '/', ...middleware, async (req: any, res: any, next: any) => {
          try {
            const result = await handler(req, res, next);
            if (res.headersSent) return;
            if (result === undefined) return;
            // Handle statusCode in response
            if (result && typeof result === 'object' && 'statusCode' in result) {
              res.status(result.statusCode);
              delete result.statusCode;
            }
            res.json(result);
          } catch (e) {
            next(e);
          }
        });

        logger.info(`Registered ${method} ${routePath || '/'}`);
      }
    }
  };

  const walkRoutes = async (dir: string, baseRoute = ''): Promise<void> => {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        const seg = toRoutePart(item);
        const nextBase = baseRoute + (seg ? `/${seg}` : '');
        await walkRoutes(full, nextBase);
        continue;
      }

      if (!isRouteFile(item)) continue;

      const name = item.replace(/\.(ts|js)$/, '');
      const seg = toRoutePart(name);
      const routePath = baseRoute + (seg ? `/${seg}` : '');

      // Load module
      let mod: RouteModule;
      try {
        // Use dynamic import for ES modules
        // Remove .ts extension for import
        const modulePath = full.replace(/\.ts$/, '');
        // Convert to file:// URL for ES module import
        const moduleUrl = pathToFileURL(modulePath).href;
        const imported = await import(moduleUrl);
        mod = imported as RouteModule;
      } catch (err: any) {
        logger.error(`Failed to import route file ${full}:`, err?.message || err);
        continue;
      }

      const middleware = Array.isArray(mod.middleware) ? mod.middleware : [];

      for (const key of Object.keys(mod)) {
        const method = key.toUpperCase();
        if (!VALID_METHODS.has(method)) continue;

        const handler = (mod as any)[key] as express.RequestHandler;

        // Register with middleware
        (app as any)[method.toLowerCase()](routePath || '/', ...middleware, async (req: any, res: any, next: any) => {
          try {
            const result = await handler(req, res, next);
            if (res.headersSent) return;
            if (result === undefined) return;
            res.json(result);
          } catch (e) {
            next(e);
          }
        });

        logger.info(`Registered ${method} ${routePath || '/'}`);
      }
    }
  };

  await walk(routesPath);
}

