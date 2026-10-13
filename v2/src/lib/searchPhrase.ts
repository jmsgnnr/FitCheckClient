import type { ItemCategory, ItemCondition, ShipRegion } from "./constants";

export interface SearchDraftInput {
  category: ItemCategory | "";
  description: string;
  size: string;
  condition: ItemCondition;
  region: ShipRegion;
  budgetUsd: number | null;
}

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
  if (input.region === "MX") {
    parts.push("ship Mexico");
  } else {
    parts.push("ship US");
  }
  if (input.budgetUsd != null) {
    parts.push(`under $${Math.round(input.budgetUsd)}`);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function isSearchReady(input: SearchDraftInput): boolean {
  return input.category !== "" && input.description.trim().length >= 3;
}
