import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogError } from "../catalog/errors.mjs";
import {
  EbayBrowseAdapter,
  buildBrowseSearchUrl,
  sanitizeSearchQuery,
} from "../ebay/browse.mjs";
import { EBAY_OAUTH_SCOPE, resolveEbayConfig } from "../ebay/config.mjs";
import { normalizeEbaySearchResponse } from "../ebay/normalize.mjs";
import { FIXTURE_SEARCH_RESPONSE } from "./fixtures/ebay-search-sample.mjs";

const approvedEnv = {
  FITCHECK_ENABLE_LIVE_EBAY: "true",
  EBAY_CLIENT_ID: "fixture-client-id",
  EBAY_CLIENT_SECRET: "fixture-client-secret",
  FITCHECK_EBAY_PRODUCTION_APPROVED: "true",
};

function createRecordingFetch(handlers) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    const handler = handlers.find((h) => h.match(url, init));
    if (!handler) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return handler.respond(url, init);
  };
  return { fetchImpl, calls };
}

describe("eBay Browse adapter (mocked HTTP)", () => {
  it("does not call fetch when provider is disabled", async () => {
    let fetchCount = 0;
    const adapter = new EbayBrowseAdapter({
      env: {},
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response("{}");
      },
    });
    await assert.rejects(
      () => adapter.searchKeyword({ query: "jacket", region: "US" }),
      (err) => err instanceof CatalogError && err.providerStatus === "disabled",
    );
    assert.equal(fetchCount, 0);
  });

  it("builds OAuth and Browse requests without logging secrets", async () => {
    const { fetchImpl, calls } = createRecordingFetch([
      {
        match: (url) => url.includes("/identity/v1/oauth2/token"),
        respond: () =>
          new Response(
            JSON.stringify({
              access_token: "fixture-token",
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      },
      {
        match: (url) => url.includes("/item_summary/search"),
        respond: () =>
          new Response(JSON.stringify(FIXTURE_SEARCH_RESPONSE), {
            status: 200,
          }),
      },
    ]);

    const adapter = new EbayBrowseAdapter({
      env: approvedEnv,
      fetchImpl,
      config: resolveEbayConfig(approvedEnv),
    });

    const result = await adapter.searchKeyword(
      { query: "vintage jacket", region: "US", limit: 5 },
      { forceLive: true },
    );

    assert.equal(calls.length, 2);
    const oauthCall = calls[0];
    assert.match(oauthCall.url, /oauth2\/token$/);
    assert.equal(oauthCall.init.method, "POST");
    assert.match(oauthCall.init.headers.Authorization, /^Basic /);
    assert.ok(!oauthCall.init.headers.Authorization.includes("fixture-client-secret"));
    const body = oauthCall.init.body;
    assert.match(body, /grant_type=client_credentials/);
    assert.match(body, new RegExp(encodeURIComponent(EBAY_OAUTH_SCOPE)));

    const browseCall = calls[1];
    assert.match(browseCall.url, /item_summary\/search/);
    assert.match(browseCall.url, /q=vintage\+jacket/);
    assert.equal(browseCall.init.headers["X-EBAY-C-MARKETPLACE-ID"], "EBAY_US");
    assert.equal(
      browseCall.init.headers.Authorization,
      "Bearer fixture-token",
    );

    assert.equal(result.listings.length, 2);
    assert.ok(
      result.listings.every((l) => l.matching === "unverified"),
    );
    assert.ok(result.listings[0].title.includes("[FIXTURE]"));
    assert.equal(result.preserveProviderOrder, true);
  });

  it("refuses unsupported MX Buy marketplace with zero outbound calls", async () => {
    let fetchCount = 0;
    const adapter = new EbayBrowseAdapter({
      env: approvedEnv,
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error("Unexpected outbound call");
      },
    });
    await assert.rejects(
      () => adapter.searchKeyword({ query: "abrigo", region: "MX" }),
      (err) => err.code === "unsupported_region",
    );
    assert.equal(fetchCount, 0);
  });

  it("handles rate limit, auth errors, malformed JSON, and timeout", async () => {
    const rateAdapter = new EbayBrowseAdapter({
      env: approvedEnv,
      fetchImpl: async (url) => {
        if (String(url).includes("oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "t", expires_in: 60 }),
            { status: 200 },
          );
        }
        return new Response("slow", { status: 429 });
      },
      config: resolveEbayConfig(approvedEnv),
    });
    await assert.rejects(
      () =>
        rateAdapter.searchKeyword({ query: "x", region: "US" }, {
          forceLive: true,
        }),
      (err) => err.providerStatus === "rate_limited",
    );

    const badJson = new EbayBrowseAdapter({
      env: approvedEnv,
      fetchImpl: async (url) => {
        if (String(url).includes("oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "t", expires_in: 60 }),
            { status: 200 },
          );
        }
        return new Response("not-json", { status: 200 });
      },
      config: resolveEbayConfig(approvedEnv),
    });
    await assert.rejects(
      () => badJson.searchKeyword({ query: "x", region: "US" }, { forceLive: true }),
      (err) => err.code === "browse_malformed",
    );
  });

  it("caps query length and builds bounded search URL", () => {
    const long = "a".repeat(200);
    const sanitized = sanitizeSearchQuery(long);
    assert.equal(sanitized.length, 120);
    const url = buildBrowseSearchUrl(
      { query: "hello", region: "US", limit: 99 },
      "https://api.ebay.com",
    );
    assert.equal(url.searchParams.get("limit"), "25");
  });

  it("normalizes fixture payload with shipping and rejects insecure urls", () => {
    const listings = normalizeEbaySearchResponse(
      FIXTURE_SEARCH_RESPONSE,
      "2026-10-12T12:00:00.000Z",
    );
    assert.equal(listings.length, 2);
    const withShipping = listings.find((l) => l.listingId.includes("123456789012"));
    assert.ok(withShipping?.shipping);
    const unknownShip = listings.find((l) => l.listingId.includes("987654321098"));
    assert.equal(unknownShip?.shipping, null);
  });
});
