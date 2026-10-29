import { describe, expect, it } from "vitest";
import { buildSearchPhrase, isSearchReady } from "./searchPhrase";

const base = {
  category: "Jacket" as const,
  description: "brown suede trucker",
  size: "M",
  condition: "used" as const,
  region: "US" as const,
  budgetUsd: 80,
};

describe("buildSearchPhrase", () => {
  it("combines user-supplied fields", () => {
    const phrase = buildSearchPhrase(base);
    expect(phrase).toContain("Jacket");
    expect(phrase).toContain("brown suede trucker");
    expect(phrase).toContain("size M");
    expect(phrase).toContain("used");
  });

  it("is text-only: destination and budget are never appended as pseudo-filters", () => {
    for (const region of ["US", "MX"] as const) {
      const phrase = buildSearchPhrase({ ...base, region, budgetUsd: 80 });
      expect(phrase).toBe("Jacket brown suede trucker size M used pre-owned");
      expect(phrase).not.toMatch(/ship|under|\$|80|mexico/i);
    }
  });

  it("does not change when only destination or budget changes", () => {
    const a = buildSearchPhrase({ ...base, region: "US", budgetUsd: null });
    const b = buildSearchPhrase({ ...base, region: "MX", budgetUsd: 500 });
    expect(a).toBe(b);
  });

  it("handles either condition without extra token", () => {
    const phrase = buildSearchPhrase({ ...base, condition: "either" });
    expect(phrase).not.toMatch(/\beither\b/);
  });
});

describe("isSearchReady", () => {
  it("requires category and description", () => {
    expect(isSearchReady(base)).toBe(true);
    expect(isSearchReady({ ...base, description: "ab" })).toBe(false);
    expect(isSearchReady({ ...base, category: "" })).toBe(false);
  });
});
