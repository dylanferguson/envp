import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const image = process.argv[2] ?? "envp:go-scratch";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
const name = `envp-smoke-${process.pid}`;
const container = docker(
  "run",
  "--detach",
  "--name",
  name,
  "--publish",
  "127.0.0.1::8080",
  "--publish",
  "127.0.0.1::9090",
  image,
);

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
  throw new Error(`Container did not become ready at ${baseURL}`);
}

function publishedURL(containerPort) {
  return `http://${docker("port", container, `${containerPort}/tcp`)}`;
}

try {
  const baseURL = publishedURL(8080);
  const obsURL = publishedURL(9090);
  const html = await ready(baseURL);
  assert.match(await html.text(), /<html/);

  const publicHealth = await fetch(`${baseURL}/health`);
  assert.equal(publicHealth.status, 404);
  const publicMetrics = await fetch(`${baseURL}/metrics`);
  assert.equal(publicMetrics.status, 404);

  const health = await fetch(`${obsURL}/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.status, "pass");

  const create = await fetch(`${baseURL}/api/v1/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60, envelope: "AQID_w" }),
  });
  assert.equal(create.status, 201);
  const { id } = await create.json();

  const metrics = await fetch(`${obsURL}/metrics`);
  assert.equal(metrics.status, 200);
  const metricsBody = await metrics.text();
  assert.match(metricsBody, /http_requests_total/);
  assert.match(metricsBody, /shares_created_total/);

  docker("restart", "--time", "15", container);
  const afterRestart = publishedURL(8080);
  await ready(afterRestart);
  const read = await fetch(`${afterRestart}/api/v1/shares/${id}`);
  assert.equal(read.status, 200);

  docker("stop", "--time", "15", container);
  assert.equal(docker("inspect", "--format", "{{.State.ExitCode}}", container), "0");
  console.log("ok");
} finally {
  docker("rm", "--force", "--volumes", container);
}
