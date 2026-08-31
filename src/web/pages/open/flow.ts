import { parseKeyFragment, parseShareId } from "../../../shared/limits.js";
import { importKeyFromFragment, open } from "../../../shared/envelope.js";
import { getShare, ShareApiError } from "../../api/shares.js";
import type { OpenState } from "./state.js";

export function resolveShareTarget(
  shareId: string | undefined,
  keyFragment: string | undefined,
  pathname: string,
  hash: string,
  isManual: boolean,
): OpenState | { kind: "ready"; shareId: string; fragment: string } {
  const rawId = shareId ?? shareIdFromPath(pathname);
  if (!rawId || !parseShareId(rawId)) {
    return isManual ? { phase: "invalid_link" } : { phase: "gone" };
  }

  const fragment = keyFragment ?? parseKeyFragment(hash.slice(1)) ?? null;
  if (!fragment) {
    return { phase: "missing_key" };
  }

  return { kind: "ready", shareId: rawId, fragment };
}

export function shareIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/s\/([^/]+)$/);
  return match?.[1] ?? null;
}

export type DecryptOutcome =
  | { kind: "stale" }
  | { kind: "gone" }
  | { kind: "tampered" }
  | { kind: "revealed"; envOutput: string };

export type FetchShareOutcome =
  | { kind: "envelope"; envelope: Uint8Array }
  | { kind: "missing" }
  | { kind: "http_error"; message: string }
  | { kind: "stale" };

export async function fetchShareEnvelope(
  shareId: string,
  isStale: () => boolean,
): Promise<FetchShareOutcome> {
  try {
    const envelope = await getShare(shareId);
    if (isStale()) {
      return { kind: "stale" };
    }
    if (!envelope) {
      return { kind: "missing" };
    }
    return { kind: "envelope", envelope };
  } catch (error) {
    if (isStale()) {
      return { kind: "stale" };
    }
    if (error instanceof ShareApiError) {
      return { kind: "http_error", message: error.message };
    }
    throw error;
  }
}

export async function decryptShareEnvelope(
  envelope: Uint8Array,
  fragment: string,
  isStale: () => boolean,
): Promise<DecryptOutcome> {
  try {
    const key = await importKeyFromFragment(fragment as never);
    const plaintext = await open(envelope, key);
    if (isStale()) {
      return { kind: "stale" };
    }
    return {
      kind: "revealed",
      envOutput: new TextDecoder().decode(plaintext),
    };
  } catch {
    if (isStale()) {
      return { kind: "stale" };
    }
    return { kind: "tampered" };
  }
}
