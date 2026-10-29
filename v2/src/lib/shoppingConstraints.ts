import type { SearchDraftInput } from "./searchPhrase";

/**
 * Shopper constraints (destination, budget) are NOT enforced by keyword search.
 * These helpers only describe them honestly and classify returned asking prices.
 * Nothing here verifies a delivered price, availability, or a photo match.
 */

export interface ConstraintSummary {
  destination: string;
  budget: string | null;
  /** True when a constraint exists that no search step enforces. */
  hasUnappliedConstraints: boolean;
}

export function describeConstraints(input: Pick<SearchDraftInput, "region" | "budgetUsd">): ConstraintSummary {
  const destination = input.region === "MX" ? "Mexico" : "United States";
  const budget = input.budgetUsd != null ? `$${formatUsd(input.budgetUsd)} USD` : null;
  return { destination, budget, hasUnappliedConstraints: true };
}

function formatUsd(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export type BudgetFit =
  | { kind: "no_budget" }
  | { kind: "over_asking"; over: number }
  | { kind: "over_with_shipping"; over: number }
  | { kind: "within_listing_total" }
  | { kind: "within_asking_only" }
  | { kind: "not_comparable"; currency: string };

interface Money {
  amount: number;
  currency: string;
}

/**
 * Compare listed money to the shopper's USD budget without inventing a total.
 * - Non-USD prices are never converted: "not_comparable".
 * - Asking price over budget is over budget regardless of shipping.
 * - Within budget is only ever "within" the amounts the seller listed;
 *   tax, import fees, availability and destination eligibility stay unverified.
 */
export function classifyBudgetFit(price: Money, shipping: Money | null, budgetUsd: number | null): BudgetFit {
  if (budgetUsd == null) return { kind: "no_budget" };
  if (price.currency !== "USD") return { kind: "not_comparable", currency: price.currency };
  if (price.amount > budgetUsd) return { kind: "over_asking", over: round2(price.amount - budgetUsd) };
  if (shipping && shipping.currency === "USD") {
    const total = price.amount + shipping.amount;
    return total > budgetUsd
      ? { kind: "over_with_shipping", over: round2(total - budgetUsd) }
      : { kind: "within_listing_total" };
  }
  return { kind: "within_asking_only" };
}

export function isOverBudget(fit: BudgetFit): boolean {
  return fit.kind === "over_asking" || fit.kind === "over_with_shipping";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** User-facing wording. Never says match, verified, cheapest, best, or winner. */
export function budgetFitLabel(fit: BudgetFit, budgetUsd: number | null): string {
  switch (fit.kind) {
    case "no_budget":
      return "No budget set";
    case "over_asking":
      return `Asking price is $${fit.over.toFixed(2)} over your $${formatUsd(budgetUsd ?? 0)} budget`;
    case "over_with_shipping":
      return `Price plus listed shipping is $${fit.over.toFixed(2)} over your $${formatUsd(budgetUsd ?? 0)} budget`;
    case "within_listing_total":
      return "Within budget on listed price plus shipping; tax and fees unknown";
    case "within_asking_only":
      return "Asking price is within budget; shipping unknown so delivered cost is unverified";
    case "not_comparable":
      return `Priced in ${fit.currency}; not compared with your USD budget`;
  }
}
