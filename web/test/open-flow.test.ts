import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parseShareId } from "../src/lib/limits.js";
import { base64urlEncode, exportKeyFragment, generateKey, seal } from "../src/lib/envelope.js";
import { fetchShareEnvelope, runOpenFlow, type OpenFlowProgress } from "../src/pages/open/flow.js";

const SHARE_ID = parseShareId("01ARZ3NDEKTSV4RRFFQ69G5FAV")!;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sealedShare() {
  const id = SHARE_ID;
  const key = await generateKey();
  const fragment = await exportKeyFragment(key);
  const plaintext = "API_KEY=test-secret\nNAME=café\n";
  const envelope = await seal(new TextEncoder().encode(plaintext), key);
  return {
    id,
    fragment,
    plaintext,
    target: { pathname: `/share/${id}`, hash: `#${fragment}`, isManual: false },
    response: () =>
      Response.json({
        id,
        expires_at: Date.now() + 60_000,
        envelope: base64urlEncode(envelope),
      }),
  };
}

describe("runOpenFlow", () => {
  it.each([false, true])("decrypts a share and reports progress (manual: %s)", async (isManual) => {
    const share = await sealedShare();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(share.response()));
    const progress: OpenFlowProgress[] = [];
    const target = isManual
      ? { shareId: share.id, keyFragment: share.fragment, pathname: "/open", hash: "", isManual }
      : share.target;

    await expect(
      runOpenFlow(
        target,
        () => false,
        (state) => progress.push(state),
      ),
    ).resolves.toEqual({
      phase: "revealed",
      envOutput: share.plaintext,
    });
    expect(progress).toEqual([{ phase: "loading" }, { phase: "unlocking" }]);
  });

  it("rejects a missing key before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const target = { pathname: `/share/${SHARE_ID}`, hash: "", isManual: false };
    await expect(runOpenFlow(target, () => false, vi.fn())).resolves.toEqual({
      phase: "missing_key",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a missing share to the not-found state", async () => {
    const share = await sealedShare();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const progress: OpenFlowProgress[] = [];
    await expect(
      runOpenFlow(
        share.target,
        () => false,
        (state) => progress.push(state),
      ),
    ).resolves.toEqual({
      phase: "gone",
    });
    expect(progress).toEqual([{ phase: "loading" }]);
  });

  it("maps a failed request to the error state", async () => {
    const share = await sealedShare();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(runOpenFlow(share.target, () => false, vi.fn())).resolves.toEqual({
      phase: "fetch_error",
      message: "Request failed",
    });
  });

  it("reports a wrong key without revealing plaintext", async () => {
    const share = await sealedShare();
    const wrongFragment = await exportKeyFragment(await generateKey());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(share.response()));
    await expect(
      runOpenFlow({ ...share.target, hash: `#${wrongFragment}` }, () => false, vi.fn()),
    ).resolves.toEqual({
      phase: "tampered",
    });
  });

  it("does not start decryption after a pending request becomes stale", async () => {
    const share = await sealedShare();
    let resolveRequest!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
    let stale = false;
    const progress: OpenFlowProgress[] = [];
    const result = runOpenFlow(
      share.target,
      () => stale,
      (state) => progress.push(state),
    );
    stale = true;
    resolveRequest(share.response());
    await expect(result).resolves.toEqual({ phase: "stale" });
    expect(progress).toEqual([{ phase: "loading" }]);
  });

  it("discards plaintext if the operation becomes stale during decryption", async () => {
    const share = await sealedShare();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(share.response()));
    let stale = false;
    await expect(
      runOpenFlow(
        share.target,
        () => stale,
        (state) => {
          if (state.phase === "unlocking") stale = true;
        },
      ),
    ).resolves.toEqual({ phase: "stale" });
  });
});

describe("fetchShareEnvelope", () => {
  it("returns a displayable error when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchShareEnvelope(SHARE_ID, () => false)).resolves.toEqual({
      kind: "fetch_error",
      message: "Request failed",
    });
  });

  it("preserves the HTTP status when the server rejects a request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 503, statusText: "Service Unavailable" })),
    );

    await expect(fetchShareEnvelope(SHARE_ID, () => false)).resolves.toEqual({
      kind: "fetch_error",
      message: "503 Service Unavailable",
    });
  });

  it("ignores a network failure from a stale request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchShareEnvelope(SHARE_ID, () => true)).resolves.toEqual({
      kind: "stale",
    });
  });
});
