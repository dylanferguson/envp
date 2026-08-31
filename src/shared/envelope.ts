import {
  ENVELOPE_HEADER_BYTES,
  GCM_TAG_BYTES,
  MAX_ENVELOPE_BYTES,
  MAX_PLAINTEXT_BYTES,
  type EnvelopeBytes,
  type KeyFragment,
} from "./limits.js";
import { toArrayBuffer, base64urlDecode, base64urlEncode } from "./bytes.js";

export class EnvelopeError extends Error {
  constructor(message = "envelope error") {
    super(message);
    this.name = "EnvelopeError";
  }
}

const MAGIC = new Uint8Array([0x45, 0x4e, 0x56, 0x53]); // "ENVS"
const VERSION = 0x01;
const SUITE = 0x01;

export { base64urlDecode, base64urlEncode };

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKeyFragment(key: CryptoKey): Promise<KeyFragment> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  if (raw.length !== 32) {
    throw new EnvelopeError();
  }
  return base64urlEncode(raw) as KeyFragment;
}

export async function importKeyFromFragment(
  fragment: KeyFragment,
): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = base64urlDecode(fragment);
  } catch {
    throw new EnvelopeError();
  }
  if (raw.length !== 32) {
    throw new EnvelopeError();
  }
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(raw),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export async function seal(
  plaintext: Uint8Array,
  key: CryptoKey,
): Promise<EnvelopeBytes> {
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new EnvelopeError();
  }

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(ENVELOPE_HEADER_BYTES);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  header[5] = SUITE;
  header.set(nonce, 6);

  const aad = header.slice(0, 6);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
      key,
      toArrayBuffer(plaintext),
    ),
  );

  const envelope = new Uint8Array(ENVELOPE_HEADER_BYTES + ciphertext.length);
  envelope.set(header, 0);
  envelope.set(ciphertext, ENVELOPE_HEADER_BYTES);
  return envelope as EnvelopeBytes;
}

export async function open(
  envelope: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  if (
    envelope.length < ENVELOPE_HEADER_BYTES + GCM_TAG_BYTES ||
    envelope.length > MAX_ENVELOPE_BYTES
  ) {
    throw new EnvelopeError();
  }

  if (
    !bytesEqual(envelope.slice(0, 4), MAGIC) ||
    envelope[4] !== VERSION ||
    envelope[5] !== SUITE
  ) {
    throw new EnvelopeError();
  }

  const nonce = envelope.slice(6, 18);
  const ciphertext = envelope.slice(ENVELOPE_HEADER_BYTES);
  const aad = envelope.slice(0, 6);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
      key,
      ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new EnvelopeError();
  }
}
