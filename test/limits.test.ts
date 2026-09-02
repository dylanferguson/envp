import { describe, expect, it } from "vite-plus/test";
import { formatExpiryLabel, parseShareId, parseShareLink } from "../src/shared/limits.js";

const SHARE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const KEY_FRAGMENT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

describe("parseShareId", () => {
  it("accepts valid ULIDs and normalizes case", () => {
    expect(parseShareId(SHARE_ID)).toBe(SHARE_ID);
    expect(parseShareId(SHARE_ID.toLowerCase())).toBe(SHARE_ID);
  });

  it("rejects invalid ids", () => {
    expect(parseShareId("share_01h2xcejqtf2nbrexx3vqjhp41")).toBeNull();
    expect(parseShareId("not-a-ulid")).toBeNull();
  });
});

describe("formatExpiryLabel", () => {
  it("rounds ttl to hours or minutes", () => {
    expect(formatExpiryLabel(86400)).toBe("expires in 24h");
    expect(formatExpiryLabel(3600)).toBe("expires in 1h");
    expect(formatExpiryLabel(3599)).toBe("expires in 1h");
    expect(formatExpiryLabel(3570)).toBe("expires in 1h");
    expect(formatExpiryLabel(3569)).toBe("expires in 59m");
    expect(formatExpiryLabel(1800)).toBe("expires in 30m");
  });
});

describe("parseShareLink", () => {
  it("parses supported link shapes", () => {
    expect(parseShareLink(`https://env-share.example/share/${SHARE_ID}#${KEY_FRAGMENT}`)).toEqual({
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

  it("rejects invalid links", () => {
    expect(parseShareLink(`/share/${SHARE_ID}`)).toBeNull();
    expect(parseShareLink(SHARE_ID)).toBeNull();
    expect(parseShareLink("01ARZ3NDEKTSV4RRFFQ69G5FA")).toBeNull();
    expect(parseShareLink("")).toBeNull();
    expect(parseShareLink("not-a-share-link")).toBeNull();
    expect(parseShareLink(`https://env-share.example/open#${KEY_FRAGMENT}`)).toBeNull();
    expect(parseShareLink(`/s/${SHARE_ID}#${KEY_FRAGMENT}`)).toBeNull();
  });
});
