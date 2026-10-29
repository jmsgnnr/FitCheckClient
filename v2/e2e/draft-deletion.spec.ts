import { expect, test } from "@playwright/test";

const KEY = "fitcheck-v2-search-draft-v1";
const PAUSE_KEY = "fitcheck-v2-search-draft-paused-v1";

const seed = (extra: Record<string, unknown> = {}) => ({
  category: "Coat", description: "vintage wool coat", size: "M", condition: "used", region: "US",
  budgetUsd: 80, conciergeNote: "private sourcing note", savedAt: new Date().toISOString(), ...extra,
});

test.describe("durable draft deletion without a photo", () => {
  test("inspect, delete, edit, reload: stays gone until saving is turned back on", async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem(key, value);
      }
    }, [KEY, JSON.stringify(seed())]);
    await page.goto("/");

    // No photo has been uploaded; the saved fields are still reachable.
    await expect(page.getByAltText(/uploaded garment/i)).toHaveCount(0);
    const panel = page.getByTestId("saved-fields");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/30 days/);
    await panel.getByText("Inspect saved fields").click();
    await expect(panel).toContainText("vintage wool coat");
    await expect(panel).toContainText("private sourcing note");

    await page.getByRole("button", { name: /delete saved fields/i }).click();
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
    await expect(page.getByRole("button", { name: /turn saving back on/i })).toBeVisible();

    // Edit after deleting: must not recreate the draft.
    await page.getByRole("button", { name: /prepare sourcing brief/i }).click();
    await page.getByLabel("What makes this hunt hard?").fill("new note after delete");
    await expect(page.getByLabel("Sourcing brief preview")).toContainText("new note after delete");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();

    await page.reload();
    await expect(page.getByTestId("saved-fields")).toContainText(/saving is turned off/i);
    await page.getByRole("button", { name: /prepare sourcing brief/i }).click();
    await page.getByLabel("What makes this hunt hard?").fill("typed after reload");
    await expect(page.getByLabel("Sourcing brief preview")).toContainText("typed after reload");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();

    // Deliberately re-enable: now it saves again, with no email or image.
    await page.getByRole("button", { name: /turn saving back on/i }).click();
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k) ?? "", KEY)).toContain("typed after reload");
    const raw = await page.evaluate((k) => localStorage.getItem(k) ?? "", KEY);
    expect(raw).not.toMatch(/email|data:image|blob:/i);
    expect(await page.evaluate((k) => localStorage.getItem(k), PAUSE_KEY)).toBeNull();
  });

  test("an expired draft is removed and not shown", async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem(key, value);
      }
    }, [KEY, JSON.stringify(seed({ savedAt: new Date(Date.now() - 31 * 86400000).toISOString() }))]);
    await page.goto("/");
    await expect(page.getByTestId("saved-fields")).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });

  test("restoring a draft does not refresh its saved date", async ({ page }) => {
    const savedAt = new Date(Date.now() - 5 * 86400000).toISOString();
    await page.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem(key, value);
      }
    }, [KEY, JSON.stringify(seed({ savedAt }))]);
    await page.goto("/");
    await expect(page.getByTestId("saved-fields")).toBeVisible();
    expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY)) ?? "{}").savedAt).toBe(savedAt);
  });

  test("no horizontal overflow with the saved-fields panel open", async ({ page }) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [KEY, JSON.stringify(seed({ conciergeNote: "long ".repeat(80) }))]);
    await page.goto("/");
    await page.getByTestId("saved-fields").getByText("Inspect saved fields").click();
    const o = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }));
    expect(o.s).toBeLessThanOrEqual(o.v + 1);
  });

  test("deleting in one tab stops another tab from recreating the draft", async ({ context }) => {
    const draft = JSON.stringify(seed());
    const a = await context.newPage();
    await a.addInitScript(([key, value]) => {
      if (!localStorage.getItem(key) && !localStorage.getItem("fitcheck-v2-search-draft-paused-v1")) localStorage.setItem(key, value);
    }, [KEY, draft]);
    await a.goto("/");
    const b = await context.newPage();
    await b.goto("/");
    await expect(b.getByTestId("saved-fields")).toBeVisible();

    await a.getByRole("button", { name: /delete saved fields/i }).click();
    // Tab B syncs through the storage event without reloading.
    await expect(b.getByRole("button", { name: /turn saving back on/i })).toBeVisible();
    await b.getByRole("button", { name: /prepare sourcing brief/i }).click();
    await b.getByLabel("What makes this hunt hard?").fill("edit in the other tab");
    await expect(b.getByLabel("Sourcing brief preview")).toContainText("edit in the other tab");
    expect(await b.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });
});
