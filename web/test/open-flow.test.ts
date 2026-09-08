import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parseShareId } from "../src/lib/limits.js";
import { base64urlEncode, exportKeyFragment, generateKey, seal } from "../src/lib/envelope.js";
import { runOpenFlow, type OpenFlowProgress } from "../src/pages/open/flow.js";

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
  it("decrypts a share from the path and hash", async () => {
    const share = await sealedShare();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(share.response()));
    const progress: OpenFlowProgress[] = [];
    await expect(
      runOpenFlow(
        share.target,
        () => false,
        (state) => progress.push(state),
      ),
    ).resolves.toEqual({
      phase: "revealed",
      envOutput: share.plaintext,
    });
    expect(progress).toEqual([{ phase: "loading" }, { phase: "unlocking" }]);
  });

  it("does not fetch when the key is missing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      runOpenFlow(
        { pathname: `/share/${SHARE_ID}`, hash: "", isManual: false },
        () => false,
        vi.fn(),
      ),
    ).resolves.toEqual({ phase: "missing_key" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps 404 to gone", async () => {
    const share = await sealedShare();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(runOpenFlow(share.target, () => false, vi.fn())).resolves.toEqual({
      phase: "gone",
    });
  });

  it("surfaces a server error status", async () => {
    const share = await sealedShare();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 503, statusText: "Service Unavailable" })),
    );
    await expect(runOpenFlow(share.target, () => false, vi.fn())).resolves.toEqual({
      phase: "fetch_error",
      message: "503 Service Unavailable",
    });
  });

  it("maps a wrong key to tampered", async () => {
    const share = await sealedShare();
    const wrongFragment = await exportKeyFragment(await generateKey());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(share.response()));
    await expect(
      runOpenFlow({ ...share.target, hash: `#${wrongFragment}` }, () => false, vi.fn()),
    ).resolves.toEqual({ phase: "tampered" });
  });

  it("drops a late response after the user navigates away", async () => {
    const share = await sealedShare();
    let resolveRequest!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
    let stale = false;
    const result = runOpenFlow(share.target, () => stale, vi.fn());
    stale = true;
    resolveRequest(share.response());
    await expect(result).resolves.toEqual({ phase: "stale" });
  });
});
