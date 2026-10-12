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
