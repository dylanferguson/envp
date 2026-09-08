import {
  parseKeyFragment,
  shareIdFromPath,
  type KeyFragment,
  type ShareId,
} from "../../lib/limits.js";
import { importKeyFromFragment, open } from "../../lib/envelope.js";
import { getShare, ShareApiError } from "../../api/shares.js";
import type { OpenState } from "./state.js";

type OpenFailure = Extract<
  OpenState,
  { phase: "gone" | "fetch_error" | "tampered" | "missing_key" | "invalid_link" }
>;

export type OpenFlowProgress = Extract<OpenState, { phase: "loading" | "unlocking" }>;
export type OpenFlowOutcome =
  | OpenFailure
  | { phase: "stale" }
  | { phase: "revealed"; envOutput: string };

type OpenTargetInput = {
  shareId?: ShareId;
  keyFragment?: KeyFragment;
  pathname: string;
  hash: string;
  isManual: boolean;
};

export async function runOpenFlow(
  target: OpenTargetInput,
  isStale: () => boolean,
  onProgress: (progress: OpenFlowProgress) => void,
): Promise<OpenFlowOutcome> {
  if (isStale()) {
    return { phase: "stale" };
  }
  const resolved = resolveShareTarget(
    target.shareId,
    target.keyFragment,
    target.pathname,
    target.hash,
    target.isManual,
  );
  if (!("kind" in resolved)) {
    return resolved;
  }

  onProgress({ phase: "loading" });
  const fetched = await fetchShareEnvelope(resolved.shareId, isStale);
  if (isStale() || fetched.kind === "stale") {
    return { phase: "stale" };
  }
  if (fetched.kind === "missing") {
    return { phase: "gone" };
  }
  if (fetched.kind === "fetch_error") {
    return { phase: "fetch_error", message: fetched.message };
  }

  onProgress({ phase: "unlocking" });
  const decrypted = await decryptShareEnvelope(fetched.envelope, resolved.fragment, isStale);
  if (isStale() || decrypted.kind === "stale") {
    return { phase: "stale" };
  }
  if (decrypted.kind === "revealed") {
    return { phase: "revealed", envOutput: decrypted.envOutput };
  }
  return { phase: "tampered" };
}

function resolveShareTarget(
  shareId: ShareId | undefined,
  keyFragment: KeyFragment | undefined,
  pathname: string,
  hash: string,
  isManual: boolean,
): OpenFailure | { kind: "ready"; shareId: ShareId; fragment: KeyFragment } {
  const id = shareId ?? shareIdFromPath(pathname);
  if (!id) {
    return isManual ? { phase: "invalid_link" } : { phase: "gone" };
  }

  const fragment = keyFragment ?? parseKeyFragment(hash.slice(1)) ?? null;
  if (!fragment) {
    return { phase: "missing_key" };
  }

  return { kind: "ready", shareId: id, fragment };
}

async function fetchShareEnvelope(
  shareId: ShareId,
  isStale: () => boolean,
): Promise<
  | { kind: "envelope"; envelope: Uint8Array }
  | { kind: "missing" }
  | { kind: "fetch_error"; message: string }
  | { kind: "stale" }
> {
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
      return { kind: "fetch_error", message: error.message };
    }
    return { kind: "fetch_error", message: "Request failed" };
  }
}

async function decryptShareEnvelope(
  envelope: Uint8Array,
  fragment: KeyFragment,
  isStale: () => boolean,
): Promise<{ kind: "stale" } | { kind: "tampered" } | { kind: "revealed"; envOutput: string }> {
  try {
    const key = await importKeyFromFragment(fragment);
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
