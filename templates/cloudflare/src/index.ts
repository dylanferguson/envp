import { createShare, readShare, sweep } from "./api.ts";
import { errInternal, errNotFound } from "./http.ts";

const SHARE_PAGE = /^\/share\/[^/]+\/?$/;
const PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(JSON.stringify({ msg: "request failed", error: String(error) }));
      return errInternal(request.method);
    }
  },

  async scheduled(_controller, env): Promise<void> {
    await sweep(env.DB);
  },
} satisfies ExportedHandler<Env>;

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/v1/shares" && request.method === "POST") {
    return createShare(request, env);
  }
  const shareApi = pathname.match(/^\/api\/v1\/shares\/([^/]+)$/);
  if (shareApi && (request.method === "GET" || request.method === "HEAD")) {
    return readShare(request, env, shareApi[1] ?? "");
  }
  if (pathname.startsWith("/api/")) {
    return errNotFound(request.method);
  }
  if (SHARE_PAGE.test(pathname)) {
    return sharePage(request, env);
  }
  return env.ASSETS.fetch(request);
}

async function sharePage(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(new URL("/open.html", request.url));
  const headers = new Headers(asset.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Content-Security-Policy", PAGE_CSP);
  return new Response(asset.body, { status: asset.status, headers });
}
