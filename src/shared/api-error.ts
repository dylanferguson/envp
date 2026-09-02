export const API_ERROR_CODES = {
  invalidRequest: "invalid_request",
  forbidden: "forbidden",
  notFound: "not_found",
  payloadTooLarge: "payload_too_large",
  rateLimited: "rate_limited",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

export const API_ERROR_MESSAGES = {
  invalidRequest: "The request could not be processed.",
  forbidden: "The request origin is not allowed.",
  notFound: "Share not found.",
  payloadTooLarge: "Request body is too large.",
  rateLimited: "Too many requests. Try again later.",
} as const;

export function apiErrorBody(code: ApiErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function parseApiErrorBody(body: unknown): ApiErrorBody | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  if (!("error" in body) || typeof body.error !== "object" || body.error === null) {
    return null;
  }
  const { code, message } = body.error as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }
  if (!Object.values(API_ERROR_CODES).includes(code as ApiErrorCode)) {
    return null;
  }
  return { error: { code: code as ApiErrorCode, message } };
}
