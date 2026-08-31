export type ShareId = string & { readonly __brand: "ShareId" };
export type TtlSeconds = number & { readonly __brand: "TtlSeconds" };
export type UnixMillis = number & { readonly __brand: "UnixMillis" };
export type KeyFragment = string & { readonly __brand: "KeyFragment" };
export type EnvelopeBytes = Uint8Array & { readonly __brand: "EnvelopeBytes" };

export const MAX_PLAINTEXT_BYTES = 16384;
export const ENVELOPE_HEADER_BYTES = 18;
export const GCM_TAG_BYTES = 16;
export const MAX_ENVELOPE_BYTES =
  ENVELOPE_HEADER_BYTES + MAX_PLAINTEXT_BYTES + GCM_TAG_BYTES;

export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 86400;
export const DEFAULT_TTL_SECONDS = 3600 as TtlSeconds;

const SHARE_ID_RE = /^share_[A-Za-z0-9_-]{22}$/;
const KEY_FRAGMENT_RE = /^[A-Za-z0-9_-]{43}$/;

export function parseTtlSeconds(value: string | null | undefined): TtlSeconds | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_TTL_SECONDS || n > MAX_TTL_SECONDS) {
    return null;
  }
  return n as TtlSeconds;
}

export function parseShareId(value: string): ShareId | null {
  if (!SHARE_ID_RE.test(value)) {
    return null;
  }
  return value as ShareId;
}

export function parseKeyFragment(value: string): KeyFragment | null {
  if (!KEY_FRAGMENT_RE.test(value)) {
    return null;
  }
  return value as KeyFragment;
}

export function formatExpiryLabel(ttlSeconds: number): string {
  if (ttlSeconds < 3600) {
    const minutes = Math.round(ttlSeconds / 60);
    return `expires in ${minutes}m`;
  }
  if (ttlSeconds < 86400) {
    const hours = Math.round(ttlSeconds / 3600);
    return `expires in ${hours}h`;
  }
  return "expires in 24h";
}

export function formatExpiresAtLabel(
  expiresAt: UnixMillis,
  now = Date.now(),
): string {
  const seconds = Math.max(0, Math.round((expiresAt - now) / 1000));
  return formatExpiryLabel(seconds);
}
