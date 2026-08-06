import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // The simulator mounts two WebGL consumers. Persistent parallel Chromium
  // workers retain GPU resources even after their individual contexts close,
  // which can starve the remaining production journeys on Windows.
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      grep: /@desktop/,
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chromium",
      grep: /@mobile/,
      use: {
        browserName: "chromium",
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
