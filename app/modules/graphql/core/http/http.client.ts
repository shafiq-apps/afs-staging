/**
 * HTTP Client Wrapper
 * Framework-level HTTP client with retry logic, timeout handling, and error transformation
 */

import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('http-client');
import { delay } from '@shared/utils/delay.util';

export interface HttpClientOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  retryableStatusCodes?: number[];
  retryableErrors?: string[];
  headers?: Record<string, string>;
}

export interface HttpResponse<T = any> {
  status: number;
  statusText: string;
  data: T;
  headers: Record<string, string>;
}

export interface HttpError extends Error {
  status?: number;
  statusText?: string;
  response?: any;
}

const DEFAULT_OPTIONS: Required<Omit<HttpClientOptions, 'headers'>> & { headers?: Record<string, string> } = {
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatusCodes: [500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
};

function isRetryableError(error: any, options: HttpClientOptions): boolean {
  if (error.status && options.retryableStatusCodes?.includes(error.status)) {
    return true;
  }

  if (error.code && options.retryableErrors?.includes(error.code)) {
    return true;
  }

  if (error.message) {
    for (const retryableError of options.retryableErrors || []) {
      if (error.message.includes(retryableError)) {
        return true;
      }
    }
  }

  return false;
}

function createHttpError(message: string, status?: number, statusText?: string, response?: any): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  error.statusText = statusText;
  error.response = response;
  return error;
}

export class HttpClient {
  private options: HttpClientOptions;

  constructor(options: HttpClientOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private async executeWithRetry<T>(
    requestFn: () => Promise<Response>,
    attempt: number = 1
  ): Promise<HttpResponse<T>> {
    try {
      const response = await requestFn();

      const contentType = response.headers.get('content-type') || '';
      let data: T;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = (await response.text()) as any;
      }

      if (!response.ok) {
        const error = createHttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          data
        );

        if (isRetryableError(error, this.options) && attempt < (this.options.maxRetries || 3)) {
          const delayMs = (this.options.retryDelay || 1000) * attempt;
          logger.warn(
            `Request failed (attempt ${attempt}/${this.options.maxRetries}), retrying in ${delayMs}ms:`,
            error.message
          );
          await delay(delayMs);
          return this.executeWithRetry(requestFn, attempt + 1);
        }

        throw error;
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        data,
        headers,
      };
    } catch (error: any) {
      if (isRetryableError(error, this.options) && attempt < (this.options.maxRetries || 3)) {
        const delayMs = (this.options.retryDelay || 1000) * attempt;
        logger.warn(
          `Request error (attempt ${attempt}/${this.options.maxRetries}), retrying in ${delayMs}ms:`,
          error.message
        );
        await delay(delayMs);
        return this.executeWithRetry(requestFn, attempt + 1);
      }

      if (error.status) {
        throw error;
      }

      throw createHttpError(
        error.message || 'Request failed',
        undefined,
        undefined,
        error
      );
    }
  }

  async get<T = any>(url: string, options: RequestInit = {}): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const requestFn = () =>
        fetch(url, {
          ...options,
          method: 'GET',
          headers: {
            ...this.options.headers,
            ...(options.headers as Record<string, string>),
          },
          signal: controller.signal,
        });

      return await this.executeWithRetry<T>(requestFn);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async post<T = any>(url: string, data?: any, options: RequestInit = {}): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const requestFn = () =>
        fetch(url, {
          ...options,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.options.headers,
            ...(options.headers as Record<string, string>),
          },
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal,
        });

      return await this.executeWithRetry<T>(requestFn);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async put<T = any>(url: string, data?: any, options: RequestInit = {}): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const requestFn = () =>
        fetch(url, {
          ...options,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...this.options.headers,
            ...(options.headers as Record<string, string>),
          },
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal,
        });

      return await this.executeWithRetry<T>(requestFn);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async patch<T = any>(url: string, data?: any, options: RequestInit = {}): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const requestFn = () =>
        fetch(url, {
          ...options,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...this.options.headers,
            ...(options.headers as Record<string, string>),
          },
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal,
        });

      return await this.executeWithRetry<T>(requestFn);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async delete<T = any>(url: string, options: RequestInit = {}): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const requestFn = () =>
        fetch(url, {
          ...options,
          method: 'DELETE',
          headers: {
            ...this.options.headers,
            ...(options.headers as Record<string, string>),
          },
          signal: controller.signal,
        });

      return await this.executeWithRetry<T>(requestFn);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const httpClient = new HttpClient();

export const http = {
  get: <T = any>(url: string, options?: RequestInit) => httpClient.get<T>(url, options),
  post: <T = any>(url: string, data?: any, options?: RequestInit) => httpClient.post<T>(url, data, options),
  put: <T = any>(url: string, data?: any, options?: RequestInit) => httpClient.put<T>(url, data, options),
  patch: <T = any>(url: string, data?: any, options?: RequestInit) => httpClient.patch<T>(url, data, options),
  delete: <T = any>(url: string, options?: RequestInit) => httpClient.delete<T>(url, options),
};

