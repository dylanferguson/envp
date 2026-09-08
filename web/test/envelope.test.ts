import { describe, expect, it } from "vite-plus/test";
import {
  EnvelopeError,
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

  it("rejects a tampered ciphertext byte", async () => {
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    envelope[ENVELOPE_HEADER_BYTES]! ^= 0xff;
    await expect(open(envelope, key)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("rejects the wrong key", async () => {
    const key = await generateKey();
    const other = await generateKey();
    const envelope = await seal(new TextEncoder().encode("secret"), key);
    await expect(open(envelope, other)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("rejects oversize plaintext", async () => {
    const key = await generateKey();
    await expect(seal(new Uint8Array(MAX_PLAINTEXT_BYTES + 1), key)).rejects.toBeInstanceOf(
      EnvelopeError,
    );
  });

  it("fails open if the version byte changes", async () => {
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    envelope[4] = envelope[4] === 0x01 ? 0x02 : 0x01;
    await expect(open(envelope, key)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("rejects an invalid key fragment", async () => {
    await expect(importKeyFromFragment("tooshort" as KeyFragment)).rejects.toBeInstanceOf(
      EnvelopeError,
    );
  });
});
