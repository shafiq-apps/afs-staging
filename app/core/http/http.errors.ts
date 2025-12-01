/**
 * HTTP Errors
 * Custom error types and error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('http-errors');

export class HttpError extends Error {
  status: number;
  detail?: any;

  constructor(status: number, message: string, detail?: any) {
    super(message);
    this.status = status;
    this.detail = detail;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
      detail: err.detail,
    });
  }

  logger.error('Unhandled error', {
    error: err?.message || err,
    stack: err?.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
  });
};

