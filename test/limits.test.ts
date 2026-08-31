import { describe, expect, it } from "vitest";
import {
  formatExpiresAtLabel,
  formatExpiryLabel,
  parseShareLink,
  type UnixMillis,
} from "../src/shared/limits.js";

const SHARE_ID = "share_abcdefghijklmnopqrstuv";
const KEY_FRAGMENT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

describe("formatExpiryLabel", () => {
  it("shows hours for exact and near-hour durations", () => {
    expect(formatExpiryLabel(3600)).toBe("expires in 1h");
    expect(formatExpiryLabel(3599)).toBe("expires in 1h");
    expect(formatExpiryLabel(3570)).toBe("expires in 1h");
  });

  it("shows minutes below one hour", () => {
    expect(formatExpiryLabel(1800)).toBe("expires in 30m");
    expect(formatExpiryLabel(3569)).toBe("expires in 59m");
  });

  it("shows 24h at the max ttl", () => {
    expect(formatExpiryLabel(86400)).toBe("expires in 24h");
  });
});

describe("formatExpiresAtLabel", () => {
  it("matches formatExpiryLabel after upload delay", () => {
    const now = 1_700_000_000_000;
    const expiresAt = (now + 3599_000) as UnixMillis;
    expect(formatExpiresAtLabel(expiresAt, now)).toBe("expires in 1h");
  });
});

describe("parseShareLink", () => {
  it("parses absolute share URLs", () => {
    const parsed = parseShareLink(
      `https://env-share.example/s/${SHARE_ID}#${KEY_FRAGMENT}`,
    );
    expect(parsed).toEqual({
      shareId: SHARE_ID,
      keyFragment: KEY_FRAGMENT,
    });
  });

  it("parses relative share paths", () => {
    const parsed = parseShareLink(`/s/${SHARE_ID}#${KEY_FRAGMENT}`);
    expect(parsed).toEqual({
      shareId: SHARE_ID,
      keyFragment: KEY_FRAGMENT,
    });
  });

  it("parses bare share id and key", () => {
    const parsed = parseShareLink(`${SHARE_ID}#${KEY_FRAGMENT}`);
    expect(parsed).toEqual({
      shareId: SHARE_ID,
      keyFragment: KEY_FRAGMENT,
    });
  });

  it("rejects share id without key", () => {
    expect(parseShareLink(`/s/${SHARE_ID}`)).toBeNull();
    expect(parseShareLink(SHARE_ID)).toBeNull();
  });

  it("rejects malformed links", () => {
    expect(parseShareLink("")).toBeNull();
    expect(parseShareLink("not-a-share-link")).toBeNull();
    expect(parseShareLink(`https://env-share.example/open#${KEY_FRAGMENT}`)).toBeNull();
  });
});
