/**
 * Health Check Route
 * GET /system/health
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { isESHealthy, esConnection } from '@core/elasticsearch/es.client';

export const GET = handler(async (req: HttpRequest) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      elasticsearch: 'unknown',
    },
  };

  // Check Elasticsearch connection
  try {
    const esHealthy = await isESHealthy();
    const esStatus = esConnection.getStatus();
    
    health.services.elasticsearch = esHealthy ? 'connected' : 'disconnected';
    
    if (!esHealthy || !esStatus.initialized) {
      health.status = 'degraded';
    }
  } catch (error: any) {
    health.services.elasticsearch = 'error';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return {
    statusCode,
    ...health,
  };
});

