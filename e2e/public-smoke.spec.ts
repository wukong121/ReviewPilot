import { expect, test } from "@playwright/test";

test("shows the Entra login entry without exposing application data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ReviewPilot" })).toBeVisible();
  await expect(page.getByRole("button", { name: /使用公司账号登录/ })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
});

test("health endpoint returns an OK payload", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});

test("unauthenticated users cannot read employee or manager data", async ({ request }) => {
  const employee = await request.get("/api/my/reviews");
  const manager = await request.get("/api/manager/dashboard");
  expect(employee.status()).toBe(401);
  expect(manager.status()).toBe(401);
});
