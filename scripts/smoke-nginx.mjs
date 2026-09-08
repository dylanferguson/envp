import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const create = () =>
  fetch("http://127.0.0.1:8080/api/v1/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQID_w" }),
  });

try {
  compose("up", "--build", "--wait");
  assert.equal((await create()).status, 201);
  let last = 201;
  for (let n = 0; n < 20; n++) last = (await create()).status;
  assert.equal(last, 429);
  console.log("ok");
} finally {
  compose("down", "--volumes");
}
