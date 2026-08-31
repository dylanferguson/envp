import { MAX_PLAINTEXT_BYTES, MAX_PLAINTEXT_KIB } from "../../shared/limits.js";

export function formatInputSize(bytes: number): { text: string; over: boolean } {
  if (bytes > MAX_PLAINTEXT_BYTES) {
    return { text: `over ${MAX_PLAINTEXT_KIB} KiB`, over: true };
  }
  if (bytes === 0) {
    return { text: `${MAX_PLAINTEXT_KIB} KiB max`, over: false };
  }
  const kib = bytes / 1024;
  const label = kib >= 10 ? `${Math.round(kib)} KiB` : `${kib.toFixed(1)} KiB`;
  return { text: label, over: false };
}
