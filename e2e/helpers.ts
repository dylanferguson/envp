import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const SAMPLE_ENV = "API_KEY=e2e-secret\nDB_HOST=localhost\n";

export const UNKNOWN_SHARE_ID = "share_aaaaaaaaaaaaaaaaaaaaaa";

export const VALID_KEY_FRAGMENT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

export const SHARE_LINK_PATTERN = /\/s\/share_[A-Za-z0-9_-]{22}#[A-Za-z0-9_-]{43}$/;

export const ENVS_MAGIC = new Uint8Array([0x45, 0x4e, 0x56, 0x53]);

export function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(base64 + padding, "base64"));
}

export async function createShare(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "paste your .env" }).fill(SAMPLE_ENV);
  await page.getByRole("button", { name: "share" }).click();
  const shareLink = page.getByRole("textbox", { name: "share link" });
  await expect(shareLink).toBeVisible();
  return shareLink.inputValue();
}

export async function expectDecryptedEnv(page: Page, env = SAMPLE_ENV): Promise<void> {
  const output = page.getByRole("textbox", { name: "decrypted .env" });
  await expect(output).toBeVisible();
  await expect(output).toHaveValue(env);
}
