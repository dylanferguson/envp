import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { base64urlEncode } from "../src/lib/envelope.js";
import { parseShareId } from "../src/lib/limits.js";
import { runShareFlow } from "../src/pages/create/flow.js";

const SHARE_ID = parseShareId("01ARZ3NDEKTSV4RRFFQ69G5FAV")!;
const DELETE_TOKEN = base64urlEncode(new Uint8Array(32).fill(0xab));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runShareFlow", () => {
  it("builds a share URL without the delete token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: SHARE_ID,
          expires_at: Date.now() + 60_000,
          max_reads: 5,
          delete_token: DELETE_TOKEN,
        }),
      ),
    );
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const origin = "https://envp.example";
    const result = await runShareFlow("API_KEY=test\n", 3600 as never, 5 as never, origin);
    expect(result).toMatchObject({
      phase: "done",
      shareId: SHARE_ID,
      copied: true,
      maxReads: 5,
      deleteToken: DELETE_TOKEN,
      revoke: { phase: "idle" },
    });
    if (result.phase !== "done") {
      throw new Error("expected done");
    }
    expect(result.url).toMatch(new RegExp(`^${origin}/share/${SHARE_ID}#[A-Za-z0-9_-]{43}$`));
    expect(result.url).not.toContain(DELETE_TOKEN);
  });
});
