import { describe, expect, it } from "vitest";
import { buildMarketplaceSearchUrl } from "./marketplaceUrls";

describe("buildMarketplaceSearchUrl", () => {
  it("encodes eBay keyword search", () => {
    const url = buildMarketplaceSearchUrl("ebay", "vintage leather jacket M");
    expect(url).toBe(
      "https://www.ebay.com/sch/i.html?_nkw=vintage%20leather%20jacket%20M",
    );
  });

  it("encodes Etsy search", () => {
    const url = buildMarketplaceSearchUrl("etsy", "pink dress & beads");
    expect(url).toBe(
      "https://www.etsy.com/search?q=pink%20dress%20%26%20beads",
    );
  });

  it("rejects empty query", () => {
    expect(() => buildMarketplaceSearchUrl("ebay", "   ")).toThrow();
  });
});
