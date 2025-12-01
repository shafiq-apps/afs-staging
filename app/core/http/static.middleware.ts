/**
 * Static File Serving Middleware
 * Serves static files and React build files
 */

import express, { Express, RequestHandler } from 'express';
import path from 'path';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('static-files');

export interface StaticFileOptions {
  /**
   * Path to static files directory (e.g., 'public', 'static')
   */
  publicPath?: string;
  /**
   * Path to React build directory (e.g., 'build', 'dist', 'client/build')
   */
  reactBuildPath?: string;
  /**
   * URL prefix for static files (e.g., '/static', '/assets')
   */
  staticPrefix?: string;
  /**
   * URL prefix for React app (e.g., '/app', '/')
   */
  reactPrefix?: string;
  /**
   * Enable React SPA fallback (serve index.html for all routes)
   */
  enableSPAFallback?: boolean;
  /**
   * Maximum age for static assets cache (in milliseconds)
   */
  maxAge?: number;
}

/**
 * Configure static file serving
 */
export function configureStaticFiles(
  app: Express,
  options: StaticFileOptions = {}
): void {
  const {
    publicPath = 'public',
    reactBuildPath,
    staticPrefix = '/static',
    reactPrefix = '/',
    enableSPAFallback = true,
    maxAge = 86400000, // 1 day
  } = options;

  const baseDir = process.env.NODE_ENV === 'production' ? process.cwd() : process.cwd();

  // Serve static files from public directory
  if (publicPath) {
    const publicDir = path.join(baseDir, publicPath);
    try {
      app.use(
        staticPrefix,
        express.static(publicDir, {
          maxAge,
          etag: true,
          lastModified: true,
        })
      );
      logger.info(`Static files served from: ${publicDir} at ${staticPrefix}`);
    } catch (error: any) {
      logger.warn(`Failed to serve static files from ${publicDir}:`, error?.message);
    }
  }

  // Serve React build files
  if (reactBuildPath) {
    const buildDir = path.join(baseDir, reactBuildPath);
    try {
      // Serve static assets from React build
      app.use(
        reactPrefix,
        express.static(path.join(buildDir, 'static'), {
          maxAge: maxAge * 7, // Cache static assets longer (7 days)
          etag: true,
          lastModified: true,
        })
      );

      // Serve React app HTML and enable SPA fallback
      if (enableSPAFallback) {
        const indexPath = path.join(buildDir, 'index.html');
        app.get(`${reactPrefix}*`, (req, res, next) => {
          // Skip API routes
          if (req.path.startsWith('/api') || req.path.startsWith('/storefront') || req.path.startsWith('/system')) {
            return next();
          }
          res.sendFile(indexPath);
        });
        logger.info(`React SPA fallback enabled: ${indexPath} at ${reactPrefix}*`);
      } else {
        // Just serve the index.html at root
        app.get(reactPrefix === '/' ? '/' : reactPrefix, (req, res) => {
          res.sendFile(path.join(buildDir, 'index.html'));
        });
      }

      logger.info(`React build served from: ${buildDir} at ${reactPrefix}`);
    } catch (error: any) {
      logger.warn(`Failed to serve React build from ${buildDir}:`, error?.message);
    }
  }
}

/**
 * Create static file middleware factory
 */
export function createStaticMiddleware(options: StaticFileOptions = {}): RequestHandler[] {
  const {
    publicPath = 'public',
    reactBuildPath,
    staticPrefix = '/static',
    reactPrefix = '/',
    enableSPAFallback = true,
    maxAge = 86400000,
  } = options;

  const baseDir = process.env.NODE_ENV === 'production' ? process.cwd() : process.cwd();
  const middlewares: RequestHandler[] = [];

  // Static files middleware
  if (publicPath) {
    const publicDir = path.join(baseDir, publicPath);
    middlewares.push(
      express.static(publicDir, {
        maxAge,
        etag: true,
        lastModified: true,
      })
    );
  }

  // React build middleware
  if (reactBuildPath) {
    const buildDir = path.join(baseDir, reactBuildPath);
    middlewares.push(
      express.static(path.join(buildDir, 'static'), {
        maxAge: maxAge * 7,
        etag: true,
        lastModified: true,
      })
    );
  }

  return middlewares;
}

