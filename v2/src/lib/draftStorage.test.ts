import { beforeEach, describe, expect, it } from "vitest";
import {
  buildConciergeBrief,
  clearDraft,
  loadDraft,
  saveDraft,
} from "./draftStorage";
import { DRAFT_STORAGE_KEY } from "./constants";

describe("draftStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not store image data keys", () => {
    saveDraft({
      category: "Dress",
      description: "floral midi",
      size: "",
      condition: "either",
      region: "US",
      budgetUsd: null,
      savedAt: new Date().toISOString(),
      conciergeNote: "",
    });
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY) ?? "";
    expect(raw).not.toMatch(/data:image/i);
    expect(loadDraft()?.description).toBe("floral midi");
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("concierge brief states not submitted", () => {
    const brief = buildConciergeBrief(
      {
        category: "Shoes",
        description: "platform loafers black",
        size: "8",
        condition: "new",
        region: "MX",
        budgetUsd: 200,
      },
      "Shoes platform loafers black",
      "Need wide width if possible",
      "user@example.com",
    );
    expect(brief).toMatch(/NOT SUBMITTED/i);
    expect(brief).toMatch(/NOT available yet/i);
  });
});


describe("contact persistence", () => {
  it("removes legacy contact field from restored drafts", () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      category: "Coat", description: "vintage", size: "", condition: "used", region: "US",
      budgetUsd: null, conciergeNote: "", conciergeEmail: "test-address", savedAt: "2026-10-12"
    }));
    const draft = loadDraft();
    expect(draft).not.toHaveProperty("conciergeEmail");
    if (draft) saveDraft(draft);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toContain("test-address");
  });
});
