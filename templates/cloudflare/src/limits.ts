export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 86400;
export const MIN_MAX_READS = 1;
export const MAX_MAX_READS = 100;
export const MAX_SHARE_BYTES = 65570;
export const MAX_CREATE_JSON_BYTES = 64 + Math.floor((MAX_SHARE_BYTES * 4 + 2) / 3);
export const SWEEP_BATCH = 500;

const SHARE_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

export function parseShareId(value: string): string | null {
  if (!SHARE_ID_RE.test(value)) {
    return null;
  }
  return value.toUpperCase();
}
