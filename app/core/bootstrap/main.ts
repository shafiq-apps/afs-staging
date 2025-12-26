/**
 * Bootstrap
 * Application initialization and setup
 */

import express, { Express } from 'express';
import { createModuleLogger } from '@shared/utils/logger.util';
import { getEnv, isProduction } from '@core/config';
import { initializeES, getESClient } from '@core/elasticsearch/es.client';
import { createProductsModule } from '@modules/storefront/products.factory.js';
import { createShopsModule } from '@modules/shops/shops.factory';
import { createFiltersModule } from '@modules/filters/filters.factory';
import { createGraphQLModule } from '@modules/graphql/graphql.factory';
import { loadRoutes } from '@core/router/router';
import { defaultSecurity } from '@core/security/default-security.middleware';
import { errorHandler } from '@core/http/http.errors';
import { configureStaticFiles } from '@core/http/static.middleware';
import cors from "cors";
import { createSubscriptionModule } from '@modules/subscriptions/subscriptions.factory.js';

const logger = createModuleLogger('bootstrap');

export async function bootstrap() {
  logger.info('Bootstrapping application...', {
    env: getEnv(),
    nodeEnv: process.env.NODE_ENV,
    isProduction: isProduction(),
  });

  const app: Express = express();

  // Remove X-Powered-By header
  app.disable('x-powered-by');

  if (process.env.NODE_ENV !== "production") {
    app.use(cors());
  }
  // Apply default security middleware globally
  app.use(defaultSecurity);

  // JSON body parser
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Configure static file serving (optional)
  // Set environment variables to enable:
  // - STATIC_PUBLIC_PATH: path to public static files (e.g., 'public')
  // - STATIC_REACT_BUILD_PATH: path to React build directory (e.g., 'client/build')
  // - STATIC_PREFIX: URL prefix for static files (default: '/static')
  // - REACT_PREFIX: URL prefix for React app (default: '/')
  // - ENABLE_SPA_FALLBACK: enable SPA fallback for React (default: 'true')
  if (process.env.STATIC_PUBLIC_PATH || process.env.STATIC_REACT_BUILD_PATH) {
    configureStaticFiles(app, {
      publicPath: process.env.STATIC_PUBLIC_PATH,
      reactBuildPath: process.env.STATIC_REACT_BUILD_PATH,
      staticPrefix: process.env.STATIC_PREFIX || '/static',
      reactPrefix: process.env.REACT_PREFIX || '/',
      enableSPAFallback: process.env.ENABLE_SPA_FALLBACK !== 'false',
      maxAge: parseInt(process.env.STATIC_MAX_AGE || '86400000'), // 1 day default
    });
  }

  // Initialize Elasticsearch connection
  logger.info('Initializing Elasticsearch connection...');
  try {
    await initializeES({
      host: process.env.ELASTICSEARCH_HOST,
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD,
      caCertPath: process.env.ELASTICSEARCH_CA_CERT_PATH,
      rejectUnauthorized: process.env.ELASTICSEARCH_REJECT_UNAUTHORIZED !== 'false',
      pingTimeout: parseInt(process.env.ELASTICSEARCH_PING_TIMEOUT || '5000'),
      requestTimeout: parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3'),
    });
    logger.info('Elasticsearch connection initialized successfully');
  } catch (error: any) {
    logger.error('Failed to initialize Elasticsearch connection', error?.message || error);
    throw new Error(`Bootstrap failed: ${error?.message || error}`);
  }

  // Get ES client (now guaranteed to be initialized)
  const esClient = getESClient();

  // Initialize modules
  const productsModule = createProductsModule(esClient);
  const shopsModule = createShopsModule(esClient);
  const filtersModule = createFiltersModule(esClient);
  const subscriptionsModule = createSubscriptionModule(esClient);
  
  // Initialize GraphQL module
  const graphqlModule = createGraphQLModule(esClient, {
    productsService: productsModule.service,
    shopsRepository: shopsModule.repository,
    filtersRepository: filtersModule.repository,
    subscriptionsRepository: subscriptionsModule.repository,
  });
  
  // Initialize webhook worker for async processing
  try {
    const { WebhookWorkerService } = await import('@modules/webhooks/webhooks.worker.service');
    const webhookWorker = new WebhookWorkerService(esClient);
    const workerInterval = parseInt(process.env.WEBHOOK_WORKER_INTERVAL_MS || '5000');
    webhookWorker.start(workerInterval);
    logger.info('Webhook worker started', { intervalMs: workerInterval });
  } catch (error: any) {
    logger.warn('Failed to start webhook worker', error?.message || error);
    // Don't fail bootstrap if worker fails to start
  }
  
  // TODO: Initialize other modules here (users, etc.)
  // const usersModule = createUsersModule();

  // Inject services into request (for route handlers)
  app.use((req: any, res, next) => {
    req.productsService = productsModule.service;
    req.shopsRepository = shopsModule.repository;
    req.filtersRepository = filtersModule.repository;
    req.graphqlService = graphqlModule.service;
    req.subscriptionsRepository = subscriptionsModule.repository;
    req.esClient = esClient; // Inject ES client for GraphQL resolvers
    // req.usersService = usersModule.service;
    next();
  });

  // Load routes automatically from modules
  await loadRoutes(app);

  // Also load root routes (optional)
  try {
    // Use dynamic import with runtime path construction for ES modules
    // @ts-ignore - routes/index is optional and may not exist
    const rootRoutes = await import('../../routes/index.js');
    if (rootRoutes?.GET) {
      app.get('/', rootRoutes.GET);
    }
  } catch (error) {
    // Root routes file is optional - ignore if it doesn't exist
  }

  // Error handler (must be last)
  app.use(errorHandler);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
  });

  return { app };
}
