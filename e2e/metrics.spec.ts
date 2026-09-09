import { expect, test } from "@playwright/test";

const INTERNAL_URL = "http://127.0.0.1:9090";

test("keeps health and metrics off the public port", async ({ request }) => {
  expect((await request.get("/health")).status()).toBe(404);
  expect((await request.get("/metrics")).status()).toBe(404);

  const health = await fetch(`${INTERNAL_URL}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({ status: "pass" });

  const metrics = await fetch(`${INTERNAL_URL}/metrics`);
  expect(metrics.status).toBe(200);
  const body = await metrics.text();
  expect(body).toContain("shares_created_total");
  expect(body).toContain("shares_expired_deleted_total");
  expect(body).toContain("shares_cleanup_runs_total");
  expect(body).not.toContain("sweep_deleted_total");
});
