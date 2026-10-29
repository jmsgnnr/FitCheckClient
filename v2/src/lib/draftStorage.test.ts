import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildConciergeBrief,
  clearDraft,
  isDraftEmpty,
  isSavingPaused,
  loadDraft,
  saveDraft,
  setSavingPaused,
} from "./draftStorage";
import { DRAFT_MAX_TEXT_LENGTH, DRAFT_PAUSE_KEY, DRAFT_STORAGE_KEY, DRAFT_TTL_MS } from "./constants";
import { buildSearchPhrase } from "./searchPhrase";

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

describe("restored draft validation", () => {
  const NOW = Date.parse("2026-10-29T12:00:00.000Z");
  const good = {
    category: "Jacket", description: "tan chore coat", size: "L", condition: "used", region: "MX",
    budgetUsd: 95, conciergeNote: "wide collar", savedAt: "2026-10-28T12:00:00.000Z",
  };
  const put = (value: unknown) => localStorage.setItem(DRAFT_STORAGE_KEY, typeof value === "string" ? value : JSON.stringify(value));

  beforeEach(() => localStorage.clear());

  it("round-trips a valid draft", () => {
    put(good);
    expect(loadDraft(NOW)).toEqual(good);
  });

  it("accepts an empty category and null budget", () => {
    put({ ...good, category: "", budgetUsd: null });
    expect(loadDraft(NOW)).not.toBeNull();
  });

  it.each([
    ["non-string description", { description: 42 }],
    ["null size", { size: null }],
    ["object note", { conciergeNote: {} }],
    ["unknown category", { category: "Hat" }],
    ["missing category", { category: undefined }],
    ["missing condition", { condition: undefined }],
    ["unknown condition", { condition: "mint" }],
    ["unknown region", { region: "CA" }],
    ["string budget", { budgetUsd: "95" }],
    ["negative budget", { budgetUsd: -5 }],
    ["unparseable savedAt", { savedAt: "not-a-date" }],
    ["numeric savedAt", { savedAt: 12345 }],
    ["future savedAt", { savedAt: "2027-01-01T00:00:00.000Z" }],
    ["oversized text", { description: "x".repeat(6000) }],
  ])("rejects %s and removes it", (_name, patch) => {
    put({ ...good, ...patch });
    expect(loadDraft(NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it.each(["{not json", "null", "[]", "42", '"str"'])("recovers from corrupted payload %s", (raw) => {
    put(raw);
    expect(loadDraft(NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("drops expired drafts after the retention window", () => {
    put({ ...good, savedAt: new Date(NOW - DRAFT_TTL_MS - 1000).toISOString() });
    expect(loadDraft(NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    put({ ...good, savedAt: new Date(NOW - DRAFT_TTL_MS + 60_000).toISOString() });
    expect(loadDraft(NOW)).not.toBeNull();
  });

  it("rewrites a legacy draft without extras but keeps its savedAt", () => {
    put({ ...good, conciergeEmail: "a@b.co" });
    expect(loadDraft(NOW)?.savedAt).toBe(good.savedAt);
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY) ?? "";
    expect(raw).not.toContain("a@b.co");
    expect(JSON.parse(raw).savedAt).toBe(good.savedAt);
  });

  it("restored output never carries unexpected fields", () => {
    put({ ...good, conciergeEmail: "a@b.co", imageData: "data:image/png;base64,AAAA" });
    const draft = loadDraft(NOW);
    expect(Object.keys(draft ?? {}).sort()).toEqual(
      ["budgetUsd", "category", "conciergeNote", "condition", "description", "region", "savedAt", "size"],
    );
  });

  it("a validated restored draft is safe for searchPhrase", () => {
    put({ ...good, category: "", description: "", size: "" });
    const draft = loadDraft(NOW)!;
    expect(() => buildSearchPhrase(draft)).not.toThrow();
  });
});

describe("storage failures", () => {
  const draft = {
    category: "Dress" as const, description: "floral", size: "", condition: "either" as const,
    region: "US" as const, budgetUsd: null, savedAt: new Date().toISOString(), conciergeNote: "",
  };
  afterEach(() => vi.restoreAllMocks());

  it("saveDraft returns false on QuotaExceededError", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveDraft(draft)).toBe(false);
  });

  it("clearDraft returns false on SecurityError", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(clearDraft()).toBe(false);
  });

  it("loadDraft returns null when storage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadDraft()).toBeNull();
  });

  it("loadDraft survives a failing cleanup of a corrupted draft", () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, "{bad");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadDraft()).toBeNull();
  });

  it("success paths return true", () => {
    expect(saveDraft(draft)).toBe(true);
    expect(clearDraft()).toBe(true);
  });
});


describe("save/restore limits agree", () => {
  beforeEach(() => localStorage.clear());
  const base = {
    category: "Coat" as const, description: "x", size: "", condition: "either" as const,
    region: "US" as const, budgetUsd: null, conciergeNote: "", savedAt: new Date().toISOString(),
  };

  it("clamps oversize text on save so the saved draft restores intact", () => {
    expect(saveDraft({ ...base, description: "d".repeat(DRAFT_MAX_TEXT_LENGTH + 500), conciergeNote: "n".repeat(99999) })).toBe(true);
    const restored = loadDraft();
    expect(restored).not.toBeNull();
    expect(restored?.description).toHaveLength(DRAFT_MAX_TEXT_LENGTH);
    expect(restored?.conciergeNote).toHaveLength(DRAFT_MAX_TEXT_LENGTH);
    expect(restored?.category).toBe("Coat");
  });

  it("exactly-at-limit text round-trips unchanged", () => {
    saveDraft({ ...base, size: "s".repeat(DRAFT_MAX_TEXT_LENGTH) });
    expect(loadDraft()?.size).toHaveLength(DRAFT_MAX_TEXT_LENGTH);
  });

  it("refuses to persist a draft that restore would reject", () => {
    expect(saveDraft({ ...base, budgetUsd: -1 })).toBe(false);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });
});

describe("surrogate safety", () => {
  beforeEach(() => localStorage.clear());
  const d = {
    category: "Coat" as const, description: "x", size: "", condition: "either" as const,
    region: "US" as const, budgetUsd: null, conciergeNote: "", savedAt: new Date().toISOString(),
  };

  it("saveDraft never persists a split surrogate pair", () => {
    expect(saveDraft({ ...d, description: "a".repeat(4999) + "😀" })).toBe(true);
    const restored = loadDraft();
    expect(restored?.description).toBe("a".repeat(4999));
    expect(() => encodeURIComponent(restored!.description)).not.toThrow();
  });

  it("restore repairs lone surrogates from stored drafts", () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...d, description: "ab\uD83D", conciergeNote: "\uDE00n" }));
    const restored = loadDraft();
    expect(restored?.description).toBe("ab");
    expect(restored?.conciergeNote).toBe("n");
  });
});

describe("saving preference and emptiness", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("pause flag round-trips and holds no shopper data", () => {
    expect(isSavingPaused()).toBe(false);
    expect(setSavingPaused(true)).toBe(true);
    expect(isSavingPaused()).toBe(true);
    expect(localStorage.getItem(DRAFT_PAUSE_KEY)).toBe("1");
    expect(setSavingPaused(false)).toBe(true);
    expect(isSavingPaused()).toBe(false);
  });

  it("pause helpers never throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("x", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("x", "SecurityError"); });
    expect(isSavingPaused()).toBe(false);
    expect(setSavingPaused(true)).toBe(false);
  });

  it("isDraftEmpty only ignores default condition/region", () => {
    const base = { category: "" as const, description: "", size: "", condition: "either" as const, region: "MX" as const, budgetUsd: null, conciergeNote: "" };
    expect(isDraftEmpty(base)).toBe(true);
    expect(isDraftEmpty({ ...base, conciergeNote: "n" })).toBe(false);
    expect(isDraftEmpty({ ...base, budgetUsd: 5 })).toBe(false);
  });

  it("deleted drafts stay deleted through load", () => {
    saveDraft({ category: "Coat", description: "x", size: "", condition: "either", region: "US", budgetUsd: null, conciergeNote: "n", savedAt: new Date().toISOString() });
    expect(clearDraft()).toBe(true);
    expect(loadDraft()).toBeNull();
  });
});
