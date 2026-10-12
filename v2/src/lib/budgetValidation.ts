export type BudgetValidationResult =
  | { ok: true; value: number | null }
  | { ok: false; message: string };

/** Empty budget means no cap. Positive numbers only when provided. */
export function parseBudgetInput(raw: string): BudgetValidationResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const normalized = trimmed.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      message: "Budget must be a positive number, or leave it blank for no cap.",
    };
  }
  return { ok: true, value };
}
