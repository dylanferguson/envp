import { base64urlDecode, base64urlEncode } from "../lib/bytes.js";
import {
  MAX_ENVELOPE_BYTES,
  parseMaxReads,
  parseShareId,
  type MaxReads,
  type ShareId,
  type TtlSeconds,
  type UnixMillis,
} from "../lib/limits.js";

export type CreateShareResponse = {
  id: ShareId;
  expiresAt: UnixMillis;
  maxReads: MaxReads;
};

export type GetShareResponse = {
  id: ShareId;
  expiresAt: UnixMillis;
  envelope: Uint8Array;
};

export function buildCreateShareBody(
  ttlSeconds: TtlSeconds,
  maxReads: MaxReads,
  envelope: Uint8Array,
): string {
  return JSON.stringify({
    ttl_seconds: ttlSeconds,
    max_reads: maxReads,
    envelope: base64urlEncode(envelope),
  });
}

export function parseCreateShareResponse(body: unknown): CreateShareResponse | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  if (
    !("id" in body) ||
    typeof body.id !== "string" ||
    !("expires_at" in body) ||
    typeof body.expires_at !== "number" ||
    !Number.isFinite(body.expires_at) ||
    !("max_reads" in body)
  ) {
    return null;
  }

  const id = parseShareId(body.id);
  const maxReads = parseMaxReads(body.max_reads);
  if (!id || !maxReads) {
    return null;
  }

  return { id, expiresAt: body.expires_at as UnixMillis, maxReads };
}

export function parseGetShareResponse(body: unknown): GetShareResponse | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  if (
    !("id" in body) ||
    typeof body.id !== "string" ||
    !("expires_at" in body) ||
    typeof body.expires_at !== "number" ||
    !Number.isFinite(body.expires_at) ||
    !("envelope" in body) ||
    typeof body.envelope !== "string" ||
    body.envelope.length === 0
  ) {
    return null;
  }

  const id = parseShareId(body.id);
  if (!id) {
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

  return { id, expiresAt: body.expires_at as UnixMillis, envelope };
}
