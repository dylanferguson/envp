import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { openMemoryStore, openStore } from "../src/server/store.js";

describe("ShareStore", () => {
  it("returns null for expired rows", () => {
    let now = 1_000_000;
    const store = openMemoryStore(() => now);
    const created = store.create(new Uint8Array([9]), 60 as never);
    now += 60_001;
    expect(store.read(created.id)).toBeNull();
  });

  it("keeps row alive at 59_999 ms for 60s ttl", () => {
    let now = 0;
    const store = openMemoryStore(() => now);
    const created = store.create(new Uint8Array([7]), 60 as never);
    now = 59_999;
    expect(store.read(created.id)).not.toBeNull();
  });

  it("drops row at 60_000 ms for 60s ttl", () => {
    let now = 0;
    const store = openMemoryStore(() => now);
    const created = store.create(new Uint8Array([7]), 60 as never);
    now = 60_000;
    expect(store.read(created.id)).toBeNull();
  });

  it("sweep is idempotent", () => {
    let now = 0;
    const store = openMemoryStore(() => now);
    store.create(new Uint8Array([1]), 1 as never);
    now = 10_000;
    expect(store.sweep()).toBe(1);
    expect(store.sweep()).toBe(0);
  });

  it("persists to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-share-"));
    const path = join(dir, "shares.db");
    try {
      const writer = openStore(path, () => 42);
      const created = writer.create(new Uint8Array([4, 5]), 3600 as never);
      const reader = openStore(path, () => 42);
      expect(reader.read(created.id)?.envelope).toEqual(new Uint8Array([4, 5]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
