export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const DRAFT_STORAGE_KEY = "fitcheck-v2-search-draft-v1";

export type ShipRegion = "US" | "MX";

export type ItemCondition = "new" | "used" | "either";

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
