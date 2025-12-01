/**
 * HTTP Handler
 * Wrapper for route handlers with consistent error handling
 */

import { Request, Response, NextFunction } from 'express';
import { HttpHandler } from './http.types';

export type { HttpHandler };

export const handler = (fn: HttpHandler) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = await fn(req, res, next);
      if (!res.headersSent && r !== undefined) {
        // Handle old app format: { statusCode: 200, body: {...} }
        if (r && typeof r === 'object' && 'statusCode' in r && 'body' in r) {
          res.status((r as any).statusCode || 200);
          res.json((r as any).body);
        } else {
          // Direct response format
          res.json(r);
        }
      }
    } catch (err) {
      next(err);
    }
  };
};

