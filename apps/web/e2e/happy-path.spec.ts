import { expect, test } from "@playwright/test";

test("compare CAD→EUR, inspect a route, rerank, save and reopen a read-only scenario", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Simulation / estimate — not a payment quote")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Recorded fixture data")).toBeVisible();

  // Verdict and a table with both route families
  await expect(page.getByRole("heading", { name: "Recommended" })).toBeVisible();
  const table = page.getByRole("table").first();
  await expect(table.getByText("USDC", { exact: true }).first()).toBeVisible();
  await page.getByRole("radio", { name: "Conventional" }).click();
  await expect(table.getByText("Wise transfer (bank → bank)")).toBeVisible();
  await page.getByRole("radio", { name: "All" }).click();

  // Route breakdown drawer shows every leg with sources
  await table.locator("tbody tr").first().click();
  const drawer = page.locator("dialog[open]");
  await expect(drawer.getByText("Timeline · sender funding → recipient bank")).toBeVisible();
  await expect(drawer.getByText(/walk asks/)).toBeVisible();
  await expect(drawer.getByText("Every fee", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");

  // Changing the amount re-prices every route
  const firstAmount = await page.locator("tbody tr").first().locator("td").nth(1).innerText();
  await page.getByLabel(/Total debited from sender/).fill("100000");
  await expect(page.locator("tbody tr").first().locator("td").nth(1)).not.toHaveText(firstAmount, { timeout: 15_000 });

  // Research view renders
  await expect(page.getByText("When does USDC win?")).toBeVisible();
  await expect(page.getByText("Break-even")).toBeVisible({ timeout: 30_000 });
  await page.getByText("Stress test — where does USDC still win?").click();
  await expect(page.getByText("Where does the best USDC route beat the best conventional route?")).toBeVisible({ timeout: 30_000 });

  // Save + open read-only share link
  await page.getByRole("button", { name: "Save scenario" }).click({ timeout: 30_000 });
  const link = await page.getByLabel("Scenario link").inputValue();
  expect(link).toMatch(/\/s\/sc_[A-Za-z0-9_-]{20,}$/);
  await page.goto(new URL(link).pathname);
  await expect(page.getByText("Read-only shared snapshot")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
  await expect(page.getByText("When does USDC win?")).toBeVisible(); // sweep saved with the scenario
});
