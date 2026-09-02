import { EnvelopeError, exportKeyFragment, generateKey, seal } from "../../../shared/envelope.js";
import { MAX_PLAINTEXT_BYTES } from "../../../shared/limits.js";
import { ShareApiError, createShare } from "../../api/shares.js";
import type { CreateState } from "./state.js";

export type ShareFlowOutcome =
  | { kind: "over_limit" }
  | { kind: "done"; url: string; copied: boolean; expiresAt: number }
  | { kind: "error"; at: "encrypt" | "send" | "link"; message: string };

export type ShareFlowProgress = { phase: "encrypting" } | { phase: "uploading"; bytes: number };

export async function runShareFlow(
  envInput: string,
  ttlSeconds: number,
  origin: string,
  onProgress?: (progress: ShareFlowProgress) => void,
): Promise<ShareFlowOutcome> {
  const encoded = new TextEncoder().encode(envInput);
  if (encoded.length > MAX_PLAINTEXT_BYTES) {
    return { kind: "over_limit" };
  }

  onProgress?.({ phase: "encrypting" });
  let at: "encrypt" | "send" | "link" = "encrypt";
  try {
    const key = await generateKey();
    const envelope = await seal(encoded, key);
    const fragment = await exportKeyFragment(key);

    at = "send";
    onProgress?.({ phase: "uploading", bytes: envelope.length });
    const created = await createShare(envelope, ttlSeconds as never);
    const url = `${origin}/share/${created.id}#${fragment}`;
    at = "link";

    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }

    return {
      kind: "done",
      url,
      copied,
      expiresAt: created.expiresAt,
    };
  } catch (error) {
    if (error instanceof EnvelopeError) {
      return { kind: "error", at: "encrypt", message: "Encryption failed" };
    }
    if (error instanceof ShareApiError) {
      return { kind: "error", at: "send", message: error.message };
    }
    return { kind: "error", at, message: "Something went wrong" };
  }
}

export function applyShareOutcome(outcome: ShareFlowOutcome): CreateState {
  if (outcome.kind === "over_limit") {
    return { phase: "idle" };
  }
  if (outcome.kind === "done") {
    return {
      phase: "done",
      url: outcome.url,
      copied: outcome.copied,
      expiresAt: outcome.expiresAt,
    };
  }
  return { phase: "error", at: outcome.at, message: outcome.message };
}

export function applyShareProgress(progress: ShareFlowProgress): CreateState {
  if (progress.phase === "encrypting") {
    return { phase: "encrypting" };
  }
  return { phase: "uploading", bytes: progress.bytes };
}
