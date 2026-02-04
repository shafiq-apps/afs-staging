/**
 * HTTP Validation Middleware
 * Framework-level middleware for request validation
 */

import { HttpRequest, HttpResponse, HttpNextFunction } from '@core/http/http.types';
import { ValidationSchema } from '@core/http/validation.schema';
import { validateRequest } from '@core/http/validation.validator';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('validation-middleware');

declare global {
  namespace Express {
    interface Request {
      validated?: {
        query?: Record<string, any>;
        body?: Record<string, any>;
        params?: Record<string, any>;
      };
    }
  }
}

/**
 * Create validation middleware for a specific schema
 */
export function validate(schema: ValidationSchema) {
  return async (req: HttpRequest, res: HttpResponse, next: HttpNextFunction): Promise<void> => {
    try {
      const result = validateRequest(req, schema);

      if (!result.valid) {
        logger.warn('Validation failed', {
          path: req.path,
          method: req.method,
          errors: result.errors,
        });

        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: result.errors,
        });
        return;
      }

      req.validated = result.data;

      if (result.data.query) {
        Object.assign(req.query, result.data.query);
      }
      if (result.data.body) {
        Object.assign(req.body, result.data.body);
      }
      if (result.data.params) {
        Object.assign(req.params, result.data.params);
      }

      next();
    } catch (error: any) {
      logger.error('Validation middleware error', error?.message || error);
      res.status(500).json({
        success: false,
        message: 'Validation error',
        error: error?.message || 'Internal validation error',
      });
    }
  };
}

/**
 * Convenience function to create shop domain validator
 */
export function validateShopDomain() {
  return validate({
    query: {
      shop: {
        type: 'string',
        required: true,
        transform: (value: string) => {
          const normalized = value.trim().toLowerCase();
          const domain = normalized.replace(/^https?:\/\//, '').split('/')[0];

          const myshopifyMatch = domain.match(/^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/);
          if (myshopifyMatch) {
            return myshopifyMatch[1];
          }

          throw new Error('Invalid shop domain (must be *.myshopify.com)');
        },
        validate: (value: string) => {
          if (!value || value.length === 0) {
            return 'Shop domain is required';
          }
          return true;
        },
      },
    },
  });
}

