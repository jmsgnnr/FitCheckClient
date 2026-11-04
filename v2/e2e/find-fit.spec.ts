import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const png = path.join(dir, "fixtures", "specimen.png");
const notImage = path.join(dir, "fixtures", "not-an-image.txt");
const input = 'input[type="file"]';

test("photo to labelled sample results, with nothing sent off the device", async ({ page }) => {
  const posts: string[] = [];
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") posts.push(request.url());
    if (!request.url().startsWith("http://127.0.0.1:5173") && !/^(data|blob):/.test(request.url())) external.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByText("DEMO: SAMPLE LISTINGS")).toBeVisible();
  await page.locator(input).setInputFiles(png);
  await expect(page.getByAltText("Your photo")).toBeVisible();
  await page.getByRole("button", { name: "Find this" }).click();
  const heading = page.getByRole("heading", { name: "Sample results" });
  await expect(heading).toBeFocused();
  await expect(page.getByText("Exact match")).toHaveCount(1);
  await expect(page.getByText("Similar", { exact: true })).toHaveCount(2);
  await expect(page.locator(".find-results a")).toHaveCount(0);
  await expect(page.locator(".find-results li").first()).toContainText("sample");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(posts).toEqual([]);
  expect(external).toEqual([]);
  if (process.env.FITCHECK_V2_SCREENSHOTS) {
    await page.screenshot({ path: path.join(process.env.FITCHECK_V2_SCREENSHOTS, `poc-${page.viewportSize()?.width}.png`), fullPage: true });
  }
});

test("invalid file explains itself; removing a photo resets the flow", async ({ page }) => {
  await page.goto("/");
  await page.locator(input).setInputFiles(notImage);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.locator(input).setInputFiles(png);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByAltText("Your photo")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Find this" })).toHaveCount(0);
});

test("the whole flow works by keyboard", async ({ page }) => {
  await page.goto("/");
  await page.locator(input).setInputFiles(png);
  const find = page.getByRole("button", { name: "Find this" });
  await find.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sample results" })).toBeFocused();
});

test("no results and provider failure are honest and keep the photo", async ({ page }) => {
  await page.goto("/#demo-empty");
  await page.locator(input).setInputFiles(png);
  await page.getByRole("button", { name: "Find this" }).click();
  await expect(page.getByRole("heading", { name: "No matches found" })).toBeVisible();
  await page.goto("about:blank");
  await page.goto("/#demo-error");
  await page.locator(input).setInputFiles(png);
  await page.getByRole("button", { name: "Find this" }).click();
  await expect(page.getByRole("alert")).toContainText("try again");
  await expect(page.getByAltText("Your photo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find this" })).toBeEnabled();
});

test("the older search-phrase flow stays at #classic", async ({ page }) => {
  await page.goto("/#classic");
  await expect(page.getByRole("heading", { name: /Upload the fit/i })).toBeVisible();
});

test("a damaged photo is refused and keeps the earlier photo", async ({ page }) => {
  const bytes = readFileSync(png);
  await page.goto("/");
  await page.locator(input).setInputFiles({ name: "cut.png", mimeType: "image/png", buffer: bytes.subarray(0, Math.floor(bytes.length / 2)) });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByAltText("Your photo")).toHaveCount(0);
  await page.locator(input).setInputFiles(png);
  await expect(page.getByAltText("Your photo")).toBeVisible();
  await page.locator(input).setInputFiles({ name: "cut.png", mimeType: "image/png", buffer: bytes.subarray(0, Math.floor(bytes.length / 2)) });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByAltText("Your photo")).toBeVisible();
});
