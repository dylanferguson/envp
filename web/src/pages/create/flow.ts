import { EnvelopeError, exportKeyFragment, generateKey, seal } from "../../lib/envelope.js";
import { MAX_PLAINTEXT_BYTES, type MaxReads, type TtlSeconds } from "../../lib/limits.js";
import { ShareApiError, createShare } from "../../api/shares.js";
import type { CreateState } from "./state.js";

export async function runShareFlow(
  envInput: string,
  ttlSeconds: TtlSeconds,
  maxReads: MaxReads,
  origin: string,
  onProgress?: (state: CreateState) => void,
): Promise<CreateState | { phase: "over_limit" }> {
  const encoded = new TextEncoder().encode(envInput);
  if (encoded.length > MAX_PLAINTEXT_BYTES) {
    return { phase: "over_limit" };
  }

  onProgress?.({ phase: "encrypting" });
  let at: Extract<CreateState, { phase: "error" }>["at"] = "encrypt";
  try {
    const key = await generateKey();
    const envelope = await seal(encoded, key);
    const fragment = await exportKeyFragment(key);

    at = "send";
    onProgress?.({ phase: "uploading", bytes: envelope.length });
    const created = await createShare(envelope, ttlSeconds, maxReads);
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
      phase: "done",
      shareId: created.id,
      url,
      copied,
      expiresAt: created.expiresAt,
      maxReads: created.maxReads,
      deleteToken: created.deleteToken,
      revoke: { phase: "idle" },
    };
  } catch (error) {
    if (error instanceof EnvelopeError) {
      return { phase: "error", at: "encrypt", message: "Encryption failed" };
    }
    if (error instanceof ShareApiError) {
      return { phase: "error", at: "send", message: error.message };
    }
    return { phase: "error", at, message: "Something went wrong" };
  }
}
