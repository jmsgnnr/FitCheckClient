import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePng = path.join(__dirname, "fixtures", "specimen.png");

const listing = (id: string, amount: number, shipping: number | null) => ({
  source: "ebay", listingId: id, title: `Synthetic ${id} (not inventory)`,
  merchantUrl: `https://www.ebay.com/itm/${id}`, matching: "unverified", availability: "unknown",
  price: { amount, currency: "USD" },
  shipping: shipping == null ? null : { amount: shipping, currency: "USD" },
  condition: "used", sizeText: "L", checkedAt: "2026-10-13T00:00:00Z",
});

test("budget and destination are labelled as unapplied; over-budget listings are separated", async ({ page }) => {
  const requests: string[] = [];
  await page.route("http://127.0.0.1:3927/**", async (route) => {
    const url = route.request().url();
    requests.push(url);
    const data = url.endsWith("/status")
      ? { ebay: { provider: "ebay", status: "available", liveRequestsAllowed: true, supportedRegions: ["US"], keywordSearch: true } }
      : {
          provider: "ebay", status: "available", region: "US", checkedAt: "2026-10-13T00:00:00Z",
          listings: [listing("cheap", 40, null), listing("pricey", 150, 5), listing("edge", 78, 9)],
        };
    await route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "http://127.0.0.1:5173" }, body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixturePng);
  await page.getByLabel("Item focus").selectOption("Jacket");
  await page.getByLabel("Describe the piece").fill("brown corduroy chore coat");
  await page.getByLabel("Max budget USD (optional)").fill("80");
  await page.getByLabel("Max budget USD (optional)").blur();

  const phrase = page.getByLabel("Constructed search phrase");
  await expect(phrase).not.toContainText(/ship|under|\$80/i);
  await expect(page.getByLabel(/Shopping constraints, not applied by search/)).toContainText("$80 USD");
  await expect(page.getByText(/destination and budget are your notes, not search filters/i)).toBeVisible();

  await page.getByRole("button", { name: "Check local catalog" }).click();
  await page.getByRole("button", { name: "Search connected listings" }).click();
  const q = new URL(requests[1]).searchParams.get("q") ?? "";
  expect(q).toContain("brown corduroy");
  expect(q).not.toMatch(/ship|under|\$|80/i);

  await expect(page.getByRole("heading", { name: /over your budget \(2\)/i })).toBeVisible();
  const over = page.locator(".listing-list.is-over-budget");
  await expect(over).toContainText("Synthetic pricey");
  await expect(over).toContainText("Synthetic edge");
  await expect(over).toContainText(/over your \$80 budget/);
  const primary = page.locator(".listing-list:not(.is-over-budget)");
  await expect(primary).toContainText("Synthetic cheap");
  await expect(primary).not.toContainText("pricey");
  await expect(primary).toContainText(/delivered cost is unverified/);
  await expect(page.getByText(/Ships to United States: unverified/).first()).toBeVisible();
  await expect(page.locator(".catalog-results")).not.toContainText(/verified match|winner|cheapest|lowest price/i);
});
