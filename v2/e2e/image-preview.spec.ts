import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const png = readFileSync(path.join(__dirname, "fixtures", "specimen.png"));
const truncated = { name: "cut.png", mimeType: "image/png", buffer: png.subarray(0, Math.floor(png.length / 2)) };

test.describe("image preview decode failures", () => {
  test.beforeEach(async ({ page }) => {
    // Simulate browsers without createImageBitmap.
    await page.addInitScript(() => {
      delete (window as unknown as { createImageBitmap?: unknown }).createImageBitmap;
    });
    await page.goto("/");
  });

  test("truncated image shows an alert and no broken preview", async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(truncated);
    await expect(page.getByRole("alert")).toContainText(/cut off or damaged/i);
    await expect(page.getByAltText(/uploaded garment/i)).toHaveCount(0);
    await expect(page.getByText("Drop the piece")).toBeVisible();
  });

  test("a later bad file keeps the prior valid preview and fields", async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(path.join(__dirname, "fixtures", "specimen.png"));
    const preview = page.getByAltText(/uploaded garment/i);
    await expect(preview).toBeVisible();
    const before = await preview.getAttribute("src");
    await page.getByLabel("Describe the piece").fill("tan chore coat");
    await input.setInputFiles(truncated);
    await expect(page.getByRole("alert")).toContainText(/cut off or damaged/i);
    await expect(preview).toHaveAttribute("src", before ?? "");
    expect(await preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
    await expect(page.getByLabel("Describe the piece")).toHaveValue("tan chore coat");
  });
});

test("keyboard focus ring is two-tone and visible on a light form field", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "specimen.png"));
  await page.getByLabel("Item focus").focus();
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { outlineColor: style.outlineColor, outlineWidth: style.outlineWidth, shadow: style.boxShadow };
  });
  expect(ring.outlineColor).toBe("rgb(20, 19, 23)");
  expect(ring.outlineWidth).toBe("3px");
  expect(ring.shadow).toContain("rgb(245, 239, 229)");
});
