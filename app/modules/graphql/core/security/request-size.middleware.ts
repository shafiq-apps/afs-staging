/**
 * Request Size Limit Middleware
 * Framework-level middleware to prevent DoS via large payloads
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('request-size');

interface RequestSizeOptions {
  maxSize?: number;
  maxJsonSize?: number;
  maxUrlLength?: number;
  message?: string;
}

const DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_JSON_SIZE = 512 * 1024; // 512KB
const DEFAULT_MAX_URL_LENGTH = 2048; // 2KB

/**
 * Create request size limit middleware
 */
export function requestSizeLimit(options: RequestSizeOptions = {}) {
  const {
    maxSize = DEFAULT_MAX_SIZE,
    maxJsonSize = DEFAULT_MAX_JSON_SIZE,
    maxUrlLength = DEFAULT_MAX_URL_LENGTH,
    message = 'Request too large',
  } = options;

  return (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): void => {
    const urlLength = (req.url || '').length;
    if (urlLength > maxUrlLength) {
      logger.warn('Request URL too long', { urlLength, maxUrlLength, path: req.path });
      res.status(414).json({
        success: false,
        message: 'Request URL too long',
      });
      return;
    }

    const contentLength = parseInt(req.get('content-length') || '0', 10);
    if (contentLength > maxSize) {
      logger.warn('Request body too large', { contentLength, maxSize, path: req.path });
      res.status(413).json({
        success: false,
        message,
        maxSize,
      });
      return;
    }

    const contentType = req.get('content-type') || '';
    if (contentType.includes('application/json') && contentLength > maxJsonSize) {
      logger.warn('JSON body too large', { contentLength, maxJsonSize, path: req.path });
      res.status(413).json({
        success: false,
        message: 'JSON body too large',
        maxJsonSize,
      });
      return;
    }

    next();
  };
}

export const defaultRequestSizeLimit = requestSizeLimit();

