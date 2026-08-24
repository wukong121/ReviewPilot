import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -w @employee-review/web -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:5432/e2e",
      AUTH_SECRET: "e2e-only-auth-secret-e2e-only-auth-secret",
      ENTRA_TENANT_ID: "00000000-0000-0000-0000-000000000001",
      ENTRA_CLIENT_ID: "00000000-0000-0000-0000-000000000002",
      // Local E2E uses the supported client-secret fallback without contacting Entra.
      ENTRA_CLIENT_SECRET: "e2e-placeholder",
    },
  },
});
