import { expect, test } from "@playwright/test";
import {
  UNKNOWN_SHARE_ID,
  VALID_KEY_FRAGMENT,
  createShare,
  expectDecryptedEnv,
} from "./helpers.js";

test.describe("open share", () => {
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

    await expect(page.getByText("couldn't parse that.")).toBeVisible();
  });

  test("reports a missing key fragment", async ({ page }) => {
    await page.goto(`/s/${UNKNOWN_SHARE_ID}`);

    await expect(page.getByText("missing #key.")).toBeVisible();
  });

  test("reports a share that does not exist", async ({ page }) => {
    await page.goto(`/s/${UNKNOWN_SHARE_ID}#${VALID_KEY_FRAGMENT}`);

    await expect(page.getByText("gone. expired, deleted, or never existed.")).toBeVisible();
  });
});
