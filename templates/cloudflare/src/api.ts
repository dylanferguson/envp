import { readLimitedBody, bytesToUtf8 } from "./body.ts";
import { base64urlDecode, base64urlEncode } from "./bytes.ts";
import {
  errForbidden,
  errInternal,
  errInvalidRequest,
  errPayloadTooLarge,
  errShareNotFound,
  jsonResponse,
} from "./http.ts";
import {
  MAX_CREATE_JSON_BYTES,
  MAX_MAX_READS,
  MAX_SHARE_BYTES,
  MAX_TTL_SECONDS,
  MIN_MAX_READS,
  MIN_TTL_SECONDS,
  SWEEP_BATCH,
  parseShareId,
} from "./limits.ts";
import { originAllowed } from "./origin.ts";
import { newUlid } from "./ulid.ts";

type CreateBody = {
  ttl_seconds?: unknown;
  max_reads?: unknown;
  envelope?: unknown;
};

type ShareRow = {
  envelope: string;
  expires_at: number;
};

export async function createShare(request: Request, env: Env): Promise<Response> {
  if (!originAllowed(request, env.PUBLIC_ORIGIN)) {
    console.log(JSON.stringify({ msg: "origin rejected", method: request.method }));
    return errForbidden(request.method);
  }
  const raw = await readLimitedBody(request, MAX_CREATE_JSON_BYTES);
  if (raw === "too_large") {
    return errPayloadTooLarge(request.method);
  }
  let parsed: CreateBody;
  try {
    parsed = JSON.parse(bytesToUtf8(raw)) as CreateBody;
  } catch {
    return errInvalidRequest(request.method);
  }
  const ttl = parseIntField(parsed.ttl_seconds, MIN_TTL_SECONDS, MAX_TTL_SECONDS);
  const maxReads = parseIntField(parsed.max_reads, MIN_MAX_READS, MAX_MAX_READS);
  if (ttl === null || maxReads === null || typeof parsed.envelope !== "string") {
    return errInvalidRequest(request.method);
  }
  const envelope = base64urlDecode(parsed.envelope);
  if (envelope === null || envelope.byteLength === 0 || envelope.byteLength > MAX_SHARE_BYTES) {
    return errInvalidRequest(request.method);
  }
  const encoded = base64urlEncode(envelope);
  const now = Date.now();
  const id = newUlid(now);
  const expiresAt = now + ttl * 1000;
  try {
    await env.DB.prepare(
      "INSERT INTO shares (id, envelope, expires_at, remaining_reads) VALUES (?, ?, ?, ?)",
    )
      .bind(id, encoded, expiresAt, maxReads)
      .run();
  } catch (error) {
    console.error(JSON.stringify({ msg: "create share failed", error: String(error) }));
    return errInternal(request.method);
  }
  return jsonResponse(
    201,
    { id, expires_at: expiresAt, max_reads: maxReads },
    { Location: `/api/v1/shares/${id}` },
  );
}

export async function readShare(request: Request, env: Env, rawId: string): Promise<Response> {
  const id = parseShareId(rawId);
  if (id === null) {
    return errShareNotFound(request.method);
  }
  const now = Date.now();
  if (request.method === "HEAD") {
    try {
      const row = await env.DB.prepare(
        "SELECT 1 AS ok FROM shares WHERE id = ? AND expires_at > ? AND remaining_reads > 0",
      )
        .bind(id, now)
        .first();
      if (!row) {
        return errShareNotFound(request.method);
      }
    } catch (error) {
      console.error(JSON.stringify({ msg: "peek share failed", error: String(error) }));
      return errInternal(request.method);
    }
    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(null, { status: 200, headers });
  }
  let row: ShareRow | null;
  try {
    row = await env.DB.prepare(
      `UPDATE shares SET remaining_reads = remaining_reads - 1
       WHERE id = ? AND expires_at > ? AND remaining_reads > 0
       RETURNING envelope, expires_at`,
    )
      .bind(id, now)
      .first<ShareRow>();
  } catch (error) {
    console.error(JSON.stringify({ msg: "consume share failed", error: String(error) }));
    return errInternal(request.method);
  }
  if (!row || typeof row.envelope !== "string" || row.envelope.length === 0) {
    return errShareNotFound(request.method);
  }
  return jsonResponse(200, {
    id,
    expires_at: row.expires_at,
    envelope: row.envelope,
  });
}

export async function sweep(db: D1Database): Promise<number> {
  const now = Date.now();
  let total = 0;
  for (;;) {
    const result = await db
      .prepare(
        `DELETE FROM shares
         WHERE id IN (
           SELECT id FROM shares
           WHERE expires_at <= ? OR remaining_reads <= 0
           LIMIT ?
         )`,
      )
      .bind(now, SWEEP_BATCH)
      .run();
    const changes = result.meta.changes ?? 0;
    total += changes;
    if (changes < SWEEP_BATCH) {
      return total;
    }
  }
}

function parseIntField(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < min || value > max) {
    return null;
  }
  return value;
}
