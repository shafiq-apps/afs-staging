/**
 * HTTP Framework
 * Framework-level HTTP utilities and middleware
 */

export { handler } from './http.handler';
export type { HttpHandler } from './http.handler';
export { HttpRequest, HttpResponse, HttpNextFunction, RouteModule } from './http.types';
export { HttpError, errorHandler } from './http.errors';
export { loadRoutes } from '@core/router/router';
export { compressionMiddleware, fastCompressionMiddleware, maxCompressionMiddleware } from './compression.middleware';
export { validate, validateShopDomain } from './validation.middleware';
export { ValidationSchema, ValidationResult, FieldValidation } from './validation.schema';
export { validateRequest } from './validation.validator';
export { HttpClient, httpClient, http, HttpResponse as HttpClientResponse, HttpError as HttpClientError } from './http.client';

