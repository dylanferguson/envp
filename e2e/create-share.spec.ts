import { expect, test } from "@playwright/test";
import {
  ENVS_MAGIC,
  SAMPLE_ENV,
  decodeBase64Url,
} from "./helpers.js";

test.describe("create share", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("disables share until .env content is pasted", async ({ page }) => {
    await expect(page.getByRole("button", { name: "share" })).toBeDisabled();
    await page.getByRole("textbox", { name: "paste your .env" }).fill(SAMPLE_ENV);
    await expect(page.getByRole("button", { name: "share" })).toBeEnabled();
  });

  test("POSTs sealed envelope, not plaintext", async ({ page }) => {
    const post = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().includes("/api/v1/shares"),
    );

    await page.getByRole("textbox", { name: "paste your .env" }).fill(SAMPLE_ENV);
    await page.getByRole("button", { name: "share" }).click();

    const request = await post;
    const body = request.postDataJSON() as { envelope: string };

    expect(JSON.stringify(body)).not.toContain("e2e-secret");
    const envelope = decodeBase64Url(body.envelope);
    expect(envelope.subarray(0, ENVS_MAGIC.length)).toEqual(ENVS_MAGIC);
    expect(envelope.length).toBeGreaterThan(SAMPLE_ENV.length);
  });

  test("starts a new share from the done screen", async ({ page }) => {
    await page.getByRole("textbox", { name: "paste your .env" }).fill(SAMPLE_ENV);
    await page.getByRole("button", { name: "share" }).click();
    await expect(page.getByRole("textbox", { name: "share link" })).toBeVisible();

    await page.getByRole("button", { name: "new" }).click();

    await expect(page.getByRole("textbox", { name: "paste your .env" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "paste your .env" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "share" })).toBeDisabled();
  });
});
