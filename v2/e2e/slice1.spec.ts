import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePng = path.join(__dirname, "fixtures", "specimen.png");
const screenshotRoot =
  process.env.FITCHECK_V2_SCREENSHOTS ??
  "C:/Users/james/Development/github-modernization-audit/FitCheckClient-v2-screenshots";

test.describe("FitCheck V2 slice 1", () => {
  test("upload, hunt handoff, concierge copy, reset", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /upload the fit/i }),
    ).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(fixturePng);

    await expect(page.getByAltText(/uploaded garment/i)).toBeVisible();
    await expect.poll(async () => page.getByAltText(/uploaded garment/i).evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);

    await page.getByLabel("Item focus").selectOption("Jacket");
    await page
      .getByLabel("Describe the piece")
      .fill("tan corduroy chore coat vintage");
    await page.getByLabel("Ship to").selectOption("US");
    await page.getByLabel("Size (optional)").fill("L");
    await page.getByLabel("Max budget USD (optional)").fill("95");
    await page.getByLabel("Max budget USD (optional)").blur();

    const phrase = page.getByLabel("Constructed search phrase");
    await expect(phrase).toContainText("Jacket");
    await expect(phrase).toContainText("tan corduroy");

    const ebay = page.getByRole("link", { name: "Search eBay" });
    await expect(ebay).toHaveAttribute("href", /ebay\.com\/sch\/i\.html/);
    await expect(ebay).toHaveAttribute("target", "_blank");

    await page.getByRole("button", { name: /copy search text/i }).click();

    await expect(page.getByText(/no live sellers connected yet/i)).toBeVisible();

    await page.getByRole("button", { name: /prepare sourcing brief/i }).click();
    await page
      .getByLabel("What makes this hunt hard?")
      .fill("Need exact collar shape");
    await page.getByRole("button", { name: /copy brief/i }).click();
    await expect(page.getByText(/not submitted/i).first()).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);

    const viewport = testInfo.project.name;
    await page.screenshot({
      path: path.join(
        screenshotRoot,
        `${viewport}-populated.png`,
      ),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Reset all" }).click();
    await expect(page.getByAltText(/uploaded garment/i)).toHaveCount(0);
    await expect(page.getByText("Drop the piece")).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotRoot, `${viewport}-reset.png`),
      fullPage: true,
    });
  });

  test("rejects invalid file type message via helper", async ({ page }) => {
    await page.goto("/");
    const txt = path.join(__dirname, "fixtures", "not-an-image.txt");
    await page.locator('input[type="file"]').setInputFiles(txt);
    await expect(page.getByRole("alert")).toContainText(/JPG/i);
  });
});


test("rejects a file pretending to be PNG", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "misleading.png",
    mimeType: "image/png",
    buffer: Buffer.from("text content incorrectly labeled as PNG"),
  });
  await expect(page.getByRole("alert")).toContainText(/doesn't contain a valid/i);
  await expect(page.getByAltText(/uploaded garment/i)).toHaveCount(0);
});

test("does not claim a seller match before searching; source status expands on demand", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("[03 Ready]")).toBeVisible();
  await expect(page.locator(".step-tag.is-active")).toContainText("01 Photo");
  await expect(page.getByText(/no live sellers connected yet/i)).toBeVisible();
  await expect(page.getByText("eBay Browse (keyword)")).not.toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(fixturePng);
  await expect(page.locator(".step-tag.is-active")).toContainText("02 Describe");

  await page.getByLabel("Item focus").selectOption("Jacket");
  await page.getByLabel("Describe the piece").fill("tan corduroy chore coat");
  await expect(page.locator(".step-tag.is-active")).toContainText("03 Ready");
  await expect(page.getByText(/haven.t found a seller or searched/i)).toBeVisible();

  const details = page.locator(".provider-details");
  await expect(details).not.toHaveAttribute("open", "");
  await page.getByText("See supported and planned sources").focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(page.getByText("eBay Browse (keyword)")).toBeVisible();
});

test("does not contact local catalog automatically; offline checking is explicit", async ({ page }) => {
  const requests: string[] = [];
  await page.route("http://127.0.0.1:3927/**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "http://127.0.0.1:5173" },
      body: JSON.stringify({ ebay: { provider: "ebay", status: "disabled", liveRequestsAllowed: false, supportedRegions: ["US"], keywordSearch: true } }),
    });
  });
  await page.goto("/");
  await expect(page.getByText(/no live sellers connected yet/i)).toBeVisible();
  expect(requests).toHaveLength(0);

  await page.getByRole("button", { name: "Check local catalog" }).click();
  await expect(page.getByText(/provider is disabled or awaiting approval/i)).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toBe("http://127.0.0.1:3927/api/catalog/status");
  await expect(page.getByRole("button", { name: "Search connected listings" })).toHaveCount(0);
});

test("only a shopper click searches simulated local provider; result is clearly unverified", async ({ page }) => {
  const requests: string[] = [];
  await page.route("http://127.0.0.1:3927/**", async (route) => {
    const url = route.request().url();
    requests.push(url);
    const data = url.endsWith("/status") ? {
      ebay: { provider: "ebay", status: "available", liveRequestsAllowed: true, supportedRegions: ["US"], keywordSearch: true },
    } : {
      provider: "ebay", status: "available", region: "US", checkedAt: "2026-10-13T00:00:00Z",
      listings: [{
        source: "ebay", listingId: "synthetic-e2e", title: "Synthetic jacket fixture (not inventory)",
        merchantUrl: "https://www.ebay.com/itm/123", matching: "unverified", availability: "unknown",
        price: { amount: 54, currency: "USD" }, shipping: null, condition: "used",
        sizeText: "L", checkedAt: "2026-10-13T00:00:00Z",
      }],
    };
    await route.fulfill({ status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "http://127.0.0.1:5173" }, body: JSON.stringify(data) });
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixturePng);
  await page.getByLabel("Item focus").selectOption("Jacket");
  await page.getByLabel("Describe the piece").fill("brown corduroy chore coat");
  await expect(page.getByText("Synthetic jacket fixture (not inventory)")).toHaveCount(0);

  await page.getByRole("button", { name: "Check local catalog" }).click();
  await expect(page.getByText(/local keyword catalog enabled/i)).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Search connected listings" }).click();
  await expect(page.getByText("Synthetic jacket fixture (not inventory)")).toBeVisible();
  await expect(page.getByText(/Keyword listings from eBay · not photo-matched/i)).toBeVisible();
  await expect(page.getByText("Shipping unknown", { exact: false })).toBeVisible();
  const link = page.getByRole("link", { name: "View original eBay listing" });
  await expect(link).toHaveAttribute("href", "https://www.ebay.com/itm/123");
  await expect(link).toHaveAttribute("rel", /noreferrer/);
  expect(requests).toHaveLength(2);
  expect(new URL(requests[1]).searchParams.get("q")).toContain("brown corduroy");

  await page.getByLabel("Describe the piece").fill("green velvet shirt");
  await expect(page.getByText("Synthetic jacket fixture (not inventory)")).toHaveCount(0);
});

test("long catalog queries provide guidance and do not send a search", async ({ page }) => {
  const requests: string[] = [];
  await page.route("http://127.0.0.1:3927/**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "http://127.0.0.1:5173" },
      body: JSON.stringify({ ebay: { provider: "ebay", status: "available", liveRequestsAllowed: true, supportedRegions: ["US"], keywordSearch: true } }),
    });
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixturePng);
  await page.getByLabel("Item focus").selectOption("Jacket");
  await page.getByLabel("Describe the piece").fill("very long coat ".repeat(14));
  await page.getByRole("button", { name: "Check local catalog" }).click();
  await expect(page.getByText(/search is too long for the local catalog/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Search connected listings" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});
