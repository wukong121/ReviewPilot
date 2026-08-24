import { randomUUID } from "node:crypto";

interface HttpError extends Error {
  status?: number;
}

export function errorResponse(error: unknown): Response {
  const correlationId = randomUUID();
  const status = error instanceof Error && "status" in error
    ? (error as HttpError).status ?? 500
    : error instanceof Error && /required|must be|exceeds|unknown question/.test(error.message)
      ? 400
      : error instanceof Error && /changed|no longer editable/.test(error.message)
        ? 409
        : 500;

  return Response.json({
    error: status === 500 ? "internal_error" : error instanceof Error ? error.message : "request_failed",
    correlationId,
  }, { status });
}
