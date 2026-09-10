const MIN_TTL = 60;
const MAX_TTL = 86400;
const MIN_READS = 1;
const MAX_READS = 100;
const MAX_SHARE = 65570;
const MAX_JSON = 64 + Math.floor((MAX_SHARE * 4 + 2) / 3);
const SWEEP_BATCH = 500;
const ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const ABC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error(JSON.stringify({ msg: "request failed", error: String(error) }));
      return fail(500, "internal_error");
    }
  },
  async scheduled(_controller, env) {
    const now = Date.now();
    for (;;) {
      const result = await env.DB.prepare(
        `DELETE FROM shares WHERE id IN (
           SELECT id FROM shares WHERE expires_at <= ? OR remaining_reads <= 0 LIMIT ?
         )`,
      )
        .bind(now, SWEEP_BATCH)
        .run();
      if ((result.meta.changes ?? 0) < SWEEP_BATCH) {
        return;
      }
    }
  },
} satisfies ExportedHandler<Env>;

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/v1/shares" && request.method === "POST") {
    return create(request, env);
  }
  const get = path.match(/^\/api\/v1\/shares\/([^/]+)$/);
  if (get && request.method === "GET") {
    return read(env, get[1] ?? "");
  }
  if (path.startsWith("/api/")) {
    return fail(404, "not_found");
  }
  if (/^\/share\/[^/]+\/?$/.test(path)) {
    const page = await env.ASSETS.fetch(new URL("/open.html", url));
    const headers = new Headers(page.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Content-Security-Policy", CSP);
    return new Response(page.body, { status: page.status, headers });
  }
  return env.ASSETS.fetch(request);
}

async function create(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const expected = (env.PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
  if (origin && origin !== expected) {
    return fail(403, "forbidden");
  }
  const length = Number(request.headers.get("Content-Length") ?? NaN);
  if (Number.isFinite(length) && length > MAX_JSON) {
    return fail(413, "payload_too_large");
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_JSON) {
    return fail(413, "payload_too_large");
  }
  let body: { ttl_seconds?: unknown; max_reads?: unknown; envelope?: unknown };
  try {
    body = JSON.parse(new TextDecoder().decode(buf)) as typeof body;
  } catch {
    return fail(400, "invalid_request");
  }
  const ttl = intField(body.ttl_seconds, MIN_TTL, MAX_TTL);
  const reads = intField(body.max_reads, MIN_READS, MAX_READS);
  const size = b64urlSize(typeof body.envelope === "string" ? body.envelope : "");
  if (ttl === null || reads === null || size === null || size < 1 || size > MAX_SHARE) {
    return fail(400, "invalid_request");
  }
  const now = Date.now();
  const id = ulid(now);
  const expiresAt = now + ttl * 1000;
  await env.DB.prepare(
    "INSERT INTO shares (id, envelope, expires_at, remaining_reads) VALUES (?, ?, ?, ?)",
  )
    .bind(id, body.envelope, expiresAt, reads)
    .run();
  return json(
    201,
    { id, expires_at: expiresAt, max_reads: reads },
    { Location: `/api/v1/shares/${id}` },
  );
}

async function read(env: Env, rawId: string): Promise<Response> {
  if (!ID_RE.test(rawId)) {
    return fail(404, "share");
  }
  const row = await env.DB.prepare(
    `UPDATE shares SET remaining_reads = remaining_reads - 1
     WHERE id = ? AND expires_at > ? AND remaining_reads > 0
     RETURNING envelope, expires_at`,
  )
    .bind(rawId.toUpperCase(), Date.now())
    .first<{ envelope: string; expires_at: number }>();
  if (!row?.envelope) {
    return fail(404, "share");
  }
  return json(200, { id: rawId.toUpperCase(), expires_at: row.expires_at, envelope: row.envelope });
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body) + "\n", {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

function fail(
  status: number,
  code:
    | "invalid_request"
    | "forbidden"
    | "not_found"
    | "payload_too_large"
    | "internal_error"
    | "share",
): Response {
  const messages = {
    invalid_request: "The request could not be processed.",
    forbidden: "The request origin is not allowed.",
    not_found: "Not found.",
    share: "Share not found.",
    payload_too_large: "Request body is too large.",
    internal_error: "The request could not be processed.",
  };
  return json(status, {
    error: { code: code === "share" ? "not_found" : code, message: messages[code] },
  });
}

function intField(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

function b64urlSize(value: string): number | null {
  if (value === "" || /[^A-Za-z0-9_-]/.test(value)) {
    return null;
  }
  try {
    return atob(
      value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4),
    ).length;
  } catch {
    return null;
  }
}

function ulid(now: number): string {
  let time = Math.floor(now);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out = ABC[time % 32] + out;
    time = Math.floor(time / 32);
  }
  let bits = 0n;
  for (const byte of crypto.getRandomValues(new Uint8Array(10))) {
    bits = (bits << 8n) | BigInt(byte);
  }
  for (let i = 0; i < 16; i++) {
    out += ABC[Number((bits >> BigInt(5 * (15 - i))) & 31n)];
  }
  return out;
}
