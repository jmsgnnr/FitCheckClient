import { expect, test } from "@playwright/test";

const KEY = "fitcheck-v2-search-draft-v1";

test.describe("restored drafts and storage failures", () => {
  test("corrupted and wrong-typed drafts do not crash the page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem(key, JSON.stringify({ category: 7, description: { x: 1 }, size: null, condition: "bogus", region: "ZZ", budgetUsd: "9", conciergeNote: [], savedAt: "x" }));
      }
    }, KEY);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /upload the fit/i })).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  });

  test("valid no-image draft restores without a photo and persists no email or image", async ({ page }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem(key, JSON.stringify({ category: "Coat", description: "vintage wool", size: "M", condition: "used", region: "US", budgetUsd: 80, conciergeNote: "note", savedAt: new Date().toISOString(), conciergeEmail: "leak@example.com" }));
      }
    }, KEY);
    await page.goto("/");
    await page.getByRole("button", { name: /prepare sourcing brief/i }).click();
    await expect(page.getByLabel("Sourcing brief preview")).toContainText("vintage wool");
    const raw = await page.evaluate((key) => localStorage.getItem(key) ?? "", KEY);
    expect(raw).not.toContain("leak@example.com");
    expect(raw).not.toMatch(/data:image|blob:/);
  });

  test("blocked storage keeps editing working and shows an accurate message", async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
      Storage.prototype.removeItem = () => { throw new DOMException("blocked", "SecurityError"); };
    });
    await page.goto("/");
    await page.getByRole("button", { name: /prepare sourcing brief/i }).click();
    await page.getByLabel("What makes this hunt hard?").fill("typing still works");
    await expect(page.getByLabel("Sourcing brief preview")).toContainText("typing still works");
    await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/specimen.png");
    await expect(page.getByAltText(/uploaded garment/i)).toBeVisible();
    await page.getByLabel("Item focus").selectOption("Jacket");
    await page.getByLabel("Describe the piece").fill("tan corduroy chore coat");
    await expect(page.getByLabel("Constructed search phrase")).toContainText("corduroy");
    await expect(page.getByTestId("storage-warning")).toContainText(/not being saved/i);
    await page.getByRole("button", { name: /clear saved fields/i }).click();
    await expect(page.getByTestId("storage-warning")).toContainText(/blocked deleting/i);
    await expect(page.getByText(/saved field draft cleared/i)).toHaveCount(0);
  });

  test("oversize paste shows feedback and the saved draft restores intact", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/specimen.png");
    await expect(page.getByAltText(/uploaded garment/i)).toBeVisible();
    await page.getByLabel("Item focus").selectOption("Jacket");
    await page.getByLabel("Describe the piece").fill("a".repeat(6000));
    await expect(page.locator("#description-limit")).toContainText(/shortened to the 5,000 character limit/i);
    expect(await page.getByLabel("Describe the piece").inputValue()).toHaveLength(5000);
    await page.reload();
    await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/specimen.png");
    await expect(page.getByLabel("Describe the piece")).toHaveValue("a".repeat(5000));
  });
});
