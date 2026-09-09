import { describe, expect, it } from "vite-plus/test";
import { base64urlEncode } from "../src/lib/envelope.js";
import {
  parseDeleteToken,
  parseMaxReads,
  parseRevokeLink,
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

describe("parseRevokeLink", () => {
  it("reads /revoke/{id}#{token} and rejects a missing token", () => {
    const token = base64urlEncode(new Uint8Array(32));
    expect(parseRevokeLink(`/revoke/${SHARE_ID}`, `#${token}`)).toEqual({
      shareId: SHARE_ID,
      deleteToken: token,
    });
    expect(parseRevokeLink(`/revoke/${SHARE_ID}`, "#short")).toBeNull();
    expect(parseRevokeLink(`/share/${SHARE_ID}`, `#${token}`)).toBeNull();
    expect(parseDeleteToken("short")).toBeNull();
    expect(parseDeleteToken(`${token}=`)).toBeNull();
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
