import { describe, expect, it } from "vitest";
import {
  generateKey,
  seal,
} from "../src/shared/envelope.js";
import { MAX_ENVELOPE_BYTES, MAX_TTL_SECONDS } from "../src/shared/limits.js";
import { createApp } from "../src/server/app.js";
import { openMemoryStore } from "../src/server/store.js";

import { toArrayBuffer } from "../src/shared/bytes.js";

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

describe("routes", () => {
  it("POST stores encrypted bytes, not plaintext", async () => {
    const { app } = makeApp();
    const key = await generateKey();
    const plaintext = new TextEncoder().encode("SECRET=not-plain-on-server");
    const envelope = await seal(plaintext, key);

    const response = await app.request("http://localhost/shares?ttl=3600", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://localhost",
      },
      body: toArrayBuffer(envelope),
    });

    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };

    const get = await app.request(`http://localhost/shares/${id}`);
    const stored = new Uint8Array(await get.arrayBuffer());
    expect(stored).toEqual(envelope);
    expect(new TextDecoder().decode(stored)).not.toBe("SECRET=not-plain-on-server");
  });

  it("GET returns 404 after expiry", async () => {
    let now = 1_000;
    const { app, store } = makeApp(() => now);
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);

    const post = await app.request("http://localhost/shares?ttl=60", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://localhost",
      },
      body: toArrayBuffer(envelope),
    });
    const { id } = (await post.json()) as { id: string };

    now += 61_000;
    const get = await app.request(`http://localhost/shares/${id}`);
    expect(get.status).toBe(404);
    expect(await get.text()).toBe("");
    expect(store.read(id as never)).toBeNull();
  });

  it("rejects bad ttl with 400", async () => {
    const { app } = makeApp();
    const response = await app.request("http://localhost/shares?ttl=30", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://localhost",
      },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(response.status).toBe(400);
  });

  it("rejects empty body with 400", async () => {
    const { app } = makeApp();
    const response = await app.request("http://localhost/shares?ttl=3600", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://localhost",
      },
      body: new Uint8Array(),
    });
    expect(response.status).toBe(400);
  });

  it("rejects oversized body with 413", async () => {
    const { app } = makeApp();
    const body = new Uint8Array(MAX_ENVELOPE_BYTES + 1);
    const response = await app.request(`http://localhost/shares?ttl=${MAX_TTL_SECONDS}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://localhost",
      },
      body,
    });
    expect(response.status).toBe(413);
  });

  it("returns identical 404 for unknown and expired ids", async () => {
    let now = 0;
    const { app } = makeApp(() => now);
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const post = await app.request("http://localhost/shares?ttl=60", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://localhost",
      },
      body: toArrayBuffer(envelope),
    });
    const { id } = (await post.json()) as { id: string };
    now = 120_000;

    const unknown = await app.request("http://localhost/shares/aaaaaaaaaaaaaaaaaaaaaa");
    const expired = await app.request(`http://localhost/shares/${id}`);

    expect(unknown.status).toBe(404);
    expect(expired.status).toBe(404);
    expect(await unknown.text()).toBe("");
    expect(await expired.text()).toBe("");
  });

  it("rejects cross-origin POST", async () => {
    const { app } = makeApp();
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const response = await app.request("http://localhost/shares?ttl=3600", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://evil.example",
      },
      body: toArrayBuffer(envelope),
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
    const response = await app.request("http://localhost/s/does-not-exist-id");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("env-share");
  });

  it("GET /shares/:id sets nosniff and no-store", async () => {
    const { app } = makeApp();
    const key = await generateKey();
    const envelope = await seal(new TextEncoder().encode("x"), key);
    const post = await app.request("http://localhost/shares?ttl=3600", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: "http://localhost",
      },
      body: toArrayBuffer(envelope),
    });
    const { id } = (await post.json()) as { id: string };
    const get = await app.request(`http://localhost/shares/${id}`);
    expect(get.headers.get("x-content-type-options")).toBe("nosniff");
    expect(get.headers.get("cache-control")).toBe("no-store");
  });
});
