import { afterEach, describe, expect, it, vi } from "vitest";
import { API_V1_SHARES } from "../src/shared/api.js";
import { base64urlEncode } from "../src/shared/envelope.js";
import { createShare, getShare, ShareApiError } from "../src/web/api/shares.js";

const TEST_SHARE_ID = "share_abcdefghijklmnopqrstuv";
const EXPIRES_AT = 1_735_689_600_000;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shares client", () => {
  it("createShare posts JSON and returns id with expiresAt", async () => {
    const envelope = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: TEST_SHARE_ID, expires_at: EXPIRES_AT }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const created = await createShare(envelope, 3600 as never);

    expect(created).toEqual({ id: TEST_SHARE_ID, expiresAt: EXPIRES_AT });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(API_V1_SHARES);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      ttl_seconds: 3600,
      envelope: base64urlEncode(envelope),
    });
  });

  it("createShare throws ShareApiError on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );

    await expect(createShare(new Uint8Array([1]), 3600 as never)).rejects.toEqual(
      expect.objectContaining({ status: 403 }),
    );
    await expect(createShare(new Uint8Array([1]), 3600 as never)).rejects.toBeInstanceOf(
      ShareApiError,
    );
  });

  it("createShare throws ShareApiError on invalid response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "bad" }), { status: 201 })),
    );

    await expect(createShare(new Uint8Array([1]), 3600 as never)).rejects.toEqual(
      expect.objectContaining({ status: 0 }),
    );
  });

  it("getShare returns null when the share is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    await expect(getShare(TEST_SHARE_ID)).resolves.toBeNull();
  });

  it("getShare returns ciphertext bytes", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: TEST_SHARE_ID,
            expires_at: EXPIRES_AT,
            envelope: base64urlEncode(bytes),
          }),
        ),
      ),
    );

    await expect(getShare(TEST_SHARE_ID)).resolves.toEqual(bytes);
  });
});
