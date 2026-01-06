/**
 * Shopify Admin Request Handler
 * Handles Shopify Admin API requests with automatic shop token retrieval
 * Inspired by express handler pattern
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createModuleLogger } from '@shared/utils/logger.util';
import { createAxiosHandler, AxiosHandler } from './axios.handler';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { delay } from '@shared/utils/delay.util';

const logger = createModuleLogger('shopify-admin-handler');

const MAX_RETRIES = Number(process.env.SHOPIFY_API_MAX_RETRIES) || 10;
const BACKOFF_MS = Number(process.env.SHOPIFY_API_BACKOFF_MS) || 500;
const MAX_WAIT_MS = Number(process.env.SHOPIFY_API_MAX_WAIT_MS) || 10000;
const MAX_THROTTLE_RETRIES = Number(process.env.SHOPIFY_API_MAX_THROTTLE_RETRIES) || 50; // Max throttling retries to prevent infinite loop
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

export interface ShopifyAdminHandlerOptions {
  shopsRepository: ShopsRepository;
  maxRetries?: number;
  backoffMs?: number;
  maxWaitMs?: number;
  apiVersion?: string;
}

export interface ShopifyAdminRequestConfig extends Omit<AxiosRequestConfig, 'baseURL' | 'headers'> {
  shop: string;
  query?: string;
  variables?: any;
}

export interface ShopifyAdminResponse<T = any> {
  status: 'success' | 'error';
  data?: T;
  errors?: Array<{ code?: string; message?: string; field?: string }>;
  response?: any;
}

/**
 * Shopify Admin Handler
 * Automatically retrieves shop access token from ES and handles GraphQL/REST requests
 */
export class ShopifyAdminHandler {
  private shopsRepository: ShopsRepository;
  private maxRetries: number;
  private backoffMs: number;
  private maxWaitMs: number;
  private maxThrottleRetries: number;
  private apiVersion: string;

  constructor(options: ShopifyAdminHandlerOptions) {
    this.shopsRepository = options.shopsRepository;
    this.maxRetries = options.maxRetries || MAX_RETRIES;
    this.backoffMs = options.backoffMs || BACKOFF_MS;
    this.maxWaitMs = options.maxWaitMs || MAX_WAIT_MS;
    this.maxThrottleRetries = MAX_THROTTLE_RETRIES;
    this.apiVersion = options.apiVersion || SHOPIFY_API_VERSION;
  }

  /**
   * Create a new Shopify Admin Handler instance
   */
  static create(options: ShopifyAdminHandlerOptions) {
    return new ShopifyAdminHandler(options);
  }
  /**
   * Get shop access token from ES
   */
  private async getShopAccessToken(shop: string): Promise<string> {
    logger.info(`Getting shop access token for: ${shop}`);
    
    try {
      const shopData = await this.shopsRepository.getShop(shop);

      if (!shopData) {
        logger.error(`Shop not found in ES: ${shop}`);
        throw new Error(`Shop not found: ${shop}`);
      }

      logger.info(`Shop found in ES`, {
        shop: shopData.shop,
        hasAccessToken: !!shopData.accessToken,
      });

      if (!shopData.accessToken) {
        logger.error(`Missing access token for shop: ${shop}`);
        throw new Error(`Missing access token for shop: ${shop}`);
      }

      logger.info(`Access token retrieved successfully for: ${shop}`);
      return shopData.accessToken;
    } catch (error: any) {
      logger.error(`Failed to get shop access token`, {
        shop,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Create axios instance for a specific shop
   */
  private async createShopAxiosInstance(shop: string): Promise<AxiosInstance> {
    const accessToken = await this.getShopAccessToken(shop);

    return axios.create({
      baseURL: `https://${shop}/admin/api/${this.apiVersion}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      timeout: 300000, // 5 minutes for bulk operations
    });
  }

  /**
   * Handle Shopify API throttling
   */
  private async handleThrottling(
    cost: any,
    attempt: number,
    retryFn: () => Promise<any>
  ): Promise<any> {
    if (!cost) {
      return retryFn();
    }

    const requested = cost.requestedQueryCost;
    const throttle = cost.throttleStatus;
    const { currentlyAvailable, restoreRate } = throttle;

    if (requested > currentlyAvailable) {
      const waitTime = Math.ceil(
        ((requested - currentlyAvailable) / restoreRate) * this.maxWaitMs
      );

      logger.warn(
        `Shopify throttling hit (attempt ${attempt}). Waiting ${waitTime}ms before retrying...`
      );

      await delay(waitTime);
      return retryFn();
    }

    return retryFn();
  }

  /**
   * Main request handler
   */
  async request<T = any>(
    config: ShopifyAdminRequestConfig
  ): Promise<ShopifyAdminResponse<T>> {
    const { shop, query, variables, ...axiosConfig } = config;

    logger.info(`Making Shopify request`, {
      shop,
      hasQuery: !!query,
      method: axiosConfig.method || (query ? 'POST' : 'GET'),
    });

    try {
      logger.info(`Creating axios instance for shop: ${shop}`);
      const axiosInstance = await this.createShopAxiosInstance(shop);
      logger.info(`Axios instance created successfully`);
      
      let attempt = 0;
      let throttleRetries = 0; // Track throttling retries separately to prevent infinite loops

      while (attempt < this.maxRetries) {
        attempt++;
        
        logger.info(`Request attempt ${attempt}/${this.maxRetries}`, { 
          shop,
          throttleRetries,
        });

        try {
          // Determine endpoint based on whether it's GraphQL or REST
          const endpoint = query ? '/graphql.json' : axiosConfig.url || '';
          const method = axiosConfig.method || (query ? 'POST' : 'GET');

          const requestConfig: AxiosRequestConfig = {
            ...axiosConfig,
            url: endpoint,
            method,
            data: query ? { query, variables } : axiosConfig.data,
            timeout: 300000, // 5 minutes timeout for bulk operations
          };

          logger.info(`Sending ${method} request to ${endpoint}`, {
            shop,
            attempt,
            hasQuery: !!query,
            timeout: requestConfig.timeout,
          });

          const startTime = Date.now();
          const response = await axiosInstance.request<T>(requestConfig);
          const duration = Date.now() - startTime;
          
          logger.info(`Received response`, {
            status: response.status,
            statusText: response.statusText,
            hasData: !!response.data,
            duration: `${duration}ms`,
          });

          // Handle GraphQL response
          if (query && response.data) {
            const data = response.data as any;

            // Check for GraphQL errors
            if (data.errors) {
              return {
                status: 'error',
                errors: data.errors.map((e: any) => ({
                  code: e.extensions?.code || 'GRAPHQL_ERROR',
                  message: e.message,
                  field: e.path?.join('.'),
                })),
                response: response.data,
              };
            }

            // Handle Shopify cost/throttling
            if (data.extensions?.cost) {
              const cost = data.extensions.cost;
              const requested = cost.requestedQueryCost;
              const throttle = cost.throttleStatus;
              const { currentlyAvailable, restoreRate } = throttle;

              if (requested > currentlyAvailable) {
                throttleRetries++;
                
                if (throttleRetries > this.maxThrottleRetries) {
                  logger.error(`Max throttling retries (${this.maxThrottleRetries}) exceeded`);
                  return {
                    status: 'error',
                    errors: [
                      {
                        code: 'THROTTLE_LIMIT_EXCEEDED',
                        message: `Exceeded max throttling retries (${this.maxThrottleRetries}). Shopify API is heavily throttled.`,
                      },
                    ],
                  };
                }

                const waitTime = Math.ceil(
                  ((requested - currentlyAvailable) / restoreRate) * this.maxWaitMs
                );

                logger.warn(
                  `Shopify throttling hit (throttle retry ${throttleRetries}/${this.maxThrottleRetries}, attempt ${attempt}/${this.maxRetries}). Waiting ${waitTime}ms before retrying...`
                );

                // Wait for throttling, then retry with same attempt (throttling doesn't count as failure)
                await delay(waitTime);
                attempt--; // Decrement so next iteration uses same attempt number
                continue;
              }
              
              // Reset throttle counter on successful cost check
              throttleRetries = 0;
            }

            return {
              status: 'success',
              data: data.data || data,
              response: response.data,
            };
          }

          // Handle REST response
          return {
            status: 'success',
            data: response.data,
            response: response.data,
          };
        } catch (error: any) {
          const axiosError = error;
          
          logger.error(`Request error (attempt ${attempt})`, {
            shop,
            error: axiosError?.message || error,
            code: axiosError?.code,
            status: axiosError?.response?.status,
            statusText: axiosError?.response?.statusText,
            data: axiosError?.response?.data,
          });

          // Handle timeout errors
          if (axiosError?.code === 'ECONNABORTED' || axiosError?.message?.includes('timeout')) {
            logger.error(`Request timeout (attempt ${attempt}/${this.maxRetries})`);
            if (attempt < this.maxRetries) {
              const waitTime = Math.min(this.backoffMs * Math.pow(2, attempt - 1), this.maxWaitMs);
              logger.warn(`Retrying after ${waitTime}ms...`);
              await delay(waitTime);
              continue;
            }
            return {
              status: 'error',
              errors: [
                {
                  code: 'TIMEOUT',
                  message: `Request timed out after 300000ms (5 minutes)`,
                },
              ],
            };
          }

          // Handle rate limiting
          if (axiosError.response?.status === 429) {
            const retryAfter = parseInt(
              axiosError.response.headers['retry-after'] || '1'
            );
            const waitTime = Math.min(retryAfter * 1000, this.maxWaitMs);

            logger.warn(
              `Rate limited (attempt ${attempt}/${this.maxRetries}), waiting ${waitTime}ms...`
            );

            if (attempt < this.maxRetries) {
              await delay(waitTime);
              continue;
            }
          }

          // Handle 5xx errors with retry
          if (
            axiosError.response?.status >= 500 &&
            attempt < this.maxRetries
          ) {
            const waitTime = Math.min(this.backoffMs * Math.pow(2, attempt - 1), this.maxWaitMs);
            logger.warn(
              `Server error (attempt ${attempt}/${this.maxRetries}), retrying in ${waitTime}ms...`
            );
            await delay(waitTime);
            continue;
          }

          // Handle network errors (ECONNREFUSED, ENOTFOUND, etc.) with retry
          if (
            (axiosError.code === 'ECONNREFUSED' || 
             axiosError.code === 'ENOTFOUND' || 
             axiosError.code === 'ETIMEDOUT' ||
             axiosError.code === 'ECONNRESET') &&
            attempt < this.maxRetries
          ) {
            const waitTime = Math.min(this.backoffMs * Math.pow(2, attempt - 1), this.maxWaitMs);
            logger.warn(
              `Network error (attempt ${attempt}/${this.maxRetries}): ${axiosError.code}, retrying in ${waitTime}ms...`
            );
            await delay(waitTime);
            continue;
          }

          // Non-retryable error or max retries reached
          logger.error(`Request failed after ${attempt} attempts`, {
            code: axiosError.code,
            status: axiosError.response?.status,
            message: axiosError.message,
          });
          
          return {
            status: 'error',
            errors: [
              {
                code: axiosError.code || 'REQUEST_ERROR',
                message:
                  axiosError.response?.data?.message ||
                  axiosError.message ||
                  'Request failed',
              },
            ],
            response: axiosError.response?.data,
          };
        }
      }

      // Max retries exceeded - this should never be reached if logic is correct
      logger.error(`Max retries (${this.maxRetries}) exceeded for shop: ${shop}`);
      return {
        status: 'error',
        errors: [
          {
            code: 'MAX_RETRIES_EXCEEDED',
            message: `Exceeded max retry attempts (${this.maxRetries})`,
          },
        ],
      };
    } catch (error: any) {
      logger.error('Shopify admin request failed', {
        shop,
        error: error?.message || error,
      });

      return {
        status: 'error',
        errors: [
          {
            code: error?.code || 'SHOP_CLIENT_ERROR',
            message: error?.message || 'Failed to create shop client',
          },
        ],
      };
    }
  }

  /**
   * GraphQL-specific handler (convenience method)
   */
  async graphql<T = any>(
    shop: string,
    query: string,
    variables?: any
  ): Promise<ShopifyAdminResponse<T>> {
    logger.info(`GraphQL request`, { shop, hasVariables: !!variables });
    return this.request<T>({
      shop,
      query,
      variables,
      method: 'POST',
    });
  }
}

