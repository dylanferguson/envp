import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, test } from 'node:test';
import { createShareServer, MAX_PAYLOAD_BYTES } from '../src/server.js';
import { MemoryStore } from '../src/storage.js';

const openServers = new Set();

afterEach(async () => {
  await Promise.all([...openServers].map((server) => new Promise((resolve) => server.close(resolve))));
  openServers.clear();
});

async function start(options = {}) {
  const result = createShareServer({
    store: new MemoryStore(),
    appOrigin: 'https://app.example',
    ...options,
  });
  await new Promise((resolve) => result.server.listen(0, '127.0.0.1', resolve));
  openServers.add(result.server);
  const address = result.server.address();
  return { ...result, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function create(baseUrl, body, headers = {}) {
  return fetch(`${baseUrl}/shares`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Share-Expiry-Seconds': '3600',
      ...headers,
    },
    body,
  });
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

describe('share HTTP contract', () => {
  test('creates and retrieves an opaque envelope byte-for-byte', async () => {
    const { baseUrl } = await start({ clock: () => 1_000 });
    const envelope = Buffer.from([1, 2, 0, 255, 78, 99]);

    const post = await create(baseUrl, envelope);
    assert.equal(post.status, 201);
    assert.equal(post.headers.get('content-type'), 'application/json');
    assertSecurityHeaders(post);
    const created = await post.json();
    assert.match(created.id, /^[A-Za-z0-9_-]{22}$/);
    assert.deepEqual(created, {
      id: created.id,
      path: `/shares/${created.id}`,
      expiresAt: 4_600,
    });

    const get = await fetch(`${baseUrl}${created.path}`);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('content-type'), 'application/octet-stream');
    assertSecurityHeaders(get);
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), envelope);
  });

  test('enforces logical expiry at the exact second', async () => {
    let now = 10;
    const { baseUrl } = await start({ clock: () => now });
    const post = await create(baseUrl, Buffer.from('encrypted'));
    const { path } = await post.json();

    now = 3_609;
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 200);
    now = 3_610;
    const expired = await fetch(`${baseUrl}${path}`);
    assert.equal(expired.status, 404);
    assert.deepEqual(await expired.json(), { error: 'not_found' });
  });

  test('makes missing, expired, and malformed IDs indistinguishable', async () => {
    const { baseUrl } = await start();
    for (const path of ['/shares/abcdefghijklmnopqrstuv', '/shares/not-an-id', '/shares/']) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'not_found' });
      assertSecurityHeaders(response);
    }
  });

  test('rejects invalid request metadata and empty bodies', async () => {
    const { baseUrl } = await start();
    const cases = [
      fetch(`${baseUrl}/shares`, { method: 'POST', headers: { 'X-Share-Expiry-Seconds': '3600' }, body: 'x' }),
      create(baseUrl, Buffer.from('x'), { 'X-Share-Expiry-Seconds': '60' }),
      create(baseUrl, Buffer.alloc(0)),
      create(baseUrl, Buffer.from('x'), { Origin: 'https://evil.example' }),
    ];
    for (const response of await Promise.all(cases)) {
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
    }
  });

  test('permits the configured browser origin and answers its preflight', async () => {
    const { baseUrl } = await start();
    const post = await create(baseUrl, Buffer.from('x'), { Origin: 'https://app.example' });
    assert.equal(post.status, 201);
    assert.equal(post.headers.get('access-control-allow-origin'), 'https://app.example');

    const options = await fetch(`${baseUrl}/shares`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.example' },
    });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), 'https://app.example');
  });

  test('enforces the streaming payload limit without trusting Content-Length', async () => {
    const { server, baseUrl } = await start();
    const { port } = server.address();
    const response = await new Promise((resolve, reject) => {
      const request = httpRequest({
        hostname: '127.0.0.1',
        port,
        path: '/shares',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Share-Expiry-Seconds': '3600',
          'Transfer-Encoding': 'chunked',
        },
      }, resolve);
      request.on('error', reject);
      request.write(Buffer.alloc(MAX_PAYLOAD_BYTES));
      request.end(Buffer.from('x'));
    });
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    assert.equal(response.statusCode, 413, baseUrl);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)), { error: 'payload_too_large' });
  });

  test('applies a stricter POST limit than GET limit', async () => {
    const { baseUrl } = await start({ postLimit: 1, getLimit: 2 });
    assert.equal((await create(baseUrl, Buffer.from('first'))).status, 201);
    const limitedPost = await create(baseUrl, Buffer.from('second'));
    assert.equal(limitedPost.status, 429);
    assert.deepEqual(await limitedPost.json(), { error: 'rate_limited' });

    assert.equal((await fetch(`${baseUrl}/shares/not-an-id`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/shares/not-an-id`)).status, 404);
    const limitedGet = await fetch(`${baseUrl}/shares/not-an-id`);
    assert.equal(limitedGet.status, 429);
  });
});
