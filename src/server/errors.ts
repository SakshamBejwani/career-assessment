import "server-only";

/** An error that is safe to show to the caller. Everything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  notFound: (what = "Resource") => new AppError("not_found", `${what} not found.`, 404),
  forbidden: (message = "You don't have access to this.") => new AppError("forbidden", message, 403),
  unauthorized: (message = "Sign in to continue.") => new AppError("unauthorized", message, 401),
  conflict: (code: string, message: string, details?: Record<string, unknown>) => new AppError(code, message, 409, details),
  invalid: (message: string, details?: Record<string, unknown>) => new AppError("invalid_request", message, 422, details),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError("rate_limited", "Too many requests. Wait a moment and try again.", 429, { retryAfterSeconds }),
  unavailable: (message: string) => new AppError("unavailable", message, 503),
};
