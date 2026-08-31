import { base64urlDecode, base64urlEncode } from "./bytes.js";
import {
  MAX_ENVELOPE_BYTES,
  parseShareId,
  parseTtlSeconds,
  type ShareId,
  type TtlSeconds,
  type UnixMillis,
} from "./limits.js";

export type ShareRead = {
  envelope: Uint8Array;
  expiresAt: UnixMillis;
};

export type CreateShareRequest = {
  ttl: TtlSeconds;
  envelope: Uint8Array;
};

export type CreateShareResponse = {
  id: ShareId;
  expiresAt: UnixMillis;
};

export type GetShareResponse = {
  id: ShareId;
  expiresAt: UnixMillis;
  envelope: Uint8Array;
};

export const MAX_CREATE_JSON_BYTES =
  64 + Math.ceil((MAX_ENVELOPE_BYTES * 4) / 3);

export function buildCreateShareBody(
  ttlSeconds: TtlSeconds,
  envelope: Uint8Array,
): string {
  return JSON.stringify({
    ttl_seconds: ttlSeconds,
    envelope: base64urlEncode(envelope),
  });
}

export function toCreateShareResponse(record: {
  id: ShareId;
  expiresAt: UnixMillis;
}): CreateShareResponse {
  return { id: record.id, expiresAt: record.expiresAt };
}

export function toGetShareResponse(
  id: ShareId,
  read: ShareRead,
): GetShareResponse {
  return { id, expiresAt: read.expiresAt, envelope: read.envelope };
}

export function encodeCreateShareResponse(record: {
  id: ShareId;
  expiresAt: UnixMillis;
}): { id: string; expires_at: number } {
  const body = toCreateShareResponse(record);
  return { id: body.id, expires_at: body.expiresAt };
}

export function encodeGetShareResponse(
  id: ShareId,
  read: ShareRead,
): { id: string; expires_at: number; envelope: string } {
  const body = toGetShareResponse(id, read);
  return {
    id: body.id,
    expires_at: body.expiresAt,
    envelope: base64urlEncode(body.envelope),
  };
}

export function parseCreateShareRequest(body: unknown): CreateShareRequest | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const ttl = parseTtlSeconds(
    "ttl_seconds" in body ? String(body.ttl_seconds) : null,
  );
  if (ttl === null) {
    return null;
  }

  if (
    !("envelope" in body) ||
    typeof body.envelope !== "string" ||
    body.envelope.length === 0
  ) {
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

  return { ttl, envelope };
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
