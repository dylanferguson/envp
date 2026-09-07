import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:18080";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command:
      "mise run build && PORT=18080 OBS_PORT=18090 DB_PATH=./data/e2e-shares.db mise run start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
