import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { ulid } from "ulidx";

const MIN_TTL = 60;
const MAX_TTL = 86400;
const MIN_READS = 1;
const MAX_READS = 100;
const MAX_SHARE = 65570;
const MAX_JSON = 64 + Math.floor((MAX_SHARE * 4 + 2) / 3);
const SWEEP_BATCH = 500;
const ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.status === 400 ? fail(c, 400, "invalid_request") : error.getResponse();
  }
  console.error(JSON.stringify({ msg: "request failed", error: String(error) }));
  return fail(c, 500, "internal_error");
});

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});

app.post(
  "/api/v1/shares",
  async (c, next) => {
    const origin = c.req.header("Origin");
    const expected = (c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin).replace(/\/$/, "");
    if (origin && origin !== expected) {
      return fail(c, 403, "forbidden");
    }
    await next();
  },
  bodyLimit({
    maxSize: MAX_JSON,
    onError: (c) => fail(c, 413, "payload_too_large"),
  }),
  validator("json", (value, c) => parseCreate(value) ?? fail(c, 400, "invalid_request")),
  async (c) => {
    const { ttl_seconds, max_reads, envelope } = c.req.valid("json");
    const now = Date.now();
    const id = ulid(now);
    const expiresAt = now + ttl_seconds * 1000;
    await c.env.DB.prepare(
      "INSERT INTO shares (id, envelope, expires_at, remaining_reads) VALUES (?, ?, ?, ?)",
    )
      .bind(id, envelope, expiresAt, max_reads)
      .run();
    c.header("Location", `/api/v1/shares/${id}`);
    return c.json({ id, expires_at: expiresAt, max_reads }, 201);
  },
);

app.get("/api/v1/shares/:id", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) {
    return fail(c, 404, "share");
  }
  const row = await c.env.DB.prepare(
    `UPDATE shares SET remaining_reads = remaining_reads - 1
     WHERE id = ? AND expires_at > ? AND remaining_reads > 0
     RETURNING envelope, expires_at`,
  )
    .bind(id.toUpperCase(), Date.now())
    .first<{ envelope: string; expires_at: number }>();
  if (!row?.envelope) {
    return fail(c, 404, "share");
  }
  return c.json({ id: id.toUpperCase(), expires_at: row.expires_at, envelope: row.envelope });
});

app.all("/api/*", (c) => fail(c, 404, "not_found"));

app.get("/share/:id", async (c) => {
  const page = await c.env.ASSETS.fetch(new URL("/open.html", c.req.url));
  const headers = new Headers(page.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Content-Security-Policy", CSP);
  return new Response(page.body, { status: page.status, headers });
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
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

function parseCreate(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { ttl_seconds, max_reads, envelope } = value as Record<string, unknown>;
  if (!intIn(ttl_seconds, MIN_TTL, MAX_TTL) || !intIn(max_reads, MIN_READS, MAX_READS)) {
    return null;
  }
  if (typeof envelope !== "string" || !isEnvelope(envelope)) {
    return null;
  }
  return { ttl_seconds, max_reads, envelope };
}

function intIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isEnvelope(value: string): boolean {
  if (value === "" || /[^A-Za-z0-9_-]/.test(value)) {
    return false;
  }
  try {
    const size = atob(
      value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4),
    ).length;
    return size >= 1 && size <= MAX_SHARE;
  } catch {
    return false;
  }
}

function fail(
  c: Context<{ Bindings: Env }>,
  status: 400 | 403 | 404 | 413 | 500,
  code:
    | "invalid_request"
    | "forbidden"
    | "not_found"
    | "payload_too_large"
    | "internal_error"
    | "share",
) {
  const messages = {
    invalid_request: "The request could not be processed.",
    forbidden: "The request origin is not allowed.",
    not_found: "Not found.",
    share: "Share not found.",
    payload_too_large: "Request body is too large.",
    internal_error: "The request could not be processed.",
  };
  return c.json(
    { error: { code: code === "share" ? "not_found" : code, message: messages[code] } },
    status,
  );
}
