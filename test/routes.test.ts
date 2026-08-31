import { describe, expect, it } from "vitest";
import { API_V1_SHARES } from "../src/shared/api.js";
import {
  generateKey,
  base64urlDecode,
  seal,
} from "../src/shared/envelope.js";
import {
  MAX_TTL_SECONDS,
  type TtlSeconds,
} from "../src/shared/limits.js";
import {
  buildCreateShareBody,
  MAX_CREATE_JSON_BYTES,
} from "../src/shared/share-api.js";
import { createApp } from "../src/server/app.js";
import { openMemoryStore } from "../src/server/store.js";

const TEST_SHARE_ID = "share_abcdefghijklmnopqrstuv";
const UNKNOWN_SHARE_ID = "share_aaaaaaaaaaaaaaaaaaaaaa";

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
  it("POST stores encrypted bytes, not plaintext", async () => {
    const { app } = makeApp();
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("SECRET=not-plain-on-server");
    const envelope = await seal(plaintext, key);

    const response = await postShare(app, 3600, envelope);

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      expires_at: number;
    };
    expect(body.id).toMatch(/^share_[A-Za-z0-9_-]{22}$/);
    expect(body.expires_at).toBeTypeOf("number");

    const get = await app.request(`http://localhost${API_V1_SHARES}/${body.id}`);
    const payload = (await get.json()) as {
      id: string;
      expires_at: number;
      envelope: string;
    };
    expect(payload.id).toBe(body.id);
    expect(payload.expires_at).toBe(body.expires_at);
    expect(base64urlDecode(payload.envelope)).toEqual(envelope);
    expect(new TextDecoder().decode(envelope)).not.toBe("SECRET=not-plain-on-server");
  });

  it("GET returns 404 after expiry", async () => {
    let now = 1_000;
    const { app, store } = makeApp(() => now);
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);

    const post = await postShare(app, 60, envelope);
    const { id } = (await post.json()) as { id: string };

    now += 61_000;
    const get = await app.request(`http://localhost${API_V1_SHARES}/${id}`);
    expect(get.status).toBe(404);
    expect(await get.text()).toBe("");
    expect(store.read(id as never)).toBeNull();
  });

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

    const unknown = await app.request(
      `http://localhost${API_V1_SHARES}/${UNKNOWN_SHARE_ID}`,
    );
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

  it("GET /new is the paste page", async () => {
    const { app } = makeApp();
    const response = await app.request("http://localhost/new");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('import Create from "/src/web/Create.svelte"');
    expect(html).toContain('id="app"');
  });

  it("GET /s/:id is always 200", async () => {
    const { app } = makeApp();
    const response = await app.request(`http://localhost/s/${TEST_SHARE_ID}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("env-share");
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
