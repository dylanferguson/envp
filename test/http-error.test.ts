import { describe, expect, it } from "vite-plus/test";
import { formatHttpError } from "../src/web/lib/http-error.js";

describe("formatHttpError", () => {
  it("includes status and reason when both are present", () => {
    expect(formatHttpError(429, "Too Many Requests")).toBe("429 Too Many Requests");
  });

  it("falls back to status only when reason is empty", () => {
    expect(formatHttpError(500, "")).toBe("500");
  });

  it("falls back when status is zero", () => {
    expect(formatHttpError(0, "Bad Gateway")).toBe("Request failed");
  });
});
