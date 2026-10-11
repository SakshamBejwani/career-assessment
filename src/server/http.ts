import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ConfigError, getConfig } from "./config";
import { AppError, Errors } from "./errors";
import { logger } from "./observability/logger";

export interface RequestContext {
  req: NextRequest;
  requestId: string;
  ip: string;
}

type RouteParams = { params: Promise<Record<string, string>> };
type Handler<P> = (ctx: RequestContext & { params: P }) => Promise<Response>;

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function errorResponse(error: AppError, requestId: string): NextResponse {
  const headers: Record<string, string> = { "x-request-id": requestId };
  const retryAfter = error.details?.retryAfterSeconds;
  if (typeof retryAfter === "number") headers["retry-after"] = String(retryAfter);
  return NextResponse.json(
    { error: { code: error.code, message: error.message, reference: requestId, ...(error.details ? { details: error.details } : {}) } },
    { status: error.status, headers },
  );
}

/**
 * Wraps a route handler with a correlation ID, consistent error shape and safe logging.
 * Unknown errors never leak details to the client.
 */
export function apiHandler<P extends Record<string, string> = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, route: RouteParams): Promise<Response> => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    const ctx = { req, requestId, ip: clientIp(req) };
    try {
      const params = (route?.params ? await route.params : {}) as P;
      const res = await handler({ ...ctx, params });
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (error) {
      if (error instanceof AppError) {
        if (error.status >= 500) logger.error("request failed", { requestId, path: req.nextUrl.pathname, code: error.code });
        return errorResponse(error, requestId);
      }
      if (error instanceof z.ZodError) {
        return errorResponse(
          Errors.invalid("Some fields need attention.", {
            fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          }),
          requestId,
        );
      }
      if (error instanceof ConfigError) {
        logger.error("configuration error", { requestId, problems: error.problems });
        return errorResponse(new AppError("misconfigured", "The service is not configured correctly.", 503), requestId);
      }
      logger.error("unhandled error", { requestId, path: req.nextUrl.pathname, error });
      return errorResponse(new AppError("internal_error", "Something went wrong on our side. Try again shortly.", 500), requestId);
    }
  };
}

/** CSRF defence for cookie-authenticated, state-changing requests. */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  const allowed = new Set([getConfig().appOrigin, req.nextUrl.origin]);
  if (!origin || !allowed.has(origin)) {
    throw Errors.forbidden("This request must come from the assessment site.");
  }
}

export async function readJson<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.invalid("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
