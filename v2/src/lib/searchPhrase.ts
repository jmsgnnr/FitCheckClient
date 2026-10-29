import type { ItemCategory, ItemCondition, ShipRegion } from "./constants";

export interface SearchDraftInput {
  category: ItemCategory | "";
  description: string;
  size: string;
  condition: ItemCondition;
  region: ShipRegion;
  budgetUsd: number | null;
}

/**
 * Text-only keywords: item type, description, size and condition.
 * Destination and budget are deliberately NOT appended. Neither eBay's keyword
 * search nor this app's catalog adapter treats "ship US" or "under $80" as a
 * verified filter, and extra words can silently exclude good listings. They are
 * shown beside the phrase as unapplied constraints (see shoppingConstraints.ts).
 */
export function buildSearchPhrase(input: SearchDraftInput): string {
  const parts: string[] = [];
  if (input.category) {
    parts.push(input.category);
  }
  const desc = input.description.trim();
  if (desc) {
    parts.push(desc);
  }
  const size = input.size.trim();
  if (size) {
    parts.push(`size ${size}`);
  }
  if (input.condition === "new") {
    parts.push("new");
  } else if (input.condition === "used") {
    parts.push("used pre-owned");
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function isSearchReady(input: SearchDraftInput): boolean {
  return input.category !== "" && input.description.trim().length >= 3;
}
