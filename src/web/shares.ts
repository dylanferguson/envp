import { toArrayBuffer } from "../shared/bytes.js";
import { parseShareId, type ShareId, type TtlSeconds } from "../shared/limits.js";

export class ShareApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status > 0 ? `share request failed (${status})` : "share request failed");
    this.name = "ShareApiError";
    this.status = status;
  }
}

export async function createShare(
  envelope: Uint8Array,
  ttl: TtlSeconds,
): Promise<ShareId> {
  const response = await fetch(`/shares?ttl=${ttl}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: toArrayBuffer(envelope),
  });

  if (!response.ok) {
    throw new ShareApiError(response.status);
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload) ||
    typeof payload.id !== "string"
  ) {
    throw new ShareApiError(0);
  }

  const id = parseShareId(payload.id);
  if (!id) {
    throw new ShareApiError(0);
  }

  return id;
}

export async function getShare(id: string): Promise<Uint8Array | null> {
  const response = await fetch(`/shares/${id}`);
  if (!response.ok) {
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}
