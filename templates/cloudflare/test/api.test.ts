import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vite-plus/test";
import worker from "../src/index.ts";
import { MAX_CREATE_JSON_BYTES, MAX_SHARE_BYTES } from "../src/limits.ts";
import { newUlid } from "../src/ulid.ts";

const ENVELOPE = "AQID_w";

async function createShare(
  body: string,
  headers: HeadersInit = { "Content-Type": "application/json" },
): Promise<Response> {
  return exports.default.fetch("http://localhost/api/v1/shares", {
    method: "POST",
    headers,
    body,
  });
}

describe("ulid", () => {
  it("is 26 crockford characters starting with 0-7", () => {
    const id = newUlid(Date.parse("2026-09-10T00:00:00Z"));
    expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  });
});

describe("shares API", () => {
  it("creates and reads a share", async () => {
    const before = Date.now();
    const created = await createShare(
      JSON.stringify({ ttl_seconds: 3600, max_reads: 20, envelope: ENVELOPE }),
    );
    expect(created.status).toBe(201);
    const payload = (await created.json()) as {
      id: string;
      expires_at: number;
      max_reads: number;
    };
    expect(payload.max_reads).toBe(20);
    expect(payload.id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(payload.expires_at).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(JSON.stringify(payload)).not.toContain("envelope");
    expect(created.headers.get("Location")).toBe(`/api/v1/shares/${payload.id}`);

    const read = await exports.default.fetch(
      `http://localhost/api/v1/shares/${payload.id.toLowerCase()}`,
    );
    expect(read.status).toBe(200);
    expect(read.headers.get("Cache-Control")).toBe("no-store");
    expect(read.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const got = (await read.json()) as {
      id: string;
      expires_at: number;
      envelope: string;
      max_reads?: number;
    };
    expect(got.id).toBe(payload.id);
    expect(got.expires_at).toBe(payload.expires_at);
    expect(got.envelope).toBe(ENVELOPE);
    expect(got.max_reads).toBeUndefined();
  });

  it("rejects invalid creates", async () => {
    for (const body of [
      "{",
      `{"ttl_seconds":30,"max_reads":20,"envelope":"AQ"}`,
      `{"ttl_seconds":60,"envelope":"AQ"}`,
      `{"ttl_seconds":60,"max_reads":0,"envelope":"AQ"}`,
      `{"ttl_seconds":60,"max_reads":20,"envelope":"!AQ"}`,
    ]) {
      const response = await createShare(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "invalid_request", message: "The request could not be processed." },
      });
    }
    const extra = await createShare(
      JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQ", extra: true }),
    );
    expect(extra.status).toBe(201);
  });

  it("enforces envelope and body limits", async () => {
    const atLimit = await createShare(
      JSON.stringify({
        ttl_seconds: 60,
        max_reads: 20,
        envelope: base64url(new Uint8Array(MAX_SHARE_BYTES)),
      }),
    );
    expect(atLimit.status).toBe(201);

    const over = await createShare(
      JSON.stringify({
        ttl_seconds: 60,
        max_reads: 20,
        envelope: base64url(new Uint8Array(MAX_SHARE_BYTES + 1)),
      }),
    );
    expect(over.status).toBe(400);

    const tooLarge = await exports.default.fetch("http://localhost/api/v1/shares", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(MAX_CREATE_JSON_BYTES + 1),
      },
      body: " ".repeat(MAX_CREATE_JSON_BYTES + 1),
    });
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({
      error: { code: "payload_too_large", message: "Request body is too large." },
    });
  });

  it("returns the same 404 for missing, expired, and invalid ids", async () => {
    await env.DB.prepare(
      "INSERT INTO shares (id, envelope, expires_at, remaining_reads) VALUES (?, ?, ?, ?)",
    )
      .bind("01H2XCEJQTF2NBREXX3VQJHP41", "AQ", Date.now() - 60_000, 20)
      .run();
    for (const id of [
      "01H2XCEJQTF2NBREXX3VQJHP41",
      "00000000000000000000000000",
      "invalid",
      "share_01h2xcejqtf2nbrexx3vqjhp41",
    ]) {
      const response = await exports.default.fetch(`http://localhost/api/v1/shares/${id}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Share not found." },
      });
    }
  });

  it("rejects cross-origin creates", async () => {
    const missing = await createShare(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`);
    expect(missing.status).toBe(201);

    const same = await createShare(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`, {
      "Content-Type": "application/json",
      Origin: "http://localhost",
    });
    expect(same.status).toBe(201);

    const cross = await createShare(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`, {
      "Content-Type": "application/json",
      Origin: "http://evil.example",
    });
    expect(cross.status).toBe(403);
    expect(await cross.json()).toEqual({
      error: { code: "forbidden", message: "The request origin is not allowed." },
    });
  });

  it("404s unknown API routes", async () => {
    const response = await exports.default.fetch("http://localhost/api/v1/missing");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });

  it("HEAD does not consume remaining reads", async () => {
    const created = await createShare(
      JSON.stringify({ ttl_seconds: 3600, max_reads: 1, envelope: ENVELOPE }),
    );
    const payload = (await created.json()) as { id: string };
    for (let i = 0; i < 5; i++) {
      const head = await exports.default.fetch(`http://localhost/api/v1/shares/${payload.id}`, {
        method: "HEAD",
      });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    }
    const first = await exports.default.fetch(`http://localhost/api/v1/shares/${payload.id}`);
    expect(first.status).toBe(200);
    const second = await exports.default.fetch(`http://localhost/api/v1/shares/${payload.id}`);
    expect(second.status).toBe(404);
  });

  it("exhausted shares look missing", async () => {
    const created = await createShare(
      JSON.stringify({ ttl_seconds: 3600, max_reads: 1, envelope: ENVELOPE }),
    );
    const payload = (await created.json()) as { id: string };
    expect(
      (await exports.default.fetch(`http://localhost/api/v1/shares/${payload.id}`)).status,
    ).toBe(200);
    const exhausted = await exports.default.fetch(`http://localhost/api/v1/shares/${payload.id}`);
    const unknown = await exports.default.fetch(
      "http://localhost/api/v1/shares/00000000000000000000000000",
    );
    expect(exhausted.status).toBe(unknown.status);
    expect(await exhausted.text()).toBe(await unknown.text());
  });

  it("sweep removes expired and exhausted rows", async () => {
    await env.DB.prepare(
      "INSERT INTO shares (id, envelope, expires_at, remaining_reads) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
    )
      .bind(
        "01EXPIRED00000000000000000",
        "AQ",
        Date.now() - 1000,
        5,
        "01EXHAUST00000000000000000",
        "AQ",
        Date.now() + 3_600_000,
        0,
      )
      .run();

    await worker.scheduled({ scheduledTime: Date.now(), cron: "* * * * *", noRetry() {} }, env);

    const expired = await env.DB.prepare("SELECT id FROM shares WHERE id = ?")
      .bind("01EXPIRED00000000000000000")
      .first();
    const exhausted = await env.DB.prepare("SELECT id FROM shares WHERE id = ?")
      .bind("01EXHAUST00000000000000000")
      .first();
    expect(expired).toBeNull();
    expect(exhausted).toBeNull();
  });

  it("serves open.html for share links", async () => {
    const response = await exports.default.fetch(
      "http://localhost/share/01H2XCEJQTF2NBREXX3VQJHP41",
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("envp · open");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
