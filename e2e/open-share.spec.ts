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

  test("reports a missing key fragment", async ({ page }) => {
    await page.goto(`/share/${UNKNOWN_SHARE_ID}`);

    await expect(page.getByText("Missing #key.")).toBeVisible();
  });

  test("reports a share that does not exist", async ({ page }) => {
    await page.goto(`/share/${UNKNOWN_SHARE_ID}#${VALID_KEY_FRAGMENT}`);

    await expect(page.getByText("Not found. Expired, deleted, or never existed.")).toBeVisible();
  });
});
