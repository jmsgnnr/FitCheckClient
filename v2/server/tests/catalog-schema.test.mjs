import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeListings,
  parseMoney,
  validateNormalizedListing,
} from "../catalog/schema.mjs";
import { describeLandedTotal, rankListings } from "../catalog/pricing.mjs";

describe("catalog schema and pricing", () => {
  it("rejects invalid money and http urls", () => {
    assert.equal(parseMoney(-1, "USD").ok, false);
    assert.equal(parseMoney("12.5", "usd").ok, false);
    const listing = {
      source: "ebay",
      listingId: "x",
      title: "t",
      merchantUrl: "http://bad.example/x",
      price: { amount: 10, currency: "USD" },
      shipping: null,
      taxEstimate: null,
      condition: "unknown",
      availability: "unknown",
      checkedAt: new Date().toISOString(),
      matching: "unverified",
      evidence: ["keyword_search_only"],
    };
    assert.equal(validateNormalizedListing(listing).ok, false);
  });

  it("dedupes by source and listing id", () => {
    const base = {
      source: "ebay",
      listingId: "1",
      title: "a",
      merchantUrl: "https://www.ebay.com/itm/1",
      price: { amount: 1, currency: "USD" },
      shipping: null,
      taxEstimate: null,
      condition: "unknown",
      availability: "unknown",
      checkedAt: "2026-01-01T00:00:00.000Z",
      matching: "unverified",
      evidence: [],
    };
    const out = dedupeListings([base, { ...base, title: "b" }]);
    assert.equal(out.length, 1);
  });

  it("does not rank when shipping is unknown", () => {
    const a = {
      source: "ebay",
      listingId: "a",
      title: "high list",
      merchantUrl: "https://www.ebay.com/itm/a",
      price: { amount: 100, currency: "USD" },
      shipping: null,
      taxEstimate: null,
      condition: "unknown",
      availability: "unknown",
      checkedAt: "2026-01-01T00:00:00.000Z",
      matching: "unverified",
      evidence: [],
    };
    const b = {
      ...a,
      listingId: "b",
      price: { amount: 5, currency: "USD" },
    };
    const ranked = rankListings([a, b], { preserveProviderOrder: false });
    assert.deepEqual(ranked.map((x) => x.listingId), ["a", "b"]);
    const landed = describeLandedTotal(a.price, a.shipping, null);
    assert.equal(landed.kind, "partial");
  });


  it("does not sort across different complete currencies", () => {
    const base = {
      source: "ebay",
      title: "fixture",
      merchantUrl: "https://www.ebay.com/itm/sample",
      condition: "unknown",
      availability: "unknown",
      matching: "unverified",
      checkedAt: "2026-10-12T00:00:00.000Z",
      evidence: ["keyword_search_only"],
      taxEstimate: null,
    };
    const usd = { ...base, listingId: "usd", price: { amount: 100, currency: "USD" }, shipping: { amount: 0, currency: "USD" } };
    const mxn = { ...base, listingId: "mxn", price: { amount: 1, currency: "MXN" }, shipping: { amount: 0, currency: "MXN" } };
    const result = rankListings([usd, mxn], { preserveProviderOrder: false });
    assert.deepEqual(result.map((x) => x.listingId), ["usd", "mxn"]);
  });

  it("computes landed subtotal only with matching currencies", () => {
    const price = { amount: 40, currency: "USD" };
    const shipping = { amount: 10, currency: "USD" };
    const landed = describeLandedTotal(price, shipping, null);
    assert.equal(landed.kind, "complete");
    assert.equal(landed.amount, 50);
    const mixed = describeLandedTotal(price, { amount: 10, currency: "MXN" }, null);
    assert.equal(mixed.kind, "unknown");
  });
});
