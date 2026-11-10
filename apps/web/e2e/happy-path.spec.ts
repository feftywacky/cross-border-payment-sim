import { expect, test } from "@playwright/test";

test("compare CAD→EUR, read the verdict, filter by map, trace a route, sweep, save and reopen a read-only scenario", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Recommended/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Recorded data/).first()).toBeVisible();

  // Swap card shows the best estimate; path chain and pick cards render
  await expect(page.getByLabel("Best recipient amount")).not.toHaveText("—");
  await expect(page.getByRole("list", { name: "Route path" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Wise/ }).first()).toBeVisible();

  // Frontier, route map and ladder
  await expect(page.getByRole("heading", { name: "Cost × speed frontier" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Route map" })).toBeVisible();
  const ladder = page.getByRole("table").first();
  await expect(ladder.getByTitle(/USDC on /).first()).toBeVisible();
  await page.getByRole("radio", { name: "Conventional" }).click();
  await expect(ladder.getByText("Wise transfer (bank → bank)")).toBeVisible();
  await page.getByRole("radio", { name: "All", exact: true }).click();

  // Clicking a chain node in the map filters the ladder to that chain
  await page.getByRole("button", { name: /^Solana: best/ }).click();
  await expect(page.getByText("map: solana")).toBeVisible();
  await page.getByRole("button", { name: "Clear filter ✕" }).click();

  // Route trace drawer: every leg, the order book walk, and the cost split
  await page.getByRole("button", { name: "Trace this route →" }).click();
  const drawer = page.locator("dialog[open]");
  await expect(drawer.getByText(/Trace · sender funding → recipient bank/)).toBeVisible();
  await expect(drawer.getByText(/walk asks/).first()).toBeAttached();
  await expect(drawer.getByText(/Where the cost goes/)).toBeVisible();
  await expect(drawer.getByText(/Conversion: trade, withdraw, on-chain, credit/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Changing the amount re-prices every route
  const before = await page.getByLabel("Best recipient amount").innerText();
  await page.getByLabel(/You send/).fill("100000");
  await expect(page.getByLabel("Best recipient amount")).not.toHaveText(before, { timeout: 15_000 });

  // Research view
  await expect(page.getByText("When does USDC win?")).toBeVisible();
  // The sweep lands either with a break-even marker or with the API's explicit "no crossover" note.
  await expect(page.getByText(/break-even on cost|No crossover in tested range/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "Stress test" }).click();
  await expect(page.getByText(/Cost advantage, percentage points/)).toBeVisible({ timeout: 30_000 });

  // Save + open the read-only share link
  await page.getByRole("button", { name: "Save and share" }).click({ timeout: 30_000 });
  const link = await page.getByLabel("Scenario link").inputValue();
  expect(link).toMatch(/\/s\/sc_[A-Za-z0-9_-]{20,}$/);
  await page.goto(new URL(link).pathname);
  await expect(page.getByText("Read-only", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
  await expect(page.getByText("When does USDC win?")).toBeVisible(); // sweep saved with the scenario
});

test("phone width: no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Recommended/ })).toBeVisible({ timeout: 30_000 });
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
  await page.screenshot({ path: "test-results/phone.png", fullPage: false });
});
