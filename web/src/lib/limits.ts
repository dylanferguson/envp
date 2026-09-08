export type ShareId = string & { readonly __brand: "ShareId" };
export type TtlSeconds = number & { readonly __brand: "TtlSeconds" };
export type MaxReads = number & { readonly __brand: "MaxReads" };
export type UnixMillis = number & { readonly __brand: "UnixMillis" };
export type KeyFragment = string & { readonly __brand: "KeyFragment" };
export type EnvelopeBytes = Uint8Array & { readonly __brand: "EnvelopeBytes" };

export const MAX_PLAINTEXT_BYTES = 65536;
export const MAX_PLAINTEXT_KIB = MAX_PLAINTEXT_BYTES / 1024;
export const ENVELOPE_HEADER_BYTES = 18;
export const GCM_TAG_BYTES = 16;
export const MAX_ENVELOPE_BYTES = ENVELOPE_HEADER_BYTES + MAX_PLAINTEXT_BYTES + GCM_TAG_BYTES;

export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 86400;
export const DEFAULT_TTL_SECONDS = 3600 as TtlSeconds;

export const MIN_MAX_READS = 1;
export const MAX_MAX_READS = 100;
export const DEFAULT_MAX_READS = 20 as MaxReads;

const SHARE_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
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

export function parseMaxReads(value: unknown): MaxReads | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < MIN_MAX_READS || value > MAX_MAX_READS) {
    return null;
  }
  return value as MaxReads;
}

export function formatMaxReadsLabel(maxReads: number): string {
  if (maxReads === 1) {
    return "1 read";
  }
  return `${maxReads} reads`;
}

export const LONGEST_READS_LABEL = formatMaxReadsLabel(MAX_MAX_READS);

export function parseShareId(value: string): ShareId | null {
  if (!SHARE_ID_RE.test(value)) {
    return null;
  }
  return value.toUpperCase() as ShareId;
}

export function parseKeyFragment(value: string): KeyFragment | null {
  if (!KEY_FRAGMENT_RE.test(value)) {
    return null;
  }
  return value as KeyFragment;
}

export type ParsedShareLink = {
  shareId: ShareId;
  keyFragment: KeyFragment;
};

function parsedShareLink(rawId: string, rawFragment: string): ParsedShareLink | null {
  const shareId = parseShareId(rawId);
  const keyFragment = parseKeyFragment(rawFragment);
  if (!shareId || !keyFragment) {
    return null;
  }
  return { shareId, keyFragment };
}

export function parseShareLink(input: string): ParsedShareLink | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") || trimmed.includes("://")) {
    try {
      const url = new URL(trimmed, "http://local");
      const match = url.pathname.match(/^\/share\/([^/]+)$/);
      if (!match?.[1]) {
        return null;
      }
      return parsedShareLink(match[1], url.hash.slice(1));
    } catch {
      return null;
    }
  }

  const hashIdx = trimmed.indexOf("#");
  if (hashIdx === -1) {
    return null;
  }
  return parsedShareLink(trimmed.slice(0, hashIdx), trimmed.slice(hashIdx + 1));
}

export function formatExpiryLabel(ttlSeconds: number): string {
  if (ttlSeconds >= 86400) {
    return "expires in 24h";
  }
  const minutes = Math.round(ttlSeconds / 60);
  if (minutes >= 60) {
    const hours = Math.round(ttlSeconds / 3600);
    return `expires in ${hours}h`;
  }
  return `expires in ${minutes}m`;
}

export const LONGEST_EXPIRY_LABEL = formatExpiryLabel(MAX_TTL_SECONDS);

export function formatExpiresAtLabel(expiresAt: UnixMillis, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((expiresAt - now) / 1000));
  return formatExpiryLabel(seconds);
}
