/**
 * HTTP Types
 * Shared HTTP types for the framework
 */

import { Request, Response, NextFunction } from 'express';

export type HttpHandler = (req: Request, res: Response, next?: NextFunction) => Promise<any> | any;

export type RouteModule = {
  GET?: HttpHandler;
  POST?: HttpHandler;
  PUT?: HttpHandler;
  PATCH?: HttpHandler;
  DELETE?: HttpHandler;
  middleware?: HttpHandler[];
};

export type HttpMiddleware = HttpHandler;

export type HttpRequest = Request;
export type HttpResponse = Response;
export type HttpNextFunction = NextFunction;

