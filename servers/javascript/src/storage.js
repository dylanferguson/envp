import { DatabaseSync } from 'node:sqlite';

export class MemoryStore {
  #shares = new Map();

  put(id, payload, expiresAt) {
    this.#shares.set(id, { payload: Buffer.from(payload), expiresAt });
  }

  get(id, now) {
    const share = this.#shares.get(id);
    if (!share) return null;
    if (share.expiresAt <= now) {
      this.#shares.delete(id);
      return null;
    }
    return Buffer.from(share.payload);
  }

  cleanup(now, limit) {
    let deleted = 0;
    for (const [id, share] of this.#shares) {
      if (deleted === limit) break;
      if (share.expiresAt <= now) {
        this.#shares.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  close() {}
}

export class SqliteStore {
  #database;
  #insert;
  #select;
  #deleteExpired;

  constructor(path) {
    this.#database = new DatabaseSync(path);
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        payload BLOB NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS shares_expires_at ON shares(expires_at);
    `);
    this.#insert = this.#database.prepare(
      'INSERT INTO shares (id, payload, expires_at) VALUES (?, ?, ?)',
    );
    this.#select = this.#database.prepare(
      'SELECT payload FROM shares WHERE id = ? AND expires_at > ?',
    );
    this.#deleteExpired = this.#database.prepare(`
      DELETE FROM shares
      WHERE id IN (
        SELECT id FROM shares WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
      )
    `);
  }

  put(id, payload, expiresAt) {
    this.#insert.run(id, payload, expiresAt);
  }

  get(id, now) {
    const row = this.#select.get(id, now);
    return row ? Buffer.from(row.payload) : null;
  }

  cleanup(now, limit) {
    return Number(this.#deleteExpired.run(now, limit).changes);
  }

  close() {
    this.#database.close();
  }
}

export function createStore({ mode = 'memory', sqlitePath = 'env-share.sqlite' } = {}) {
  if (mode === 'memory') return new MemoryStore();
  if (mode === 'sqlite') return new SqliteStore(sqlitePath);
  throw new Error(`Unsupported STORE value: ${mode}`);
}
