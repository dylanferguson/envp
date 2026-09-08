import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

compose("up", "--build", "--detach");

async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:8080/", { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name !== "TimeoutError" && name !== "AbortError" && !(error instanceof TypeError)) {
        throw error;
      }
    }
    await setTimeout(250);
  }
  throw new Error("nginx front door did not become ready");
}

try {
  await ready();

  const flyDev = execFileSync(
    "curl",
    [
      "-sS",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "-X",
      "POST",
      "-H",
      "Host: envp.fly.dev",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQID_w" }),
      "http://127.0.0.1:8080/api/v1/shares",
    ],
    { encoding: "utf8" },
  );
  assert.equal(flyDev, "403");

  const first = await fetch("http://127.0.0.1:8080/api/v1/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQID_w" }),
  });
  assert.equal(first.status, 201);

  let last = first;
  for (let n = 0; n < 20; n++) {
    last = await fetch("http://127.0.0.1:8080/api/v1/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQID_w" }),
    });
  }
  assert.equal(last.status, 429);
  const body = await last.json();
  assert.equal(body.error.code, "rate_limited");
  console.log("ok");
} finally {
  compose("down", "--volumes");
}
