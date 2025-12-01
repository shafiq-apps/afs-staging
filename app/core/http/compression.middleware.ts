/**
 * Compression Middleware
 * Framework-level HTTP compression middleware
 */

import compression from 'compression';
import { Request, Response } from 'express';

const shouldCompress = (req: Request, res: Response): boolean => {
  if (req.headers['x-no-compression']) {
    return false;
  }

  const contentType = res.getHeader('content-type');
  if (contentType) {
    const contentTypeStr = Array.isArray(contentType) ? contentType[0] : String(contentType);

    if (contentTypeStr.includes('gzip') || contentTypeStr.includes('br') || contentTypeStr.includes('deflate')) {
      return false;
    }

    const binaryTypes = [
      'image/',
      'video/',
      'audio/',
      'application/octet-stream',
      'application/pdf',
      'application/zip',
    ];

    if (binaryTypes.some((type) => contentTypeStr.includes(type))) {
      return false;
    }
  }

  return true;
};

export const compressionMiddleware = compression({
  level: 6,
  threshold: 1024,
  filter: shouldCompress,
  brotliCompress: true,
  chunkSize: 16 * 1024,
});

export const fastCompressionMiddleware = compression({
  level: 3,
  threshold: 512,
  filter: shouldCompress,
  brotliCompress: false,
  chunkSize: 16 * 1024,
});

export const maxCompressionMiddleware = compression({
  level: 9,
  threshold: 512,
  filter: shouldCompress,
  brotliCompress: true,
  chunkSize: 16 * 1024,
});

