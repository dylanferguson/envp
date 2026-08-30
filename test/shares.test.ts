import { afterEach, describe, expect, it, vi } from "vitest";
import { createShare, getShare, ShareApiError } from "../src/web/shares.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shares client", () => {
  it("createShare posts ciphertext and returns a validated id", async () => {
    const envelope = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "abcdefghijklmnopqrstuv" }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const id = await createShare(envelope, 3600 as never);

    expect(id).toBe("abcdefghijklmnopqrstuv");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/shares?ttl=3600");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/octet-stream" });
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(envelope);
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

    await expect(getShare("abcdefghijklmnopqrstuv")).resolves.toBeNull();
  });

  it("getShare returns ciphertext bytes", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(bytes)),
    );

    await expect(getShare("abcdefghijklmnopqrstuv")).resolves.toEqual(bytes);
  });
});
