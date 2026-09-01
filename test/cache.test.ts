import { describe, expect, it } from "vite-plus/test";
import {
  cacheControlForPath,
  HTML_SHELL_CACHE,
  IMMUTABLE_ASSET_CACHE,
} from "../src/server/cache.js";

describe("cacheControlForPath", () => {
  it("fingerprints under /assets/", () => {
    expect(cacheControlForPath("/assets/shares-Dywwyht0.js")).toBe(IMMUTABLE_ASSET_CACHE);
    expect(cacheControlForPath("/assets/index-CSG4E4fs.css")).toBe(IMMUTABLE_ASSET_CACHE);
  });

  it("does not cache-control API paths", () => {
    expect(cacheControlForPath("/api/v1/shares/share_abc")).toBeNull();
  });

  it("no-cache for HTML shells", () => {
    expect(cacheControlForPath("/", "text/html; charset=utf-8")).toBe(HTML_SHELL_CACHE);
    expect(cacheControlForPath("/new", "text/html; charset=utf-8")).toBe(HTML_SHELL_CACHE);
  });

  it("leaves root favicons unset", () => {
    expect(cacheControlForPath("/favicon.ico", "image/x-icon")).toBeNull();
  });
});
