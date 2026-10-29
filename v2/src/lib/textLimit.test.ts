import { describe, expect, it } from "vitest";
import { DRAFT_MAX_TEXT_LENGTH } from "./constants";
import { clampText, stripLoneSurrogates } from "./textLimit";
import { buildMarketplaceSearchUrl } from "./marketplaceUrls";
import { buildSearchPhrase } from "./searchPhrase";

describe("textLimit", () => {
  it("does not leave a lone high surrogate when truncating 4,999 ASCII + emoji", () => {
    const out = clampText("a".repeat(4999) + "😀", DRAFT_MAX_TEXT_LENGTH);
    expect(out).toBe("a".repeat(4999));
    expect(() => encodeURIComponent(out)).not.toThrow();
  });

  it("keeps an emoji that fits exactly", () => {
    const out = clampText("a".repeat(4998) + "😀", DRAFT_MAX_TEXT_LENGTH);
    expect(out.length).toBe(5000);
    expect(out.endsWith("😀")).toBe(true);
  });

  it("removes unpaired surrogates anywhere and keeps valid pairs", () => {
    expect(stripLoneSurrogates("a\uD83Db\uDE00c😀")).toBe("abc😀");
  });

  it("clamped text builds a marketplace URL without throwing", () => {
    const description = clampText("a".repeat(4999) + "😀", DRAFT_MAX_TEXT_LENGTH);
    const phrase = buildSearchPhrase({ category: "Coat", description, size: "", condition: "either", region: "US", budgetUsd: null });
    expect(() => buildMarketplaceSearchUrl("ebay", phrase)).not.toThrow();
  });
});
