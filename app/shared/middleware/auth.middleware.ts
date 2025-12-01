import { HttpNextFunction, HttpRequest, HttpResponse } from "@core/http";

export function authMiddleware(req: HttpRequest, res: HttpResponse, next: HttpNextFunction) {
    next();
}
