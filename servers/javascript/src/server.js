import { randomBytes } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { FixedWindowRateLimiter } from './rate-limit.js';

export const MAX_PAYLOAD_BYTES = 65_536;
export const VALID_EXPIRIES = new Set([3_600, 86_400, 604_800]);
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const COMMON_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(response, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    ...COMMON_HEADERS,
    'Content-Type': 'application/json',
    'Content-Length': body.length,
    ...extraHeaders,
  });
  response.end(body);
}

function error(response, status, code, extraHeaders) {
  json(response, status, { error: code }, extraHeaders);
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? 'unknown';
}

async function readPayload(request) {
  const declaredLength = request.headers['content-length'];
  if (declaredLength !== undefined) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      const malformed = new Error('malformed length');
      malformed.code = 'INVALID';
      throw malformed;
    }
    if (length > MAX_PAYLOAD_BYTES) {
      const tooLarge = new Error('payload too large');
      tooLarge.code = 'TOO_LARGE';
      throw tooLarge;
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_PAYLOAD_BYTES) {
      const tooLarge = new Error('payload too large');
      tooLarge.code = 'TOO_LARGE';
      throw tooLarge;
    }
    chunks.push(chunk);
  }
  if (size === 0) {
    const empty = new Error('empty payload');
    empty.code = 'INVALID';
    throw empty;
  }
  return Buffer.concat(chunks, size);
}

function parseExpiry(request) {
  const raw = request.headers['x-share-expiry-seconds'];
  if (Array.isArray(raw) || !/^(3600|86400|604800)$/.test(raw ?? '')) return null;
  const expiry = Number(raw);
  return VALID_EXPIRIES.has(expiry) ? expiry : null;
}

export function createShareServer({
  store,
  appOrigin,
  clock = () => Math.floor(Date.now() / 1000),
  postLimit = 10,
  getLimit = 120,
} = {}) {
  if (!store) throw new TypeError('store is required');

  const postLimiter = new FixedWindowRateLimiter({ limit: postLimit });
  const getLimiter = new FixedWindowRateLimiter({ limit: getLimit });

  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (request.method === 'OPTIONS' && url.pathname === '/shares') {
        const origin = request.headers.origin;
        if (!appOrigin || origin !== appOrigin) {
          error(response, 400, 'invalid_request');
          return;
        }
        response.writeHead(204, {
          ...COMMON_HEADERS,
          'Access-Control-Allow-Origin': appOrigin,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, X-Share-Expiry-Seconds',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        });
        response.end();
        return;
      }

      if (request.method === 'POST' && url.pathname === '/shares') {
        const origin = request.headers.origin;
        if ((origin && origin !== appOrigin) ||
            request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/octet-stream' ||
            parseExpiry(request) === null) {
          error(response, 400, 'invalid_request');
          return;
        }
        if (!postLimiter.allow(clientAddress(request))) {
          error(response, 429, 'rate_limited', { 'Retry-After': '60' });
          return;
        }

        let payload;
        try {
          payload = await readPayload(request);
        } catch (readError) {
          if (readError.code === 'TOO_LARGE') {
            error(response, 413, 'payload_too_large');
          } else {
            error(response, 400, 'invalid_request');
          }
          return;
        }

        const id = randomBytes(16).toString('base64url');
        const expiresAt = clock() + parseExpiry(request);
        store.put(id, payload, expiresAt);
        json(response, 201, { id, path: `/shares/${id}`, expiresAt },
          origin ? { 'Access-Control-Allow-Origin': appOrigin, Vary: 'Origin' } : undefined);
        return;
      }

      const match = /^\/shares\/([^/]*)$/.exec(url.pathname);
      if (request.method === 'GET' && match) {
        if (!getLimiter.allow(clientAddress(request))) {
          error(response, 429, 'rate_limited', { 'Retry-After': '60' });
          return;
        }
        const id = match[1];
        const payload = ID_PATTERN.test(id) ? store.get(id, clock()) : null;
        if (!payload) {
          error(response, 404, 'not_found');
          return;
        }
        response.writeHead(200, {
          ...COMMON_HEADERS,
          'Content-Type': 'application/octet-stream',
          'Content-Length': payload.length,
        });
        response.end(payload);
        return;
      }

      error(response, 404, 'not_found');
    } catch (unexpectedError) {
      console.error(unexpectedError);
      if (!response.headersSent) error(response, 500, 'internal_error');
      else response.destroy();
    }
  });

  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
  return { server, postLimiter, getLimiter };
}
