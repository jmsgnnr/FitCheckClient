import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIND_FAILED_MESSAGE,
  FIND_TIMEOUT_MESSAGE,
  WORKER_QUOTA_MESSAGE,
  WORKER_UNSUPPORTED_PHOTO_MESSAGE,
  canSearch,
  createDemoProvider,
  createWorkerProvider,
  findWithDeadline,
  formatWorkerIdentified,
  matchLabel,
} from "./findFit";

const photo = new File([new Uint8Array([1])], "fit.png", { type: "image/png" });

vi.mock("./preparePhoto", () => ({
  preparePhoto: vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" })),
}));

describe("findFit", () => {
  it("reserves Exact match for product-level evidence", () => {
    expect(matchLabel("product_id")).toBe("Exact match");
    expect(matchLabel("visual_only")).toBe("Similar");
  });

  it("needs a photo, and consent only when the photo leaves the device", () => {
    expect(canSearch({ sendsPhoto: false }, false, true)).toBe(false);
    expect(canSearch({ sendsPhoto: false }, true, false)).toBe(true);
    expect(canSearch({ sendsPhoto: true }, true, false)).toBe(false);
    expect(canSearch({ sendsPhoto: true }, true, true)).toBe(true);
  });

  it("demo provider keeps the photo local and returns unlinked samples", async () => {
    const provider = createDemoProvider("results", 0);
    expect(provider.sendsPhoto).toBe(false);
    expect(provider.isDemo).toBe(true);
    const result = await findWithDeadline(provider, photo);
    expect(result.identified).toBeNull();
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.listings.every((listing) => listing.url === undefined)).toBe(true);
    expect(result.listings.every((listing) => listing.title.startsWith("Sample"))).toBe(true);
  });

  it("returns an empty result and surfaces provider failure", async () => {
    await expect(findWithDeadline(createDemoProvider("empty", 0), photo)).resolves.toEqual({ identified: null, listings: [] });
    await expect(findWithDeadline(createDemoProvider("error", 0), photo)).rejects.toThrow();
  });

  it("stops a slow provider at the deadline", async () => {
    await expect(findWithDeadline(createDemoProvider("slow"), photo, 10)).rejects.toThrow(FIND_TIMEOUT_MESSAGE);
  });
});

describe("formatWorkerIdentified", () => {
  it("uses returned fields and falls back when brand and model are missing", () => {
    expect(formatWorkerIdentified({ brand: "Nike", model: "Air Max", colorway: "White", styleCode: "1" }))
      .toBe("Nike Air Max in White (1)");
    expect(formatWorkerIdentified({ brand: null, model: null })).toBe("Couldn't identify the exact item");
  });
});

describe("createWorkerProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends nothing without a successful consent path", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createWorkerProvider("https://api.example");
    expect(provider.sendsPhoto).toBe(true);
    expect(provider.listingsAreSamples).toBe(true);
    expect(canSearch(provider, true, false)).toBe(false);
    if (canSearch(provider, true, false)) {
      await provider.find(photo, new AbortController().signal);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the prepared photo with the consent header and maps identify results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        identified: {
          category: "shoes",
          brand: "Nike",
          model: "Air Force 1",
          colorway: "White",
          styleCode: null,
          visibleText: [],
          uncertainties: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createWorkerProvider("https://api.example/");
    expect(canSearch(provider, true, true)).toBe(true);
    const result = await provider.find(photo, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/api/identify");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-FitCheck-Consent")).toBe("yes");
    expect(result.identified).toBe("Nike Air Force 1 in White");
    expect(result.listings.every((listing) => listing.url === undefined)).toBe(true);
  });

  it("maps quota and unsupported errors to plain messages", async () => {
    const provider = createWorkerProvider("https://api.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Quota exhausted", code: "quota_exhausted" }),
      }),
    );
    await expect(provider.find(photo, new AbortController().signal)).rejects.toThrow(WORKER_QUOTA_MESSAGE);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Unsupported photo", code: "unsupported_photo" }),
      }),
    );
    await expect(provider.find(photo, new AbortController().signal)).rejects.toThrow(
      WORKER_UNSUPPORTED_PHOTO_MESSAGE,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Identify failed", code: "identify_failed" }),
      }),
    );
    await expect(provider.find(photo, new AbortController().signal)).rejects.toThrow(FIND_FAILED_MESSAGE);
  });
});
