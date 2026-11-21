import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Same length as the production token (openssl rand -hex 24).
const originToken = process.env.X_ORIGIN_TOKEN || "0123456789abcdef".repeat(3);
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: "envp-nginx-smoke",
  X_ORIGIN_TOKEN: originToken,
};
const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const create = (headers = {}) =>
  fetch("http://127.0.0.1:8080/api/v1/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Origin-Token": originToken, ...headers },
    body: JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQID_w" }),
  });

function assertSecurityHeaders(response, label) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", `${label}: nosniff`);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer", `${label}: referrer-policy`);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${label}: x-robots-tag`);
  assert.ok(response.headers.get("content-security-policy"), `${label}: csp`);
}

try {
  compose("up", "--wait");

  // Without the edge-injected token nginx fails closed.
  const bare = await fetch("http://127.0.0.1:8080/");
  assert.equal(bare.status, 403);
  assertSecurityHeaders(bare, "403 bare");
  assert.equal((await create({ "X-Origin-Token": "not-the-token" })).status, 403);

  // /open/ trailing slash and security headers including conditional HSTS.
  const openSlash = await fetch("http://127.0.0.1:8080/open/", {
    headers: { "X-Origin-Token": originToken },
  });
  assert.equal(openSlash.status, 200);
  assertSecurityHeaders(openSlash, "/open/");
  assert.equal(openSlash.headers.get("strict-transport-security"), null);

  const httpsRoot = await fetch("http://127.0.0.1:8080/", {
    headers: { "X-Origin-Token": originToken, "X-Forwarded-Proto": "https" },
  });
  assert.equal(httpsRoot.status, 200);
  assert.match(httpsRoot.headers.get("strict-transport-security") ?? "", /max-age=31536000/);

  const created = await create();
  assert.equal(created.status, 201);
  assertSecurityHeaders(created, "201 create");

  let lastResp = created;
  for (let n = 0; n < 20; n++) lastResp = await create();
  assert.equal(lastResp.status, 429);
  assertSecurityHeaders(lastResp, "429 create");

  // Without CF-Connecting-IP, requests fall back to Fly-Client-IP.
  let last = 201;
  for (let n = 0; n < 20; n++) {
    last = (await create({ "Fly-Client-Ip": "203.0.113.7" })).status;
  }
  assert.equal(last, 429);

  // With CF-Connecting-IP, each visitor IP gets its own bucket.
  for (let n = 0; n < 20; n++) {
    const status = (
      await create({ "Fly-Client-Ip": "203.0.113.8", "Cf-Connecting-Ip": `198.51.100.${n}` })
    ).status;
    assert.equal(status, 201);
  }

  // Repeated requests from the same CF-Connecting-IP share a bucket and hit 429.
  last = 201;
  for (let n = 0; n < 20; n++) {
    last = (await create({ "Fly-Client-Ip": "203.0.113.9", "Cf-Connecting-Ip": "198.51.100.99" }))
      .status;
  }
  assert.equal(last, 429);
  console.log("ok");
} finally {
  compose("down", "--volumes");
}
