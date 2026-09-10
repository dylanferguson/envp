import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vite-plus/test";
import worker from "../src/index.ts";

const ENVELOPE = "AQID_w";
const MAX_SHARE = 65570;
const MAX_JSON = 64 + Math.floor((MAX_SHARE * 4 + 2) / 3);

function post(body: string, headers: HeadersInit = { "Content-Type": "application/json" }) {
  return exports.default.fetch("http://localhost/api/v1/shares", { method: "POST", headers, body });
}

function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

describe("shares API", () => {
  it("creates and reads a share", async () => {
    const before = Date.now();
    const created = await post(
      JSON.stringify({ ttl_seconds: 3600, max_reads: 20, envelope: ENVELOPE }),
    );
    expect(created.status).toBe(201);
    const payload = (await created.json()) as { id: string; expires_at: number; max_reads: number };
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
    const got = (await read.json()) as { id: string; envelope: string; max_reads?: number };
    expect(got.id).toBe(payload.id);
    expect(got.envelope).toBe(ENVELOPE);
    expect(got.max_reads).toBeUndefined();
  });

  it("rejects bad input, oversize bodies, and other origins", async () => {
    for (const body of [
      "{",
      `{"ttl_seconds":30,"max_reads":20,"envelope":"AQ"}`,
      `{"ttl_seconds":60,"envelope":"AQ"}`,
      `{"ttl_seconds":60,"max_reads":0,"envelope":"AQ"}`,
      `{"ttl_seconds":60,"max_reads":20,"envelope":"!AQ"}`,
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(
      (await post(JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQ", extra: true })))
        .status,
    ).toBe(201);
    expect(
      (
        await post(
          JSON.stringify({
            ttl_seconds: 60,
            max_reads: 20,
            envelope: b64url(new Uint8Array(MAX_SHARE)),
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await post(
          JSON.stringify({
            ttl_seconds: 60,
            max_reads: 20,
            envelope: b64url(new Uint8Array(MAX_SHARE + 1)),
          }),
        )
      ).status,
    ).toBe(400);
    const tooLarge = await post(" ".repeat(MAX_JSON + 1), {
      "Content-Type": "application/json",
      "Content-Length": String(MAX_JSON + 1),
    });
    expect(tooLarge.status).toBe(413);
    expect((await post(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`)).status).toBe(201);
    expect(
      (
        await post(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`, {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(`{"ttl_seconds":60,"max_reads":20,"envelope":"AQ"}`, {
          "Content-Type": "application/json",
          Origin: "http://evil.example",
        })
      ).status,
    ).toBe(403);
    const missing = await exports.default.fetch("http://localhost/api/v1/missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });

  it("treats expired, exhausted, and unknown ids the same", async () => {
    await env.DB.prepare(
      "INSERT INTO shares (id, envelope, expires_at, remaining_reads) VALUES (?, ?, ?, ?)",
    )
      .bind("01H2XCEJQTF2NBREXX3VQJHP41", "AQ", Date.now() - 60_000, 20)
      .run();
    const created = await post(
      JSON.stringify({ ttl_seconds: 3600, max_reads: 1, envelope: ENVELOPE }),
    );
    const { id } = (await created.json()) as { id: string };
    expect((await exports.default.fetch(`http://localhost/api/v1/shares/${id}`)).status).toBe(200);
    const exhausted = await exports.default.fetch(`http://localhost/api/v1/shares/${id}`);
    const unknown = await exports.default.fetch(
      "http://localhost/api/v1/shares/00000000000000000000000000",
    );
    expect(exhausted.status).toBe(404);
    expect(await exhausted.text()).toBe(await unknown.text());
    for (const missing of ["01H2XCEJQTF2NBREXX3VQJHP41", "invalid"]) {
      const response = await exports.default.fetch(`http://localhost/api/v1/shares/${missing}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Share not found." },
      });
    }
  });

  it("sweep deletes expired and exhausted rows", async () => {
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
    expect(
      await env.DB.prepare("SELECT id FROM shares WHERE id = ?")
        .bind("01EXPIRED00000000000000000")
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM shares WHERE id = ?")
        .bind("01EXHAUST00000000000000000")
        .first(),
    ).toBeNull();
  });

  it("serves open.html for share links", async () => {
    const response = await exports.default.fetch(
      "http://localhost/share/01H2XCEJQTF2NBREXX3VQJHP41",
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("envp · open");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });
});
