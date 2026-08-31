import { describe, expect, it } from "vite-plus/test";
import { API_V1_SHARES } from "../src/shared/api.js";
import { generateKey, seal } from "../src/shared/envelope.js";
import { MAX_TTL_SECONDS, type TtlSeconds } from "../src/shared/limits.js";
import { buildCreateShareBody, MAX_CREATE_JSON_BYTES } from "../src/shared/share-api.js";
import { createApp } from "../src/server/app.js";
import { openMemoryStore } from "../src/server/store.js";

const UNKNOWN_SHARE_ID = "share_00000000000000000000000000";

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
  });

  it("rejects empty envelope with 400", async () => {
    const { app } = makeApp();
    const response = await postShare(app, 3600, new Uint8Array());
    expect(response.status).toBe(400);
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

    expect(unknown.status).toBe(404);
    expect(expired.status).toBe(404);
    expect(await unknown.text()).toBe("");
    expect(await expired.text()).toBe("");
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
});
