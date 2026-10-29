import { clampText, stripLoneSurrogates } from "./textLimit";
import {
  DRAFT_MAX_TEXT_LENGTH,
  DRAFT_PAUSE_KEY,
  DRAFT_STORAGE_KEY,
  DRAFT_TTL_MS,
  ITEM_CATEGORIES,
  ITEM_CONDITIONS,
  SHIP_REGIONS,
  type ItemCategory,
  type ItemCondition,
  type ShipRegion,
} from "./constants";
import type { SearchDraftInput } from "./searchPhrase";

/** Metadata only — never stores image bytes or object URLs. */
export interface PersistedDraft extends SearchDraftInput {
  savedAt: string;
  conciergeNote: string;
  // Do not persist optional contact email. Keep it in memory until copied.
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= DRAFT_MAX_TEXT_LENGTH;
}

/**
 * Runtime validation of untrusted persisted JSON. Returns a new object built
 * only from allowlisted, type-checked fields (this also strips any legacy
 * contact email), or null when anything is wrong or the draft has expired.
 */
export function validateDraft(value: unknown, now: number = Date.now()): PersistedDraft | null {
  if (!isRecord(value)) return null;
  const { category, description, size, condition, region, budgetUsd, savedAt, conciergeNote } = value;
  if (category !== "" && !(ITEM_CATEGORIES as readonly unknown[]).includes(category)) return null;
  if (!isText(description) || !isText(size) || !isText(conciergeNote)) return null;
  if (!(ITEM_CONDITIONS as readonly unknown[]).includes(condition)) return null;
  if (!(SHIP_REGIONS as readonly unknown[]).includes(region)) return null;
  if (budgetUsd !== null && !(typeof budgetUsd === "number" && Number.isFinite(budgetUsd) && budgetUsd > 0)) {
    return null;
  }
  if (typeof savedAt !== "string") return null;
  const savedMs = Date.parse(savedAt);
  if (!Number.isFinite(savedMs)) return null;
  // Future-dated (beyond a day of clock skew) or past the retention window.
  if (savedMs > now + 24 * 60 * 60 * 1000 || now - savedMs > DRAFT_TTL_MS) return null;
  return {
    category: category as ItemCategory | "",
    // Repair (not reject) unpaired surrogates from older or hand-edited drafts.
    description: stripLoneSurrogates(description),
    size: stripLoneSurrogates(size),
    condition: condition as ItemCondition,
    region: region as ShipRegion,
    budgetUsd: budgetUsd as number | null,
    savedAt,
    conciergeNote: stripLoneSurrogates(conciergeNote),
  };
}

/** Read-only view of the stored draft (no cleanup writes). Never throws. */
export function peekDraft(now: number = Date.now()): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? validateDraft(JSON.parse(raw), now) : null;
  } catch {
    return null;
  }
}

/** Never throws. Invalid, corrupted or expired drafts are removed best-effort. */
export function loadDraft(now: number = Date.now()): PersistedDraft | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let draft: PersistedDraft | null = null;
  let hasExtraKeys = false;
  try {
    const parsed: unknown = JSON.parse(raw);
    draft = validateDraft(parsed, now);
    hasExtraKeys = draft !== null && isRecord(parsed) &&
      Object.keys(parsed).some((key) => !(key in draft!));
  } catch {
    draft = null;
  }
  if (!draft) clearDraft();
  // Scrub legacy extras (for example an old contact email) without touching savedAt.
  else if (hasExtraKeys) saveDraft(draft);
  return draft;
}

/** Returns true only if the draft was actually written (false when paused or blocked). Never throws. */
export function saveDraft(draft: PersistedDraft): boolean {
  // Clamp to the same limits restore enforces, and refuse anything restore would
  // discard, so the app can never persist a draft its own loader rejects.
  const clamped: PersistedDraft = {
    ...draft,
    description: clampText(draft.description, DRAFT_MAX_TEXT_LENGTH),
    size: clampText(draft.size, DRAFT_MAX_TEXT_LENGTH),
    conciergeNote: clampText(draft.conciergeNote, DRAFT_MAX_TEXT_LENGTH),
  };
  if (validateDraft(clamped) === null) return false;
  // Enforced here, on every write, so a pause set by another tab is honored too.
  if (isSavingPaused()) return false;
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(clamped));
    return true;
  } catch {
    return false;
  }
}

/** Returns true only if the stored draft is confirmed absent. Never throws. */
export function clearDraft(): boolean {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the shopper deliberately turned saving off (for example by deleting
 * the saved fields). The marker is a bare flag; it holds no shopper data.
 */
export function isSavingPaused(): boolean {
  try {
    return localStorage.getItem(DRAFT_PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Returns true only if the preference was stored. Never throws. */
export function setSavingPaused(paused: boolean): boolean {
  try {
    if (paused) localStorage.setItem(DRAFT_PAUSE_KEY, "1");
    else localStorage.removeItem(DRAFT_PAUSE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** A draft with no shopper-entered content is not worth persisting. */
export function isDraftEmpty(d: Omit<PersistedDraft, "savedAt">): boolean {
  return d.category === "" && d.description === "" && d.size === "" &&
    d.conciergeNote === "" && d.budgetUsd === null;
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
