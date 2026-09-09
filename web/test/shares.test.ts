import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { base64urlEncode } from "../src/lib/envelope.js";
import { parseShareId } from "../src/lib/limits.js";
import { revokeShare, ShareApiError } from "../src/api/shares.js";

const SHARE_ID = parseShareId("01ARZ3NDEKTSV4RRFFQ69G5FAV")!;
const DELETE_TOKEN = base64urlEncode(new Uint8Array(32).fill(0xab));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("revokeShare", () => {
  it("resolves on 204 and 404", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await expect(revokeShare(SHARE_ID, DELETE_TOKEN as never)).resolves.toBeUndefined();
    await expect(revokeShare(SHARE_ID, DELETE_TOKEN as never)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(`/api/v1/shares/${SHARE_ID}`, {
      method: "DELETE",
      headers: { "X-Envp-Delete-Token": DELETE_TOKEN },
    });
  });

  it("throws on other statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 503, statusText: "Service Unavailable" })),
    );
    await expect(revokeShare(SHARE_ID, DELETE_TOKEN as never)).rejects.toBeInstanceOf(
      ShareApiError,
    );
  });
});
