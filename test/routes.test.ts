import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { API_ERROR_CODES, API_ERROR_MESSAGES } from "../src/shared/api-error.js";
import { API_V1_SHARES } from "../src/shared/api.js";
import { generateKey, seal } from "../src/shared/envelope.js";
import { MAX_TTL_SECONDS, type TtlSeconds } from "../src/shared/limits.js";
import { buildCreateShareBody, MAX_CREATE_JSON_BYTES } from "../src/shared/share-api.js";
import { IMMUTABLE_ASSET_CACHE } from "../src/server/cache.js";
import { createApp, createRateLimiter } from "../src/server/app.js";
import { openMemoryStore } from "../src/server/store.js";

const UNKNOWN_SHARE_ID = "00000000000000000000000000";

function makeApp(now = () => Date.now()) {
  const store = openMemoryStore(now);
  return {
    app: createApp({
      store,
      publicOrigin: "http://localhost",
      clientRoot: process.cwd(),
    }),
    store,
  };
}

async function postShare(
  app: ReturnType<typeof makeApp>["app"],
  ttl: number,
  envelope: Uint8Array,
): Promise<Response> {
  return await app.request(`http://localhost${API_V1_SHARES}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
    },
    body: buildCreateShareBody(ttl as TtlSeconds, envelope),
  });
}

describe("routes", () => {
  it("rejects bad ttl with 400", async () => {
    const { app } = makeApp();
    const response = await app.request(`http://localhost${API_V1_SHARES}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ ttl_seconds: 30, envelope: "AQ" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: API_ERROR_CODES.invalidRequest,
        message: API_ERROR_MESSAGES.invalidRequest,
      },
    });
  });

  it("rejects empty envelope with 400", async () => {
    const { app } = makeApp();
    const response = await postShare(app, 3600, new Uint8Array());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: API_ERROR_CODES.invalidRequest,
        message: API_ERROR_MESSAGES.invalidRequest,
      },
    });
  });

  it("rejects oversized json body with 413", async () => {
    const { app } = makeApp();
    const response = await app.request(`http://localhost${API_V1_SHARES}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({
        ttl_seconds: MAX_TTL_SECONDS,
        envelope: "A".repeat(MAX_CREATE_JSON_BYTES),
      }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: {
        code: API_ERROR_CODES.payloadTooLarge,
        message: API_ERROR_MESSAGES.payloadTooLarge,
      },
    });
  });

  it("returns identical 404 for unknown and expired ids", async () => {
    let now = 0;
    const { app } = makeApp(() => now);
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const post = await postShare(app, 60, envelope);
    const { id } = (await post.json()) as { id: string };
    now = 120_000;

    const unknown = await app.request(`http://localhost${API_V1_SHARES}/${UNKNOWN_SHARE_ID}`);
    const expired = await app.request(`http://localhost${API_V1_SHARES}/${id}`);

    const notFoundBody = {
      error: {
        code: API_ERROR_CODES.notFound,
        message: API_ERROR_MESSAGES.notFound,
      },
    };

    expect(unknown.status).toBe(404);
    expect(expired.status).toBe(404);
    expect(await unknown.json()).toEqual(notFoundBody);
    expect(await expired.json()).toEqual(notFoundBody);
  });

  it("rejects cross-origin POST", async () => {
    const { app } = makeApp();
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const response = await app.request(`http://localhost${API_V1_SHARES}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://evil.example",
      },
      body: buildCreateShareBody(3600 as TtlSeconds, envelope),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: API_ERROR_CODES.forbidden,
        message: API_ERROR_MESSAGES.forbidden,
      },
    });
  });

  it("returns Location on create", async () => {
    const { app } = makeApp();
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const response = await postShare(app, 3600, envelope);
    const { id } = (await response.json()) as { id: string };
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`${API_V1_SHARES}/${id}`);
  });

  it("returns Retry-After on POST rate limit", async () => {
    const limiter = createRateLimiter();
    const store = openMemoryStore();
    const app = createApp({
      store,
      publicOrigin: "http://localhost",
      clientRoot: process.cwd(),
      rateLimiter: limiter,
    });
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);

    for (let i = 0; i < 15; i++) {
      const ok = await postShare(app, 3600, envelope);
      expect(ok.status).toBe(201);
    }

    const limited = await postShare(app, 3600, envelope);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      error: {
        code: API_ERROR_CODES.rateLimited,
        message: API_ERROR_MESSAGES.rateLimited,
      },
    });
  });

  it("returns Retry-After on GET rate limit", async () => {
    const limiter = createRateLimiter();
    const store = openMemoryStore();
    const app = createApp({
      store,
      publicOrigin: "http://localhost",
      clientRoot: process.cwd(),
      rateLimiter: limiter,
    });
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const post = await postShare(app, 3600, envelope);
    const { id } = (await post.json()) as { id: string };

    for (let i = 0; i < 120; i++) {
      const ok = await app.request(`http://localhost${API_V1_SHARES}/${id}`);
      expect(ok.status).toBe(200);
    }

    const limited = await app.request(`http://localhost${API_V1_SHARES}/${id}`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await limited.json()).toEqual({
      error: {
        code: API_ERROR_CODES.rateLimited,
        message: API_ERROR_MESSAGES.rateLimited,
      },
    });
  });

  it("GET /api/v1/shares/:id sets nosniff and no-store", async () => {
    const { app } = makeApp();
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const post = await postShare(app, 3600, envelope);
    const { id } = (await post.json()) as { id: string };
    const get = await app.request(`http://localhost${API_V1_SHARES}/${id}`);
    expect(get.headers.get("x-content-type-options")).toBe("nosniff");
    expect(get.headers.get("cache-control")).toBe("no-store");
  });

  it("GET /assets/* sets immutable cache when dist is present", async () => {
    const clientRoot = "dist/client";
    const assetsDir = join(process.cwd(), clientRoot, "assets");
    if (!existsSync(assetsDir)) {
      return;
    }
    const file = readdirSync(assetsDir).find((name) => name.endsWith(".js"));
    if (!file) {
      return;
    }
    const store = openMemoryStore();
    const app = createApp({
      store,
      publicOrigin: "http://localhost",
      clientRoot,
    });
    const get = await app.request(`http://localhost/assets/${file}`);
    expect(get.status).toBe(200);
    expect(get.headers.get("cache-control")).toBe(IMMUTABLE_ASSET_CACHE);
  });
});
