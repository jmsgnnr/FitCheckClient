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
    expect(phrase).toContain("ship US");
    expect(phrase).toContain("under $80");
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
