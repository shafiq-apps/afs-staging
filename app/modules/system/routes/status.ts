/**
 * System Status Route
 * GET /system/status
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { graphqlHandler } from '@modules/graphql';

export const GET = handler(async (req: HttpRequest) => {
  const shop = await graphqlHandler.read('shopExists', { domain: req.query.shop });

  return {
    shopshop: req.query.shop,
    shop: shop,
    success: true,
    status: 'operational',
    version: process.env.npm_package_version || '0.0.1',
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    memory: {
      used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
      total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      unit: 'MB',
    },
  };
});

