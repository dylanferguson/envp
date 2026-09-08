import { expect, test } from "@playwright/test";

const OBS_URL = "http://127.0.0.1:18090";

test("keeps health and metrics off the public port", async ({ request }) => {
  expect((await request.get("/health")).status()).toBe(404);
  expect((await request.get("/metrics")).status()).toBe(404);

  const health = await fetch(`${OBS_URL}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({ status: "pass" });

  const metrics = await fetch(`${OBS_URL}/metrics`);
  expect(metrics.status).toBe(200);
  expect(await metrics.text()).toContain("shares_created_total");
});
