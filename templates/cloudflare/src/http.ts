type ErrorDetail = {
  code: string;
  message: string;
};

export function jsonResponse(status: number, body: unknown, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body) + "\n", { status, headers });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  method = "GET",
): Response {
  if (method === "HEAD") {
    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(null, { status, headers });
  }
  const body: { error: ErrorDetail } = { error: { code, message } };
  return jsonResponse(status, body);
}

export const errInvalidRequest = (method?: string) =>
  errorResponse(400, "invalid_request", "The request could not be processed.", method);
export const errForbidden = (method?: string) =>
  errorResponse(403, "forbidden", "The request origin is not allowed.", method);
export const errNotFound = (method?: string) =>
  errorResponse(404, "not_found", "Not found.", method);
export const errShareNotFound = (method?: string) =>
  errorResponse(404, "not_found", "Share not found.", method);
export const errPayloadTooLarge = (method?: string) =>
  errorResponse(413, "payload_too_large", "Request body is too large.", method);
export const errInternal = (method?: string) =>
  errorResponse(500, "internal_error", "The request could not be processed.", method);
