import { expect, test } from "@playwright/test";
import {
  UNKNOWN_SHARE_ID,
  VALID_KEY_FRAGMENT,
  createShare,
  expectDecryptedEnv,
} from "./helpers.js";

test.describe("open share", () => {
  test("selects decrypted output after open", async ({ page }) => {
    const url = await createShare(page);
    await page.goto(url);
    const output = page.getByRole("textbox", { name: "decrypted .env" });
    await expect(output).toBeVisible();
    await expect(output).toBeFocused();
  });

  test("roundtrips create → open via share URL", async ({ page }) => {
    const url = await createShare(page);
    await page.goto(url);
    await expectDecryptedEnv(page);
  });

  test("opens a pasted link on /open", async ({ page }) => {
    const url = await createShare(page);

    await page.goto("/open");
    await page.getByRole("textbox", { name: "paste shared link" }).fill(url);
    await page.getByRole("button", { name: "open" }).click();

    await expectDecryptedEnv(page);
  });

  test("reports an invalid pasted link", async ({ page }) => {
    await page.goto("/open");
    await page.getByRole("textbox", { name: "paste shared link" }).fill("not-a-share-link");
    await page.getByRole("button", { name: "open" }).click();

    await expect(page.getByText("Couldn't parse that.")).toBeVisible();
  });

  test("reports a network failure and allows retrying a pasted link", async ({ page }) => {
    const endpoint = `**/api/v1/shares/${UNKNOWN_SHARE_ID}`;
    await page.route(endpoint, (route) => route.abort("failed"));
    await page.goto("/open");
    await page
      .getByRole("textbox", { name: "paste shared link" })
      .fill(`/share/${UNKNOWN_SHARE_ID}#${VALID_KEY_FRAGMENT}`);
    await page.getByRole("button", { name: "open" }).click();

    await expect(page.getByText("Request failed", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "paste shared link" })).toBeVisible();

    await page.unroute(endpoint);
    await page.getByRole("button", { name: "open" }).click();
    await expect(page.getByText("Not found. Expired, deleted, or never existed.")).toBeVisible();
  });

  test("reports a missing key fragment", async ({ page }) => {
    await page.goto(`/share/${UNKNOWN_SHARE_ID}`);

    await expect(page.getByText("Missing #key.")).toBeVisible();
  });

  test("reports a share that does not exist", async ({ page }) => {
    await page.goto(`/share/${UNKNOWN_SHARE_ID}#${VALID_KEY_FRAGMENT}`);

    await expect(page.getByText("Not found. Expired, deleted, or never existed.")).toBeVisible();
  });

  test("does not overflow a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    const paths = ["/", "/open", `/share/${UNKNOWN_SHARE_ID}#${VALID_KEY_FRAGMENT}`];
    for (const path of paths) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});
