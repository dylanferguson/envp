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

const logFields = ["time", "level", "msg", "status", "method", "route"];

const nginxRecords = (text) =>
  text.split("\n").flatMap((line) => {
    const start = line.indexOf("{");
    if (start === -1) return [];
    try {
      const rec = JSON.parse(line.slice(start));
      return rec && typeof rec === "object" && rec.msg ? [rec] : [];
    } catch {
      return [];
    }
  });

try {
  compose("up", "--build", "--wait");
  const created = await create();
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await fetch("http://127.0.0.1:8080/missing")).status, 404);
  assert.equal(
    (await fetch("http://127.0.0.1:8080/", { headers: { Host: "envp.fly.dev" } })).status,
    403,
  );
  assert.equal(
    (
      await fetch("http://127.0.0.1:8080/api/v1/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "x".repeat(200 * 1024),
      })
    ).status,
    413,
  );
  let last = 201;
  for (let n = 0; n < 20; n++) last = (await create()).status;
  assert.equal(last, 429);

  const raw = compose("logs", "--no-color", "nginx");
  const records = nginxRecords(raw);
  assert.ok(
    records.some(
      (rec) => rec.msg === "payload too large" && rec.status === 413 && rec.route === "create",
    ),
  );
  assert.ok(
    records.some(
      (rec) => rec.msg === "rate limited" && rec.status === 429 && rec.route === "create",
    ),
  );
  assert.ok(
    !records.some(
      (rec) => rec.status === 200 || rec.status === 201 || rec.status === 403 || rec.status === 404,
    ),
  );
  assert.ok(!raw.includes(id));
  assert.ok(!raw.includes('"GET / HTTP/1.1"'));
  for (const rec of records) {
    assert.deepEqual(Object.keys(rec).sort(), [...logFields].sort());
  }
  console.log("ok");
} finally {
  compose("down", "--volumes");
}
