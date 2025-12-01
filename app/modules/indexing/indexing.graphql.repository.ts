/**
 * GraphQL Repository for Shopify
 * Handles GraphQL requests to Shopify Admin API
 * Uses ShopifyAdminHandler for automatic token retrieval
 */

import { ShopifyAdminHandler } from '@core/http/shopify-admin.handler';
import type { ShopsRepository } from '@modules/shops/shops.repository';

export interface GraphQLResponse<T = any> {
  status: string;
  data?: T;
  errors?: Array<{ code?: string; message?: string; field?: string }>;
}

export class ShopifyGraphQLRepository {
  private handler: ReturnType<typeof ShopifyAdminHandler.create>;

  constructor(shopsRepository: ShopsRepository) {
    this.handler = ShopifyAdminHandler.create({ shopsRepository });
  }

  async post<T>(
    shop: string,
    { query, variables }: { query: string; variables?: any }
  ): Promise<GraphQLResponse<T>> {
    const response = await this.handler.graphql<T>(shop, query, variables);

    return {
      status: response.status,
      data: response.data,
      errors: response.errors,
    };
  }
}

