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

test("cloudflare PoC requires consent, sends the header, shows identify text, hides match badges", async ({ page }) => {
  // VITE_FITCHECK_API_URL is not set by the existing Playwright webServer, so DEV hash #cloudflare-poc wires the worker provider.
  let sawConsent = false;
  await page.route("http://127.0.0.1:8787/api/identify", async (route) => {
    sawConsent = route.request().headers()["x-fitcheck-consent"] === "yes";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        identified: {
          category: "shoes",
          brand: "SampleBrand",
          model: "SampleModel",
          colorway: "Black",
          styleCode: null,
          visibleText: [],
          uncertainties: [],
        },
      }),
    });
  });
  await page.goto("/#cloudflare-poc");
  await expect(page.getByText("DEMO: SAMPLE LISTINGS")).toBeVisible();
  await expect(page.getByText(/sent to Cloudflare to identify the item and isn't stored/i)).toBeVisible();
  await page.locator(input).setInputFiles(png);
  const find = page.getByRole("button", { name: "Find this" });
  await expect(find).toBeDisabled();
  await page.getByLabel(/Send this photo to Cloudflare to identify the item/i).check();
  await expect(find).toBeEnabled();
  await find.click();
  await expect(page.getByText(/Looks like SampleBrand SampleModel in Black/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sample results" })).toBeVisible();
  await expect(page.getByText("Exact match")).toHaveCount(0);
  await expect(page.getByText("Similar", { exact: true })).toHaveCount(0);
  expect(sawConsent).toBe(true);
});

test("preparePhoto re-encode drops an EXIF APP1 marker from a JPEG fixture", async ({ page }) => {
  await page.goto("/");
  const stripped = await page.evaluate(async () => {
    const { preparePhoto, jpegHasExifMarker } = await import("/src/lib/preparePhoto.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false };
    ctx.fillStyle = "#336699";
    ctx.fillRect(0, 0, 8, 8);
    const clean = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!clean) return { ok: false };
    const cleanBytes = new Uint8Array(await clean.arrayBuffer());
    const exifBody = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08];
    const app1Len = exifBody.length + 2;
    const injected = new Uint8Array(cleanBytes.length + 2 + app1Len);
    injected[0] = 0xff;
    injected[1] = 0xd8;
    injected[2] = 0xff;
    injected[3] = 0xe1;
    injected[4] = (app1Len >> 8) & 0xff;
    injected[5] = app1Len & 0xff;
    injected.set(exifBody, 6);
    injected.set(cleanBytes.subarray(2), 6 + exifBody.length);
    if (!jpegHasExifMarker(injected)) return { ok: false };
    const out = await preparePhoto(new File([injected], "exif.jpg", { type: "image/jpeg" }));
    const outBytes = new Uint8Array(await out.arrayBuffer());
    return { ok: !jpegHasExifMarker(outBytes) };
  });
  expect(stripped.ok).toBe(true);
});
