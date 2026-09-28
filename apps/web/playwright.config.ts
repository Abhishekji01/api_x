import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the static demo build (`npm run build:demo`), served by
 * `vite preview`: the whole dashboard, every screen, from the recorded API snapshot —
 * no database or API process needed, so they run anywhere, including CI.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env["CI"] ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    // Optional: point at an already-installed Chromium instead of `playwright install`.
    ...(process.env["PW_CHROMIUM_PATH"]
      ? { launchOptions: { executablePath: process.env["PW_CHROMIUM_PATH"] } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite preview --outDir dist-demo --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});
