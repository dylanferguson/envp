import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import http from "node:http";
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

  const flyDev = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 8080,
        method: "POST",
        path: "/api/v1/shares",
        headers: {
          Host: "envp.fly.dev",
          "Content-Type": "application/json",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ ttl_seconds: 60, max_reads: 20, envelope: "AQID_w" }));
  });
  assert.equal(flyDev, 403);

  const home = await fetch("http://127.0.0.1:8080/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<html/i);

  const robots = await fetch("http://127.0.0.1:8080/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \//);

  const open = await fetch("http://127.0.0.1:8080/open");
  assert.equal(open.status, 200);
  assert.match(await open.text(), /<html/i);

  const share = await fetch("http://127.0.0.1:8080/share/any-id");
  assert.equal(share.status, 200);
  assert.match(await share.text(), /<html/i);

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
