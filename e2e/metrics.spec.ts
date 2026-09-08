import { expect, test } from "@playwright/test";

const INTERNAL_URL = "http://127.0.0.1:9090";

test("keeps health and metrics off the public port", async ({ request }) => {
  expect((await request.get("/health")).status()).toBe(404);
  expect((await request.get("/metrics")).status()).toBe(404);
  expect((await request.get("/stub_status")).status()).toBe(404);

  const health = await fetch(`${INTERNAL_URL}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({ status: "pass" });

  const metrics = await fetch(`${INTERNAL_URL}/metrics`);
  expect(metrics.status).toBe(200);
  const body = await metrics.text();
  expect(body).toContain("shares_created_total");
  expect(body).toMatch(/^nginx_up 1(\.0)?$/m);
});
