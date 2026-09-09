import { base64urlDecode, base64urlEncode } from "../lib/bytes.js";
import {
  MAX_ENVELOPE_BYTES,
  parseDeleteToken,
  parseMaxReads,
  parseShareId,
  type DeleteToken,
  type MaxReads,
  type ShareId,
  type TtlSeconds,
  type UnixMillis,
} from "../lib/limits.js";

const API_V1_SHARES = "/api/v1/shares";

export type CreateShareResponse = {
  id: ShareId;
  expiresAt: UnixMillis;
  maxReads: MaxReads;
  deleteToken: DeleteToken;
};

export class ShareApiError extends Error {
  constructor(status: number, statusText = "") {
    const reason = statusText.trim();
    super(status > 0 ? (reason ? `${status} ${reason}` : `${status}`) : "Request failed");
    this.name = "ShareApiError";
  }
}

function asObject(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

function parseShareMeta(
  body: Record<string, unknown>,
): { id: ShareId; expiresAt: UnixMillis } | null {
  if (
    typeof body.id !== "string" ||
    typeof body.expires_at !== "number" ||
    !Number.isFinite(body.expires_at)
  ) {
    return null;
  }
  const id = parseShareId(body.id);
  if (!id) {
    return null;
  }
  return { id, expiresAt: body.expires_at as UnixMillis };
}

export async function createShare(
  envelope: Uint8Array,
  ttl: TtlSeconds,
  maxReads: MaxReads,
): Promise<CreateShareResponse> {
  const response = await fetch(API_V1_SHARES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ttl_seconds: ttl,
      max_reads: maxReads,
      envelope: base64urlEncode(envelope),
    }),
  });
  if (!response.ok) {
    throw new ShareApiError(response.status, response.statusText);
  }
  const body = asObject(await response.json());
  const meta = body ? parseShareMeta(body) : null;
  const maxReadsOut = body ? parseMaxReads(body.max_reads) : null;
  const deleteToken =
    body && typeof body.delete_token === "string" ? parseDeleteToken(body.delete_token) : null;
  if (!meta || !maxReadsOut || !deleteToken) {
    throw new ShareApiError(0);
  }
  return { ...meta, maxReads: maxReadsOut, deleteToken };
}

export async function getShare(id: ShareId): Promise<Uint8Array | null> {
  const response = await fetch(`${API_V1_SHARES}/${id}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ShareApiError(response.status, response.statusText);
  }
  const body = asObject(await response.json());
  if (!body) {
    return null;
  }
  const meta = parseShareMeta(body);
  if (!meta || typeof body.envelope !== "string" || body.envelope.length === 0) {
    return null;
  }
  let envelope: Uint8Array;
  try {
    envelope = base64urlDecode(body.envelope);
  } catch {
    return null;
  }
  if (envelope.length === 0 || envelope.length > MAX_ENVELOPE_BYTES) {
    return null;
  }
  return envelope;
}

export type RevokeResult = "revoked" | "gone";

export async function revokeShare(id: ShareId, token: DeleteToken): Promise<RevokeResult> {
  const response = await fetch(`${API_V1_SHARES}/${id}`, {
    method: "DELETE",
    headers: { "X-Envp-Delete-Token": token },
  });
  if (response.status === 204) {
    return "revoked";
  }
  if (response.status === 404) {
    return "gone";
  }
  throw new ShareApiError(response.status, response.statusText);
}

export type { ShareId, DeleteToken };
