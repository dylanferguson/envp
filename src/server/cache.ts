export const IMMUTABLE_ASSET_CACHE = "public, max-age=31536000, immutable";
export const HTML_SHELL_CACHE = "no-cache";

export function cacheControlForPath(pathname: string, contentType?: string | null): string | null {
  if (pathname.startsWith("/assets/")) {
    return IMMUTABLE_ASSET_CACHE;
  }
  if (contentType?.includes("text/html")) {
    return HTML_SHELL_CACHE;
  }
  return null;
}
