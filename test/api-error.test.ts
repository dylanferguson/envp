import { describe, expect, it } from "vite-plus/test";
import { API_ERROR_CODES, apiErrorBody, parseApiErrorBody } from "../src/shared/api-error.js";

describe("apiErrorBody", () => {
  it("builds stripe-lite error objects", () => {
    expect(apiErrorBody(API_ERROR_CODES.notFound, "Share not found.")).toEqual({
      error: {
        code: "not_found",
        message: "Share not found.",
      },
    });
  });
});

describe("parseApiErrorBody", () => {
  it("parses valid error bodies", () => {
    const body = apiErrorBody(API_ERROR_CODES.rateLimited, "Too many requests.");
    expect(parseApiErrorBody(body)).toEqual(body);
  });

  it("rejects unknown codes and malformed bodies", () => {
    expect(parseApiErrorBody(null)).toBeNull();
    expect(parseApiErrorBody({ error: { code: "nope", message: "x" } })).toBeNull();
    expect(parseApiErrorBody({ error: { code: API_ERROR_CODES.invalidRequest } })).toBeNull();
  });
});
