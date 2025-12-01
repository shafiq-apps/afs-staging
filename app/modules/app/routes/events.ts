/**
 * App Events Route
 * POST /app/events
 * Handles Shopify app lifecycle events
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validate } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { graphqlHandler } from '@modules/graphql';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('app-events');

export const middleware = [
  validate({
    body: {
      event: {
        type: 'string',
        required: true,
        enum: ['APP_INSTALLED', 'APP_UNINSTALLED'],
      },
      shop: {
        type: 'string',
        required: true,
      },
    },
  }),
  rateLimit({
    windowMs: 60000,
    max: 60,
    message: 'Too many event requests',
  }),
];

export const POST = handler(async (req: HttpRequest) => {
  const { event, shop } = req.body;

  logger.info(`Processing event: ${event} for shop: ${shop}`);

  try {
    if (event === 'APP_INSTALLED') {
      // Save/update shop data using GraphQL handler
      // Using write() for upsert - creates if doesn't exist, updates if exists
      // Data structure matches old saveShop() method from shops.repository.ts
      const shopData = {
        shop,
        // OAuth tokens (will be saved to ES, filtered from query responses)
        accessToken: req.body.accessToken,
        refreshToken: req.body.refreshToken,
        // Installation data
        isActive: true,
        installedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // OAuth scopes
        scopes: req.body.scopes || [],
        // Metadata and locals
        metadata: req.body.metadata || {},
        locals: req.body.locals || {},
      };

      // Use write() for upsert - shop domain is used as document ID in ES
      const savedShop = await graphqlHandler.write('Shop', shopData, { id: shop });
      
      if (!savedShop) {
        logger.error(`Failed to save shop: ${shop}`, { shopData });
        return {
          success: false,
          message: `Failed to save shop data`,
          event,
          shop,
        };
      }

      logger.info(`Shop saved successfully: ${shop}`, { 
        shop: savedShop.shop,
        isActive: savedShop.isActive,
        installedAt: savedShop.installedAt,
      });

      return {
        success: true,
        message: `Shop installed and saved successfully`,
        event,
        shop,
        data: {
          shop: savedShop.shop,
          isActive: savedShop.isActive,
          installedAt: savedShop.installedAt,
        },
      };
    } else if (event === 'APP_UNINSTALLED') {
      // Update shop to mark as uninstalled (matches old uninstallShop() method)
      const updateData = {
        isActive: false,
        uninstalledAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Use write() for upsert - will update if exists
      // Shop domain is used as document ID in ES
      const updatedShop = await graphqlHandler.write('Shop', updateData, { id: shop });

      if (!updatedShop) {
        logger.warn(`Shop not found for uninstall: ${shop}`);
        // Still return success as uninstall event was received
        return {
          success: true,
          message: `Uninstall event processed (shop not found in database)`,
          event,
          shop,
        };
      }

      logger.info(`Shop uninstalled successfully: ${shop}`);

      return {
        success: true,
        message: `Shop uninstalled successfully`,
        event,
        shop,
        data: updatedShop,
      };
    }

    // Unknown event type
    return {
      success: false,
      message: `Unknown event type: ${event}`,
      event,
      shop,
    };
  } catch (error: any) {
    logger.error(`Error processing event: ${event}`, {
      error: error?.message || error,
      stack: error?.stack,
      shop,
    });

    return {
      success: false,
      message: `Error processing event: ${error?.message || 'Unknown error'}`,
      event,
      shop,
    };
  }
});

