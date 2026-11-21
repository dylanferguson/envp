import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { base64urlDecode, importKeyFromFragment, open } from "../src/lib/envelope.js";
import {
  MAX_PLAINTEXT_BYTES,
  parseMaxReads,
  parseShareId,
  parseShareLink,
  parseTtlSeconds,
} from "../src/lib/limits.js";
import { runShareFlow } from "../src/pages/create/flow.js";
import type { CreateState } from "../src/pages/create/state.js";

const SHARE_ID = parseShareId("01ARZ3NDEKTSV4RRFFQ69G5FAV")!;
const TTL = parseTtlSeconds("3600")!;
const MAX_READS = parseMaxReads(5)!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runShareFlow", () => {
  it("returns over_limit without calling fetch when plaintext exceeds max bytes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await runShareFlow(
      "a".repeat(MAX_PLAINTEXT_BYTES + 1),
      TTL,
      MAX_READS,
      "https://envp.example",
    );
    expect(outcome).toEqual({ phase: "over_limit" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("seals, uploads, copies the link, and returns a decryptable share URL", async () => {
    let uploadedEnvelope = "";
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      expect(typeof init.body).toBe("string");
      const body = JSON.parse(init.body as string) as {
        ttl_seconds: number;
        max_reads: number;
        envelope: string;
      };
      expect(body.ttl_seconds).toBe(3600);
      expect(body.max_reads).toBe(5);
      uploadedEnvelope = body.envelope;
      return Response.json(
        { id: SHARE_ID, expires_at: 1_700_000_000_000, max_reads: 5 },
        { status: 201 },
      );
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const progress: CreateState["phase"][] = [];
    const plaintext = "SECRET=hello-world\n";
    const outcome = await runShareFlow(plaintext, TTL, MAX_READS, "https://envp.example", (s) =>
      progress.push(s.phase),
    );

    expect(progress).toEqual(["encrypting", "uploading"]);
    expect(outcome.phase).toBe("done");
    if (outcome.phase !== "done") {
      return;
    }
    expect(outcome.copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith(outcome.url);

    const parsed = parseShareLink(outcome.url);
    expect(parsed?.shareId).toBe(SHARE_ID);
    const key = await importKeyFromFragment(parsed!.keyFragment);
    const opened = await open(base64urlDecode(uploadedEnvelope), key);
    expect(new TextDecoder().decode(opened)).toBe(plaintext);
  });

  it("still completes when clipboard write fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { id: SHARE_ID, expires_at: 1_700_000_000_000, max_reads: 5 },
            { status: 201 },
          ),
        ),
    );
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    const outcome = await runShareFlow("A=1", TTL, MAX_READS, "https://envp.example");
    expect(outcome).toMatchObject({ phase: "done", copied: false });
  });

  it("maps API errors to send errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 503, statusText: "Service Unavailable" })),
    );
    const outcome = await runShareFlow("A=1", TTL, MAX_READS, "https://envp.example");
    expect(outcome).toEqual({
      phase: "error",
      at: "send",
      message: "503 Service Unavailable",
    });
  });
});
