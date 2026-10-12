import { DRAFT_STORAGE_KEY } from "./constants";
import type { SearchDraftInput } from "./searchPhrase";

/** Metadata only — never stores image bytes or object URLs. */
export interface PersistedDraft extends SearchDraftInput {
  savedAt: string;
  conciergeNote: string;
  // Do not persist optional contact email. Keep it in memory until copied.
}

export function loadDraft(): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDraft;
    if (!parsed || typeof parsed !== "object") return null;
    // Allowlisted metadata only. This also strips contact email from older drafts.
    const { category, description, size, condition, region, budgetUsd, savedAt, conciergeNote } = parsed;
    return { category, description, size, condition, region, budgetUsd, savedAt, conciergeNote };
  } catch {
    return null;
  }
}

export function saveDraft(draft: PersistedDraft): void {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function buildConciergeBrief(
  input: SearchDraftInput,
  phrase: string,
  conciergeNote: string,
  conciergeEmail: string,
): string {
  const lines = [
    "FITCHECK SOURCING BRIEF (LOCAL COPY - NOT SUBMITTED)",
    "--------------------------------------------------",
    `Item focus: ${input.category || "(not set)"}`,
    `Description: ${input.description.trim() || "(not set)"}`,
    `Size: ${input.size.trim() || "(optional)"}`,
    `Condition: ${input.condition}`,
    `Ship to: ${input.region}`,
    input.budgetUsd != null
      ? `Max budget (USD): $${input.budgetUsd}`
      : "Max budget: none specified",
    `Search phrase used: ${phrase || "(incomplete)"}`,
    "",
    "User notes:",
    conciergeNote.trim() || "(none)",
    "",
    "Contact (optional, not sent):",
    conciergeEmail.trim() || "(none)",
    "",
    "Human concierge is NOT available yet. This brief is for your records only.",
  ];
  return lines.join("\n");
}
