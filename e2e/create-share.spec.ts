import { expect, test } from "@playwright/test";
import { ENVS_MAGIC, SAMPLE_ENV, decodeBase64Url } from "./helpers.js";

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
      (request) => request.method() === "POST" && request.url().includes("/api/v1/shares"),
    );

    await page.getByRole("textbox", { name: "paste your .env" }).fill(SAMPLE_ENV);
    await page.getByRole("button", { name: "share" }).click();

    const request = await post;
    const body = request.postDataJSON() as { envelope: string; max_reads: number };

    expect(body.max_reads).toBe(5);
    expect(JSON.stringify(body)).not.toContain("e2e-secret");
    const envelope = decodeBase64Url(body.envelope);
    expect(envelope.subarray(0, ENVS_MAGIC.length)).toEqual(ENVS_MAGIC);
    expect(envelope.length).toBeGreaterThan(SAMPLE_ENV.length);
  });

  test("validates the UTF-8 byte limit and recovers when input is shortened", async ({ page }) => {
    const input = page.getByRole("textbox", { name: "paste your .env" });
    const share = page.getByRole("button", { name: "share" });
    await input.fill("é".repeat(32769));
    await expect(page.getByText("over 64 KiB", { exact: true })).toBeVisible();
    await expect(share).toBeDisabled();

    await input.fill("é".repeat(32768));
    await expect(page.getByText("64 KiB", { exact: true })).toBeVisible();
    await expect(share).toBeEnabled();
    await input.fill("");
    await expect(share).toBeDisabled();
  });

  test("selects share link after creation", async ({ page }) => {
    await page.getByRole("textbox", { name: "paste your .env" }).fill(SAMPLE_ENV);
    await page.getByRole("button", { name: "share" }).click();
    const shareLink = page.getByRole("textbox", { name: "share link" });
    await expect(shareLink).toBeVisible();
    await expect(shareLink).toBeFocused();

    const selection = await shareLink.evaluate((el: HTMLTextAreaElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.value.length,
    }));
    expect(selection.start).toBe(0);
    expect(selection.end).toBe(selection.length);
    expect(selection.length).toBeGreaterThan(0);
  });

  test("starts a new share from the done screen", async ({ page }) => {
    await page.getByRole("slider", { name: "ttl", exact: true }).fill("7200");
    await page.getByRole("slider", { name: "reads", exact: true }).fill("50");
    const post = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().includes("/api/v1/shares"),
    );
    await page.getByRole("textbox", { name: "paste your .env" }).fill(SAMPLE_ENV);
    await page.getByRole("button", { name: "share" }).click();
    const body = (await post).postDataJSON() as { ttl_seconds: number; max_reads: number };
    expect(body.ttl_seconds).toBe(7200);
    expect(body.max_reads).toBe(50);
    await expect(page.getByRole("textbox", { name: "share link" })).toBeVisible();

    await page.getByRole("button", { name: "share again" }).click();

    await expect(page.getByRole("textbox", { name: "paste your .env" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "paste your .env" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "share" })).toBeDisabled();
    await expect(page.getByRole("slider", { name: "ttl", exact: true })).toHaveValue("7200");
    await expect(page.getByRole("slider", { name: "reads", exact: true })).toHaveValue("50");
  });
});
