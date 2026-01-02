/**
 * Best Seller Collection Cleanup Route
 * POST /admin/best-seller-cleanup
 * Deletes best seller collections unused for 30+ days
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';
import { getESClient } from '@core/elasticsearch/es.client';
import { BestSellerCleanupService } from '../indexing.best-seller-cleanup.service';
import { ShopsRepository } from '@modules/shops/shops.repository';

const logger = createModuleLogger('admin:best-seller-cleanup');

export const POST = handler(async (req: HttpRequest) => {
  // Get shops repository from request (injected by bootstrap)
  const shopsRepository = (req as any).shopsRepository as ShopsRepository | undefined;

  if (!shopsRepository) {
    return {
      statusCode: 500,
      body: { success: false, message: 'Shops repository not available' },
    };
  }

  // Get days parameter (default: 30)
  const daysParam = req.query?.days as string;
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  if (isNaN(days) || days < 1) {
    return {
      statusCode: 400,
      body: { success: false, message: 'Invalid days parameter. Must be a positive number.' },
    };
  }

  // Run cleanup in background
  (async () => {
    try {
      logger.info(`Starting background cleanup for collections unused for ${days} days`);

      const esClient = getESClient();
      const cleanupService = new BestSellerCleanupService(esClient, shopsRepository);

      const result = await cleanupService.runCleanup(days);

      logger.info('Cleanup completed', result);
    } catch (err: any) {
      logger.error('Cleanup error', {
        error: err?.message || err,
        stack: err?.stack,
      });
    }
  })();

  return {
    statusCode: 202,
    body: {
      success: true,
      message: `Cleanup started for collections unused for ${days} days`,
    },
  };
});

