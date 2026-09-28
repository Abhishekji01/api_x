import { expect, test } from "@playwright/test";

// Runs against the static demo build (see playwright.config.ts): hash routes.

test("overview shows the daily index, honestly labelled", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByText("India Airfare Price Index · daily")).toBeVisible();
  await expect(page.getByText("Synthetic demo data")).toBeVisible();
  await expect(page.getByText(/Demonstration data\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily Airfare Price Index" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sector heatmap · last 14 days/ })).toBeVisible();
});

test("every section loads without a failed request", async ({ page }) => {
  for (const path of [
    "airfare-index",
    "heatmap",
    "routes",
    "leadtime",
    "validation",
    "pipeline",
    "explorer",
    "reports",
    "settings",
    "api-access",
  ]) {
    await page.goto(`/#/${path}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toContainText("Request failed");
    await expect(page.locator("main")).not.toContainText("Not in this snapshot");
  }
});

test("validation reports benchmarks it does not have as not loaded", async ({ page }) => {
  await page.goto("/#/validation");
  await expect(page.getByText("These scores test the harness, not real prices.")).toBeVisible();
  await expect(page.getByText("0 of 2")).toBeVisible();
  await expect(page.getByText("No score yet — nothing is estimated in its place.")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Unit-value mean fare (same quotes)" })).toBeVisible();
});

test("drill into a route in the route explorer", async ({ page }) => {
  await page.goto("/#/routes");
  await expect(page.getByRole("heading", { name: "Fare curve — DEL-BOM" })).toBeVisible();
  await page.locator("#route-select").selectOption("DEL-BLR");
  await expect(page.getByRole("heading", { name: "Fare curve — DEL-BLR" })).toBeVisible();
  await page.getByRole("radio", { name: "Carrier" }).click();
  await expect(page.getByRole("heading", { name: "Corridor momentum" })).toBeVisible();
});

test("completes one full provenance drill-down", async ({ page }) => {
  await page.goto("/#/settings");
  const chart = page.getByTestId("audit-index-chart");
  await expect(chart).toBeVisible();
  await chart.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Contributing route indices" })).toBeVisible();
  await page.getByRole("button", { name: /DEL-BOM/ }).first().click();
  await expect(page.getByRole("heading", { name: /Cleaned quotes/ })).toBeVisible();
  await page.getByRole("button", { name: "Trace source" }).first().click();
  await expect(page.getByRole("heading", { name: "Source and legal basis" })).toBeVisible();
  await expect(page.getByText("SYNTHETIC").first()).toBeVisible();
});
