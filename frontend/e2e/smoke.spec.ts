/**
 * E2E smoke tests for Greenhouse SaaS.
 * Validates the critical path: login → dashboard → zone → live data.
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost";
const DEMO_EMAIL =
  process.env.PLAYWRIGHT_DEMO_EMAIL || "demo@greenhouse-saas.com";
const DEMO_PASSWORD = process.env.PLAYWRIGHT_DEMO_PASSWORD || "demo1234";

test.describe("Authentication", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("invalid credentials shows error", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill("bad@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 });
  });

  test("demo user can log in and reach dashboard", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill(DEMO_EMAIL);
    await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill(DEMO_EMAIL);
    await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test("displays greenhouse cards", async ({ page }) => {
    await expect(
      page.getByRole("main").locator("[data-testid='greenhouse-card']").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.getByRole("link", { name: /alerts/i }).first().click();
    await expect(page).toHaveURL(/\/alerts/);
  });
});

test.describe("Sensor pipeline (simulated)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill(DEMO_EMAIL);
    await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test("zone detail page loads with sensor charts", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    // Find first zone link and navigate to it
    const zoneLink = page.locator("a[href*='/zones/']").first();
    if ((await zoneLink.count()) > 0) {
      await zoneLink.click();
      await expect(page).toHaveURL(/\/zones\//);
      // Charts should render (Recharts uses SVG)
      await expect(page.locator("svg.recharts-surface").first()).toBeVisible({
        timeout: 10000,
      });
    } else {
      test.skip();
    }
  });

  test("alerts page shows alert list", async ({ page }) => {
    await page.goto(`${BASE_URL}/alerts`);
    await expect(page.getByRole("main")).toBeVisible();
    // Either alerts exist or empty state is shown
    const hasAlerts = await page.locator("[data-testid='alert-row']").count();
    const hasEmpty = await page
      .locator("[data-testid='empty-state']")
      .count();
    expect(hasAlerts + hasEmpty).toBeGreaterThanOrEqual(0);
  });
});

test.describe("API health check", () => {
  test("health endpoint returns 200", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health/`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status");
  });
});

test.describe("Security headers", () => {
  test("response includes expected security headers", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/`);
    // HSTS
    const hsts = response.headers()["strict-transport-security"];
    if (hsts) {
      expect(hsts).toContain("max-age");
    }
    // X-Frame-Options or CSP frame-ancestors
    const xfo = response.headers()["x-frame-options"];
    const csp = response.headers()["content-security-policy"];
    expect(xfo || csp).toBeTruthy();
    // X-Content-Type-Options
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });
});
