import { afterEach, expect, it, vi } from "vitest";
import {
  checkLocalCatalog, parseCatalogResults, parseLocalStatus,
  searchLocalCatalog, LocalCatalogError,
} from "./catalogClient";

afterEach(() => { vi.unstubAllGlobals(); });

const status = {
  ebay: {
    provider: "ebay", status: "available", liveRequestsAllowed: true,
    supportedRegions: ["US"], keywordSearch: true, imageSearch: false,
  },
};

const example = {
  provider: "ebay", region: "US", status: "available", checkedAt: "2026-10-13T00:00:00Z",
  listings: [{
    source: "ebay", listingId: "synthetic-1", title: "Test jacket, not real inventory",
    merchantUrl: "https://www.ebay.com/itm/111",
    price: { amount: 50, currency: "USD" }, shipping: null,
    condition: "used", sizeText: "L", checkedAt: "2026-10-13T00:00:00Z",
    matching: "unverified", availability: "unknown",
  }],
};

function mockedResponse(data: unknown) {
  return { ok: true, headers: new Headers(), text: async () => JSON.stringify(data) };
}

it("does not fetch anything on module import; local check is an explicit loopback GET", async () => {
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => mockedResponse(status));
  vi.stubGlobal("fetch", fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  const result = await checkLocalCatalog();
  expect(result.kind).toBe("available");
  expect(result.supportedRegions).toEqual(["US"]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:3927/api/catalog/status");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "GET", credentials: "omit", cache: "no-store",
    redirect: "error", referrerPolicy: "no-referrer",
  });
});

it("fails closed if provider flags disagree or status shape is malformed", () => {
  expect(parseLocalStatus({ ebay: { ...status.ebay, status: "disabled" } }).kind).toBe("disabled");
  expect(parseLocalStatus({ ebay: { ...status.ebay, liveRequestsAllowed: false } }).kind).toBe("disabled");
  expect(() => parseLocalStatus({ ebay: { ...status.ebay, supportedRegions: null } })).toThrow(LocalCatalogError);
  expect(parseLocalStatus({ ebay: { ...status.ebay, supportedRegions: ["MX"] } }).supportedRegions).toEqual([]);
});

it("refuses Mexico, invalid queries and long text before any local request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(searchLocalCatalog("Jacket brown", "MX")).rejects.toThrow(LocalCatalogError);
  await expect(searchLocalCatalog("Jacket ".repeat(60), "US")).rejects.toThrow(LocalCatalogError);
  await expect(searchLocalCatalog(" ", "US")).rejects.toThrow(LocalCatalogError);
  expect(fetcher).not.toHaveBeenCalled();
});

it("accepts only safe eBay keyword listings and never invents price totals", () => {
  const safe = parseCatalogResults({ ...example, listings: [
    ...example.listings,
    { ...example.listings[0], listingId: "unsafe", merchantUrl: "https://malicious.invalid/steal" },
    { ...example.listings[0], listingId: "fake-exact", matching: "exactVerified" },
    { ...example.listings[0], listingId: "wrong-availability", availability: "available" },
    { ...example.listings[0], listingId: "wrong-currency", price: { amount: 42, currency: "BAD!" } },
  ] });
  expect(safe.listings).toHaveLength(1);
  expect(safe.listings[0].shipping).toBeNull();
  expect(safe.listings[0].merchantUrl).toMatch(/^https:\/\/www\.ebay\.com/);
});

it("explicit local keyword search returns only normalized data, no raw payload", async () => {
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => mockedResponse(example));
  vi.stubGlobal("fetch", fetcher);
  const result = await searchLocalCatalog("Jacket brown", "US");
  expect(result.listings).toHaveLength(1);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toContain("http://127.0.0.1:3927/api/catalog/search?");
  expect(new URL(url).searchParams.get("q")).toBe("Jacket brown");
  expect(options.credentials).toBe("omit");
  expect(JSON.stringify(result)).not.toContain("clientSecret");
});

it("rejects invalid responses without implying successful search", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => mockedResponse({ status: "available", listings: "fake" })));
  await expect(searchLocalCatalog("Jacket brown", "US")).rejects.toThrow(LocalCatalogError);
  expect(() => parseCatalogResults({ ...example, region: "MX" })).toThrow(LocalCatalogError);
});
