import { describe, expect, it } from "vite-plus/test";
import {
  EnvelopeError,
  exportKeyFragment,
  generateKey,
  importKeyFromFragment,
  open,
  seal,
} from "../src/lib/envelope.js";
import { ENVELOPE_HEADER_BYTES, MAX_PLAINTEXT_BYTES, type KeyFragment } from "../src/lib/limits.js";

describe("envelope", () => {
  it("round-trips plaintext", async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("FOO=bar\nBAZ=qux");
    const envelope = await seal(plaintext, key);
    const opened = await open(envelope, key);
    expect(new TextDecoder().decode(opened)).toBe("FOO=bar\nBAZ=qux");
  });

  it("rejects tampered ciphertext byte", async () => {
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    envelope[ENVELOPE_HEADER_BYTES]! ^= 0xff;
    await expect(open(envelope, key)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("rejects wrong key", async () => {
    const key = await generateKey();
    const other = await generateKey();
    const envelope = await seal(new TextEncoder().encode("secret"), key);
    await expect(open(envelope, other)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("rejects oversize plaintext", async () => {
    const key = await generateKey();
    const big = new Uint8Array(MAX_PLAINTEXT_BYTES + 1);
    await expect(seal(big, key)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("binds AAD over version byte", async () => {
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    envelope[4] = envelope[4] === 0x01 ? 0x02 : 0x01;
    await expect(open(envelope, key)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("binds AAD over suite byte", async () => {
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    envelope[5] = envelope[5] === 0x01 ? 0x02 : 0x01;
    await expect(open(envelope, key)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("rejects invalid key fragment length", async () => {
    await expect(importKeyFromFragment("tooshort" as KeyFragment)).rejects.toBeInstanceOf(
      EnvelopeError,
    );
  });

  it("exports a 43-character key fragment", async () => {
    const key = await generateKey();
    const fragment = await exportKeyFragment(key);
    expect(fragment).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
