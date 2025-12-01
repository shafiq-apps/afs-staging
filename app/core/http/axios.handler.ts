/**
 * Axios Request Handler
 * Reusable handler pattern for axios requests, similar to express handler pattern
 * Provides consistent error handling and response transformation
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('axios-handler');

export interface AxiosHandlerOptions {
  transformResponse?: <T>(response: AxiosResponse<T>) => any;
  transformError?: (error: AxiosError) => any;
  onSuccess?: <T>(response: AxiosResponse<T>) => void;
  onError?: (error: AxiosError) => void;
}

export type AxiosHandler<T = any> = (
  config: AxiosRequestConfig
) => Promise<{ status: 'success' | 'error'; data?: T; error?: any; response?: AxiosResponse<T> }>;

/**
 * Create an axios handler with consistent error handling
 * Similar to express handler pattern
 */
export function createAxiosHandler(
  axiosInstance: AxiosInstance,
  options: AxiosHandlerOptions = {}
): AxiosHandler {
  return async <T = any>(config: AxiosRequestConfig): Promise<{
    status: 'success' | 'error';
    data?: T;
    error?: any;
    response?: AxiosResponse<T>;
  }> => {
    try {
      const response = await axiosInstance.request<T>(config);

      // Transform response if provided
      const data = options.transformResponse
        ? options.transformResponse(response) as T
        : response.data as T;

      // Call success callback if provided
      if (options.onSuccess) {
        options.onSuccess(response);
      }

      return {
        status: 'success',
        data,
        response,
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;

      // Transform error if provided
      const transformedError = options.transformError
        ? options.transformError(axiosError)
        : {
            message: axiosError.message,
            code: axiosError.code,
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            data: axiosError.response?.data,
          };

      // Call error callback if provided
      if (options.onError) {
        options.onError(axiosError);
      }

      logger.error('Axios request failed', {
        url: config.url,
        method: config.method,
        error: transformedError,
      });

      return {
        status: 'error',
        error: transformedError,
        response: axiosError.response as AxiosResponse<T> | undefined,
      };
    }
  };
}

/**
 * Create a default axios handler with standard configuration
 */
export function createDefaultAxiosHandler(baseURL?: string, defaultHeaders?: Record<string, string>): AxiosHandler {
  const axiosInstance = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      ...defaultHeaders,
    },
    timeout: 30000,
  });

  return createAxiosHandler(axiosInstance);
}

