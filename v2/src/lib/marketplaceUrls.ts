import type { Marketplace } from "./constants";

const EBAY_SEARCH = "https://www.ebay.com/sch/i.html";
const ETSY_SEARCH = "https://www.etsy.com/search";

export function buildMarketplaceSearchUrl(
  platform: Marketplace,
  query: string,
): string {
  const q = query.trim();
  if (!q) {
    throw new Error("Search phrase is required for marketplace handoff.");
  }
  const encoded = encodeURIComponent(q);
  if (platform === "ebay") {
    return `${EBAY_SEARCH}?_nkw=${encoded}`;
  }
  return `${ETSY_SEARCH}?q=${encoded}`;
}
