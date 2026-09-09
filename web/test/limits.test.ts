import { describe, expect, it } from "vite-plus/test";
import { base64urlEncode } from "../src/lib/envelope.js";
import {
  parseDeleteToken,
  parseMaxReads,
  parseShareId,
  parseShareLink,
} from "../src/lib/limits.js";

const SHARE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const KEY_FRAGMENT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

describe("parseShareId", () => {
  it("accepts a ULID and rejects a near-miss", () => {
    expect(parseShareId(SHARE_ID)).toBe(SHARE_ID);
    expect(parseShareId(SHARE_ID.toLowerCase())).toBe(SHARE_ID);
    expect(parseShareId("not-a-ulid")).toBeNull();
  });
});

describe("parseMaxReads", () => {
  it("accepts the slider bounds and rejects a string", () => {
    expect(parseMaxReads(1)).toBe(1);
    expect(parseMaxReads(100)).toBe(100);
    expect(parseMaxReads(0)).toBeNull();
    expect(parseMaxReads("20")).toBeNull();
  });
});

describe("parseDeleteToken", () => {
  it("accepts 32 decoded bytes and rejects shorter input", () => {
    const token = base64urlEncode(new Uint8Array(32));
    expect(parseDeleteToken(token)).toBe(token);
    expect(parseDeleteToken("short")).toBeNull();
    expect(parseDeleteToken(SHARE_ID)).toBeNull();
  });
});

describe("parseShareLink", () => {
  it("parses a full URL, a path, and a bare id#key", () => {
    expect(parseShareLink(`https://envp.example/share/${SHARE_ID}#${KEY_FRAGMENT}`)).toEqual({
      shareId: SHARE_ID,
      keyFragment: KEY_FRAGMENT,
    });
    expect(parseShareLink(`/share/${SHARE_ID}#${KEY_FRAGMENT}`)).toEqual({
      shareId: SHARE_ID,
      keyFragment: KEY_FRAGMENT,
    });
    expect(parseShareLink(`${SHARE_ID}#${KEY_FRAGMENT}`)).toEqual({
      shareId: SHARE_ID,
      keyFragment: KEY_FRAGMENT,
    });
  });

  it("rejects a link with no key", () => {
    expect(parseShareLink(`/share/${SHARE_ID}`)).toBeNull();
    expect(parseShareLink("not-a-share-link")).toBeNull();
  });
});
