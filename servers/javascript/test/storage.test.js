import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { MemoryStore, SqliteStore } from '../src/storage.js';

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function stores() {
  const directory = await mkdtemp(join(tmpdir(), 'env-share-js-'));
  temporaryDirectories.push(directory);
  return [new MemoryStore(), new SqliteStore(join(directory, 'shares.sqlite'))];
}

describe('storage contract', () => {
  test('returns independent copies of unexpired payloads', async () => {
    for (const store of await stores()) {
      store.put('id', Buffer.from('ciphertext'), 11);
      const first = store.get('id', 10);
      first[0] = 0;
      assert.deepEqual(store.get('id', 10), Buffer.from('ciphertext'));
      store.close();
    }
  });

  test('never returns an expired payload before cleanup', async () => {
    for (const store of await stores()) {
      store.put('id', Buffer.from('ciphertext'), 10);
      assert.equal(store.get('id', 10), null);
      store.close();
    }
  });

  test('cleanup deletes no more than the requested batch', async () => {
    for (const store of await stores()) {
      store.put('one', Buffer.from('1'), 1);
      store.put('two', Buffer.from('2'), 2);
      store.put('live', Buffer.from('3'), 100);
      assert.equal(store.cleanup(10, 1), 1);
      assert.equal(store.cleanup(10, 1), 1);
      assert.deepEqual(store.get('live', 10), Buffer.from('3'));
      store.close();
    }
  });
});
