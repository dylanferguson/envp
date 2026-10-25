import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const gitCommit =
  process.env.GIT_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
// Same length as the production token (openssl rand -hex 24).
const originToken = process.env.X_ORIGIN_TOKEN || "0123456789abcdef".repeat(3);
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: "envp-nginx-smoke",
  GIT_COMMIT: gitCommit,
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

try {
  compose("up", "--build", "--wait");

  // Without the edge-injected token nginx fails closed.
  const bare = await fetch("http://127.0.0.1:8080/");
  assert.equal(bare.status, 403);
  assert.equal((await create({ "X-Origin-Token": "not-the-token" })).status, 403);

  assert.equal((await create()).status, 201);
  let last = 201;
  for (let n = 0; n < 20; n++) last = (await create()).status;
  assert.equal(last, 429);

  // Spoofed CF-Connecting-IP behind a non-Cloudflare Fly-Client-IP: every
  // request must share the bucket keyed on Fly-Client-IP.
  last = 201;
  for (let n = 0; n < 20; n++) {
    last = (await create({ "Fly-Client-Ip": "203.0.113.7", "Cf-Connecting-Ip": `198.51.100.${n}` }))
      .status;
  }
  assert.equal(last, 429);

  // Via Cloudflare (Fly-Client-IP in a CF range): each CF-Connecting-IP is
  // its own bucket.
  for (let n = 0; n < 20; n++) {
    const status = (
      await create({ "Fly-Client-Ip": "104.16.1.1", "Cf-Connecting-Ip": `198.51.100.${n}` })
    ).status;
    assert.equal(status, 201);
  }
  console.log("ok");
} finally {
  compose("down", "--volumes");
}
