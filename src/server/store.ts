import Database from "better-sqlite3";
import { mintShareId, type ShareId, type TtlSeconds, type UnixMillis } from "../shared/limits.js";

export type ShareRecord = {
  id: ShareId;
  expiresAt: UnixMillis;
};

export type ShareStoreDeps = {
  db: Database.Database;
  now?: () => number;
};

export class ShareStore {
  readonly #db: Database.Database;
  readonly #now: () => number;

  constructor(deps: ShareStoreDeps) {
    this.#db = deps.db;
    this.#now = deps.now ?? Date.now;
    this.#db.pragma("journal_mode = WAL");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        envelope BLOB NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS shares_expires_at ON shares (expires_at);
    `);
  }

  create(envelope: Uint8Array, ttl: TtlSeconds): ShareRecord {
    const id = mintShareId();
    const expiresAt = (this.#now() + ttl * 1000) as UnixMillis;
    this.#db
      .prepare("INSERT INTO shares (id, envelope, expires_at) VALUES (?, ?, ?)")
      .run(id, Buffer.from(envelope), expiresAt);
    return { id, expiresAt };
  }

  read(id: ShareId): { envelope: Uint8Array; expiresAt: UnixMillis } | null {
    const row = this.#db
      .prepare("SELECT envelope, expires_at FROM shares WHERE id = ? AND expires_at > ?")
      .get(id, this.#now()) as { envelope: Buffer; expires_at: number } | undefined;
    if (!row) {
      return null;
    }
    return {
      envelope: new Uint8Array(row.envelope),
      expiresAt: row.expires_at as UnixMillis,
    };
  }

  sweep(batchSize = 500): number {
    let total = 0;
    for (;;) {
      const result = this.#db
        .prepare(
          "DELETE FROM shares WHERE id IN (SELECT id FROM shares WHERE expires_at <= ? LIMIT ?)",
        )
        .run(this.#now(), batchSize);
      total += result.changes;
      if (result.changes < batchSize) {
        break;
      }
    }
    return total;
  }
}

export function openStore(dbPath: string, now?: () => number): ShareStore {
  const db = new Database(dbPath);
  return new ShareStore({ db, now });
}

export function openMemoryStore(now?: () => number): ShareStore {
  const db = new Database(":memory:");
  return new ShareStore({ db, now });
}
