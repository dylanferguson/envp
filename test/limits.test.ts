import { describe, expect, it } from "vitest";
import { parseShareLink } from "../src/shared/limits.js";

const SHARE_ID = "share_abcdefghijklmnopqrstuv";
const KEY_FRAGMENT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

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
