import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

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
  compose("up", "--build", "--detach");
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:8080/", { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name !== "TimeoutError" && name !== "AbortError" && !(error instanceof TypeError)) {
        throw error;
      }
    }
    if (attempt === 79) throw new Error("nginx did not become ready");
    await setTimeout(250);
  }

  assert.equal((await create()).status, 201);
  let last = 201;
  for (let n = 0; n < 20; n++) last = (await create()).status;
  assert.equal(last, 429);
  console.log("ok");
} finally {
  compose("down", "--volumes");
}
