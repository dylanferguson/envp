import { describe, expect, it } from "vite-plus/test";
import {
  formatExpiryLabel,
  formatMaxReadsLabel,
  formatShareBoundsLabel,
  parseMaxReads,
  parseShareId,
  parseShareLink,
  type UnixMillis,
} from "../src/lib/limits.js";

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
    expect(parseShareId("81ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeNull();
    expect(parseShareId("I1ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeNull();
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

describe("parseMaxReads", () => {
  it("accepts integers in range", () => {
    expect(parseMaxReads(1)).toBe(1);
    expect(parseMaxReads(20)).toBe(20);
    expect(parseMaxReads(100)).toBe(100);
  });

  it("rejects out-of-range and non-integers", () => {
    expect(parseMaxReads(0)).toBeNull();
    expect(parseMaxReads(101)).toBeNull();
    expect(parseMaxReads(20.5)).toBeNull();
    expect(parseMaxReads("20")).toBeNull();
  });
});

describe("formatMaxReadsLabel", () => {
  it("uses singular for one read", () => {
    expect(formatMaxReadsLabel(1)).toBe("1 read");
  });

  it("uses plural otherwise", () => {
    expect(formatMaxReadsLabel(5)).toBe("5 reads");
    expect(formatMaxReadsLabel(20)).toBe("20 reads");
    expect(formatMaxReadsLabel(100)).toBe("100 reads");
  });
});

describe("formatShareBoundsLabel", () => {
  it("joins ttl and reads with or", () => {
    const now = 1_000_000 as UnixMillis;
    expect(formatShareBoundsLabel((now + 86_400_000) as UnixMillis, 82, now)).toBe(
      "expires in 24h or 82 reads",
    );
    expect(formatShareBoundsLabel((now + 3_600_000) as UnixMillis, 1, now)).toBe(
      "expires in 1h or 1 read",
    );
  });
});

describe("parseShareLink", () => {
  it("parses supported link shapes", () => {
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

  it("rejects invalid links", () => {
    expect(parseShareLink(`/share/${SHARE_ID}`)).toBeNull();
    expect(parseShareLink(SHARE_ID)).toBeNull();
    expect(parseShareLink("01ARZ3NDEKTSV4RRFFQ69G5FA")).toBeNull();
    expect(parseShareLink("")).toBeNull();
    expect(parseShareLink("not-a-share-link")).toBeNull();
    expect(parseShareLink(`https://envp.example/open#${KEY_FRAGMENT}`)).toBeNull();
    expect(parseShareLink(`/s/${SHARE_ID}#${KEY_FRAGMENT}`)).toBeNull();
  });
});
