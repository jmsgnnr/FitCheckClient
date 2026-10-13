import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEbayConfig } from "../ebay/config.mjs";

describe("eBay config gating", () => {
  it("defaults to disabled with zero outbound permission", () => {
    const config = resolveEbayConfig({});
    assert.equal(config.status, "disabled");
    assert.equal(config.liveRequestsAllowed, false);
  });

  it("stays disabled when only credentials are present", () => {
    const config = resolveEbayConfig({
      EBAY_CLIENT_ID: "id",
      EBAY_CLIENT_SECRET: "secret",
    });
    assert.equal(config.status, "disabled");
    assert.equal(config.liveRequestsAllowed, false);
  });

  it("requires approval flag after live enable + credentials", () => {
    const awaiting = resolveEbayConfig({
      FITCHECK_ENABLE_LIVE_EBAY: "true",
      EBAY_CLIENT_ID: "id",
      EBAY_CLIENT_SECRET: "secret",
    });
    assert.equal(awaiting.status, "awaiting_approval");
    assert.equal(awaiting.liveRequestsAllowed, false);

    const available = resolveEbayConfig({
      FITCHECK_ENABLE_LIVE_EBAY: "true",
      EBAY_CLIENT_ID: "id",
      EBAY_CLIENT_SECRET: "secret",
      FITCHECK_EBAY_PRODUCTION_APPROVED: "true",
    });
    assert.equal(available.status, "available");
    assert.equal(available.liveRequestsAllowed, true);
  });

  it("reports not_configured when live flag on without secrets", () => {
    const config = resolveEbayConfig({
      FITCHECK_ENABLE_LIVE_EBAY: "true",
    });
    assert.equal(config.status, "not_configured");
  });
});
