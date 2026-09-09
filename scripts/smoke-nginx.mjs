import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const gitCommit =
  process.env.GIT_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: "envp-nginx-smoke",
  GIT_COMMIT: gitCommit,
};
const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const create = () =>
  fetch("http://127.0.0.1:8080/api/v1/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQID_w" }),
  });

const invalidCreate = () =>
  fetch("http://127.0.0.1:8080/api/v1/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 1, max_reads: 1, envelope: "AQ" }),
  });

const read = () => fetch("http://127.0.0.1:8080/api/v1/shares/01AAAAAAAAAAAAAAAAAAAAAAAA");

async function firstLimited(send, n) {
  for (let i = 0; i < n; i++) {
    const response = await send();
    if (response.status === 429) {
      return response;
    }
  }
  return null;
}

async function assertLimited(response, retryAfter) {
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), retryAfter);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/);
  const body = await response.json();
  assert.equal(body.error?.code, "rate_limited");
}

try {
  compose("up", "--build", "--wait");
  assert.equal((await create()).status, 201);
  const created = await firstLimited(invalidCreate, 20);
  assert.ok(created, "expected create 429");
  await assertLimited(created, "2");
  const reads = await Promise.all(Array.from({ length: 80 }, () => read()));
  const readLimited = reads.find((response) => response.status === 429);
  assert.ok(readLimited, "expected read 429");
  await assertLimited(readLimited, "1");
  console.log("ok");
} finally {
  compose("down", "--volumes");
}
