import { describe, expect, it } from "vite-plus/test";
import { base64urlEncode } from "../src/lib/envelope.js";
import { parseDeleteToken, parseShareId, type ShareId } from "../src/lib/limits.js";
import {
  applyRevokeResult,
  type CreateState,
  type RevokeState,
} from "../src/pages/create/state.js";

const SHARE_A = parseShareId("01ARZ3NDEKTSV4RRFFQ69G5FAV")!;
const SHARE_B = parseShareId("01ARZ3NDEKTSV4RRFFQ69G5FAW")!;
const DELETE_TOKEN = parseDeleteToken(base64urlEncode(new Uint8Array(32).fill(0xab)))!;

function done(shareId: ShareId, revoke: RevokeState): CreateState {
  return {
    phase: "done",
    shareId,
    url: `https://envp.example/share/${shareId}#key`,
    copied: true,
    expiresAt: 1,
    maxReads: 1,
    deleteToken: DELETE_TOKEN,
    revoke,
  };
}

describe("applyRevokeResult", () => {
  it("ignores a revoke result for a share that is no longer on screen", () => {
    const later = done(SHARE_B, { phase: "idle" });
    expect(applyRevokeResult(later, SHARE_A, { phase: "revoked" })).toBe(later);
  });

  it("marks the matching share revoked", () => {
    const current = done(SHARE_A, { phase: "revoking" });
    expect(applyRevokeResult(current, SHARE_A, { phase: "revoked" })).toEqual({
      ...current,
      revoke: { phase: "revoked" },
    });
  });
});
