/**
 * Strict, optional browser->loopback catalog bridge. It makes NO requests
 * until the shopper explicitly selects Check local catalog or Search.
 * Photos never leave the browser. All marketplace credentials stay server-side.
 */
import type { ShipRegion } from "./constants";

const LOCAL_ORIGIN = "http://127.0.0.1:3927";
const MAX_BODY_CHARS = 100_000;
/** Status checks are local and cheap. */
export const LOCAL_STATUS_TIMEOUT_MS = 5_000;
/**
 * Search waits for the server's overall provider deadline (12s in
 * server/ebay/config.mjs OVERALL_DEADLINE_MS) plus margin, so the browser never
 * gives up before the server can report its own timeout.
 */
export const LOCAL_SEARCH_TIMEOUT_MS = 15_000;
const MAX_LISTINGS = 10;

export interface LocalCatalogStatus {
  kind: "available" | "disabled";
  reason: string;
  supportedRegions: ShipRegion[];
}
export interface CatalogListing {
  listingId: string;
  title: string;
  merchantUrl: string;
  price: { amount: number; currency: string };
  shipping: { amount: number; currency: string } | null;
  condition: "new" | "used" | "unknown";
  sizeText: string | null;
  checkedAt: string;
  // All results are keyword-only and NEVER exact-photo matches.
}
export interface CatalogResults {
  listings: CatalogListing[];
  checkedAt: string;
}

export class LocalCatalogError extends Error {
  constructor() {
    super("The optional local catalog is unavailable. Use marketplace search links instead.");
    this.name = "LocalCatalogError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The loopback catalog bridge exists only in a developer's local build.
 * Production bundles must not offer it and must never probe a visitor's localhost.
 */
export function isLocalCatalogSupported(): boolean {
  return import.meta.env.DEV === true;
}

async function readJson(path: string, timeoutMs: number): Promise<unknown> {
  // Never probe a visitor’s localhost from a production-hosted website.
  if (!isLocalCatalogSupported()) throw new LocalCatalogError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(LOCAL_ORIGIN + path, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok || Number(response.headers.get("content-length") || "0") > MAX_BODY_CHARS) {
      throw new LocalCatalogError();
    }
    const body = await response.text();
    if (body.length > MAX_BODY_CHARS) throw new LocalCatalogError();
    return JSON.parse(body) as unknown;
  } catch {
    throw new LocalCatalogError();
  } finally {
    clearTimeout(timeout);
  }
}

export function parseLocalStatus(raw: unknown): LocalCatalogStatus {
  const response = asRecord(raw);
  const ebay = asRecord(response?.ebay);
  if (!ebay || ebay.provider !== "ebay" || !Array.isArray(ebay.supportedRegions)) {
    throw new LocalCatalogError();
  }
  const regions = ebay.supportedRegions.filter((x): x is ShipRegion => x === "US" || x === "MX");
  if (!ebay.liveRequestsAllowed || ebay.status !== "available" || ebay.keywordSearch !== true) {
    return {
      kind: "disabled",
      reason: typeof ebay.status === "string" ? ebay.status.slice(0, 40) : "disabled",
      supportedRegions: [],
    };
  }
  // This app's eBay Buy adapter only supports EBAY_US.
  return { kind: "available", reason: "Connected (keyword only)", supportedRegions: regions.filter(x => x === "US") };
}

export async function checkLocalCatalog(): Promise<LocalCatalogStatus> {
  return parseLocalStatus(await readJson("/api/catalog/status", LOCAL_STATUS_TIMEOUT_MS));
}

function validEbayUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "ebay.com" || url.hostname.endsWith(".ebay.com")) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

function money(raw: unknown): { amount: number; currency: string } | null {
  const v = asRecord(raw);
  return typeof v?.amount === "number" && Number.isFinite(v.amount) &&
    v.amount >= 0 && v.amount < 100_000_000 &&
    typeof v.currency === "string" && /^[A-Z]{3}$/.test(v.currency)
      ? { amount: v.amount, currency: v.currency }
      : null;
}

export function parseCatalogResults(raw: unknown): CatalogResults {
  const doc = asRecord(raw);
  if (doc?.provider !== "ebay" || doc.status !== "available" ||
      doc.region !== "US" || !Array.isArray(doc.listings) || doc.listings.length > 25 ||
      typeof doc.checkedAt !== "string" || !Number.isFinite(Date.parse(doc.checkedAt))) {
    throw new LocalCatalogError();
  }
  const entries: CatalogListing[] = [];
  for (const value of doc.listings) {
    const item = asRecord(value);
    if (!item || item.source !== "ebay" ||
        typeof item.listingId !== "string" || !item.listingId || item.listingId.length > 150 ||
        typeof item.title !== "string" || !item.title.trim() ||
        !validEbayUrl(item.merchantUrl) ||
        item.matching !== "unverified" || item.availability !== "unknown") {
      continue;
    }
    const price = money(item.price);
    if (!price) continue;
    const shipping = item.shipping === null ? null : money(item.shipping);
    if (item.shipping !== null && !shipping) continue;
    entries.push({
      listingId: item.listingId,
      title: item.title.slice(0, 180),
      merchantUrl: item.merchantUrl,
      price,
      shipping,
      condition: item.condition === "new" || item.condition === "used" ? item.condition : "unknown",
      sizeText: typeof item.sizeText === "string" ? item.sizeText.slice(0, 80) : null,
      checkedAt: typeof item.checkedAt === "string" && !Number.isNaN(Date.parse(item.checkedAt))
        ? item.checkedAt
        : doc.checkedAt,
    });
    if (entries.length >= MAX_LISTINGS) break;
  }
  return { listings: entries, checkedAt: doc.checkedAt };
}

export async function searchLocalCatalog(query: string, region: ShipRegion): Promise<CatalogResults> {
  // Explicit search only. Never send photos, private contact fields, or stored notes.
  if (region !== "US" || query.length < 3 || query.length > 120 || !query.trim()) {
    throw new LocalCatalogError();
  }
  const params = new URLSearchParams({ q: query, region: "US", limit: String(MAX_LISTINGS) });
  return parseCatalogResults(await readJson("/api/catalog/search?" + params.toString(), LOCAL_SEARCH_TIMEOUT_MS));
}
