import { describe, expect, it } from "vitest";
import {
  FIND_TIMEOUT_MESSAGE,
  canSearch,
  createDemoProvider,
  findWithDeadline,
  matchLabel,
} from "./findFit";

const photo = new File([new Uint8Array([1])], "fit.png", { type: "image/png" });

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
