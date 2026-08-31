import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { API_V1_SHARES } from "../shared/api.js";
import { parseShareId } from "../shared/limits.js";
import {
  encodeCreateShareResponse,
  encodeGetShareResponse,
  MAX_CREATE_JSON_BYTES,
  parseCreateShareRequest,
} from "../shared/share-api.js";
import type { ShareStore } from "./store.js";

type RateBucket = {
  count: number;
  resetAt: number;
};

type RateLimiter = {
  check(key: string, limit: number, windowMs: number): boolean;
};

function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, RateBucket>();
  return {
    check(key: string, limit: number, windowMs: number): boolean {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || now >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (bucket.count >= limit) {
        return false;
      }
      bucket.count += 1;
      return true;
    },
  };
}

export type AppDeps = {
  store: ShareStore;
  publicOrigin?: string;
  trustProxy?: boolean;
  clientRoot?: string;
  rateLimiter?: RateLimiter;
};

function clientIp(
  req: Request,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) {
        return first;
      }
    }
  }
  return "local";
}

function expectedOrigin(req: Request, publicOrigin?: string): string | null {
  if (publicOrigin) {
    return publicOrigin;
  }
  const host = req.headers.get("host");
  if (!host) {
    return null;
  }
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  };
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const limiter = deps.rateLimiter ?? createRateLimiter();
  const clientRoot = deps.clientRoot ?? "dist/client";
  const trustProxy = deps.trustProxy ?? process.env.TRUST_PROXY === "true";

  app.use("*", async (c, next) => {
    await next();
    const secured = withSecurityHeaders(c.res);
    c.res = secured;
  });

  app.post(
    API_V1_SHARES,
    bodyLimit({
      maxSize: MAX_CREATE_JSON_BYTES,
      onError: (c) => c.body(null, 413),
    }),
    async (c) => {
      const origin = c.req.header("origin");
      if (origin) {
        const expected = expectedOrigin(c.req.raw, deps.publicOrigin);
        if (!expected || origin !== expected) {
          return c.body(null, 403);
        }
      }

      const ip = clientIp(c.req.raw, trustProxy);
      if (!limiter.check(`post:${ip}`, 15, 5 * 60 * 1000)) {
        return c.body(null, 429);
      }

      let json: unknown;
      try {
        json = await c.req.json();
      } catch {
        return c.body(null, 400);
      }

      const request = parseCreateShareRequest(json);
      if (!request) {
        return c.body(null, 400);
      }

      const record = deps.store.create(request.envelope, request.ttl);
      return c.json(encodeCreateShareResponse(record), 201);
    },
  );

  app.get(`${API_V1_SHARES}/:id`, async (c) => {
    const id = parseShareId(c.req.param("id"));
    if (!id) {
      return c.body(null, 404);
    }

    const ip = clientIp(c.req.raw, trustProxy);
    if (!limiter.check(`get:${ip}`, 120, 60 * 1000)) {
      return c.body(null, 429);
    }

    const share = deps.store.read(id);
    if (!share) {
      return c.body(null, 404);
    }

    c.header("Cache-Control", "no-store");
    return c.json(encodeGetShareResponse(id, share));
  });

  app.get("/s/:id", (c) => {
    const html = readFileSync(join(clientRoot, "open.html"), "utf8");
    return c.html(html);
  });

  app.get("/new", (c) => {
    const html = readFileSync(join(clientRoot, "index.html"), "utf8");
    return c.html(html);
  });

  app.get("/", async (c) => {
    return serveStatic({ root: clientRoot, path: "index.html" })(c, async () => {});
  });

  app.use("/*", serveStatic({ root: clientRoot }));

  return app;
}
