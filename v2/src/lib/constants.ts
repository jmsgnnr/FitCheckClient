export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const DRAFT_STORAGE_KEY = "fitcheck-v2-search-draft-v1";

/** Bare "saving paused" flag; holds no shopper data. */
export const DRAFT_PAUSE_KEY = "fitcheck-v2-search-draft-paused-v1";

/** Saved search fields older than this are discarded on load. */
export const DRAFT_TTL_DAYS = 30;
export const DRAFT_TTL_MS = DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;
/** Upper bound for any persisted free-text field. */
export const DRAFT_MAX_TEXT_LENGTH = 5000;

export type ShipRegion = "US" | "MX";

export type ItemCondition = "new" | "used" | "either";

export const ITEM_CONDITIONS: readonly ItemCondition[] = ["new", "used", "either"];
export const SHIP_REGIONS: readonly ShipRegion[] = ["US", "MX"];

export type Marketplace = "ebay" | "etsy";

export const ITEM_CATEGORIES = [
  "Dress",
  "Top",
  "Jacket",
  "Coat",
  "Pants",
  "Jeans",
  "Skirt",
  "Shoes",
  "Bag",
  "Accessory",
  "Other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
