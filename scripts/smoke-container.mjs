import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const image = process.argv[2] ?? "env-share:go-scratch";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
const name = `env-share-smoke-${process.pid}`;
const container = docker("run", "--detach", "--name", name, "--publish", "127.0.0.1::8080", image);

async function ready(baseURL) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch {
      // The process may still be starting or draining connections after restart.
    }
    await setTimeout(100);
  }
  throw new Error("Container did not become ready");
}

try {
  const address = docker("port", container, "8080/tcp");
  const baseURL = `http://${address}`;
  const html = await ready(baseURL);
  assert.equal(html.headers.get("cache-control"), "no-cache");
  assert.match(await html.text(), /<html/);
  assert.equal(docker("inspect", "--format", "{{.Config.User}}", container), "65532:65532");

  const create = await fetch(`${baseURL}/api/v1/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL },
    body: JSON.stringify({ ttl_seconds: 60, envelope: "AQID_w" }),
  });
  assert.equal(create.status, 201);
  const share = await create.json();
  assert.match(share.id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(create.headers.get("location"), `/api/v1/shares/${share.id}`);

  docker("restart", "--time", "15", container);
  await ready(baseURL);
  const read = await fetch(`${baseURL}/api/v1/shares/${share.id}`);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.deepEqual(await read.json(), { ...share, envelope: "AQID_w" });

  docker("stop", "--time", "15", container);
  assert.equal(docker("inspect", "--format", "{{.State.ExitCode}}", container), "0");
  console.log(
    "Container passed: embedded UI, non-root SQLite writes, persistence, graceful shutdown.",
  );
} finally {
  docker("rm", "--force", "--volumes", container);
}
