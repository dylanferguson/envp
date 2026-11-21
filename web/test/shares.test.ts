import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ShareApiError, createShare, getShare } from "../src/api/shares.js";
import { base64urlEncode } from "../src/lib/bytes.js";
import {
  MAX_ENVELOPE_BYTES,
  parseMaxReads,
  parseShareId,
  parseTtlSeconds,
} from "../src/lib/limits.js";

const SHARE_ID = parseShareId("01ARZ3NDEKTSV4RRFFQ69G5FAV")!;
const TTL = parseTtlSeconds("3600")!;
const MAX_READS = parseMaxReads(5)!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createShare", () => {
  it("posts base64url envelope and parses response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { id: SHARE_ID, expires_at: 1_700_000_000_000, max_reads: 5 },
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await createShare(new Uint8Array([1, 2, 3]), TTL, MAX_READS);
    expect(res).toEqual({ id: SHARE_ID, expiresAt: 1_700_000_000_000, maxReads: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/shares",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ShareApiError on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 429, statusText: "Too Many Requests" })),
    );
    await expect(createShare(new Uint8Array([1]), TTL, MAX_READS)).rejects.toThrow(
      "429 Too Many Requests",
    );
  });

  it("throws ShareApiError on non-JSON or malformed 201 body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 201 })),
    );
    await expect(createShare(new Uint8Array([1]), TTL, MAX_READS)).rejects.toBeInstanceOf(
      ShareApiError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "bad" }, { status: 201 })),
    );
    await expect(createShare(new Uint8Array([1]), TTL, MAX_READS)).rejects.toBeInstanceOf(
      ShareApiError,
    );
  });
});

describe("getShare", () => {
  it("returns null on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(getShare(SHARE_ID)).resolves.toBeNull();
  });

  it("returns decoded envelope bytes on 200", async () => {
    const payload = new Uint8Array([10, 20, 30]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: SHARE_ID,
          expires_at: 1_700_000_000_000,
          envelope: base64urlEncode(payload),
        }),
      ),
    );
    await expect(getShare(SHARE_ID)).resolves.toEqual(payload);
  });

  it("throws ShareApiError instead of returning null on corrupt 200 responses", async () => {
    const corruptResponses = [
      () => new Response("<html>proxy page</html>", { status: 200 }),
      () => Response.json({ id: SHARE_ID, expires_at: 1_700_000_000_000, envelope: "" }),
      () => Response.json({ id: SHARE_ID, expires_at: 1_700_000_000_000, envelope: "!!!" }),
      () =>
        Response.json({
          id: SHARE_ID,
          expires_at: 1_700_000_000_000,
          envelope: base64urlEncode(new Uint8Array(MAX_ENVELOPE_BYTES + 1)),
        }),
    ];
    for (const makeResponse of corruptResponses) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse()));
      await expect(getShare(SHARE_ID)).rejects.toBeInstanceOf(ShareApiError);
    }
  });
});
