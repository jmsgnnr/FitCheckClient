import { describe, expect, it } from "vitest";
import {
  budgetFitLabel,
  classifyBudgetFit,
  describeConstraints,
  isOverBudget,
} from "./shoppingConstraints";

const usd = (amount: number) => ({ amount, currency: "USD" });

describe("describeConstraints", () => {
  it("names destination and budget but flags them as unapplied", () => {
    expect(describeConstraints({ region: "MX", budgetUsd: 80 })).toEqual({
      destination: "Mexico", budget: "$80 USD", hasUnappliedConstraints: true,
    });
    expect(describeConstraints({ region: "US", budgetUsd: null }).budget).toBeNull();
    expect(describeConstraints({ region: "US", budgetUsd: 49.5 }).budget).toBe("$49.50 USD");
  });
});

describe("classifyBudgetFit", () => {
  it("never calls anything over budget 'within' and reports the overage", () => {
    const fit = classifyBudgetFit(usd(95), null, 80);
    expect(fit).toEqual({ kind: "over_asking", over: 15 });
    expect(isOverBudget(fit)).toBe(true);
    expect(budgetFitLabel(fit, 80)).toMatch(/\$15\.00 over your \$80 budget/);
  });

  it("flags price plus listed shipping that exceeds budget", () => {
    const fit = classifyBudgetFit(usd(75), usd(10), 80);
    expect(fit).toEqual({ kind: "over_with_shipping", over: 5 });
    expect(isOverBudget(fit)).toBe(true);
  });

  it("within budget with unknown shipping stays unverified", () => {
    const fit = classifyBudgetFit(usd(60), null, 80);
    expect(fit.kind).toBe("within_asking_only");
    expect(isOverBudget(fit)).toBe(false);
    expect(budgetFitLabel(fit, 80)).toMatch(/delivered cost is unverified/);
  });

  it("within budget on listed totals still says tax and fees are unknown", () => {
    const fit = classifyBudgetFit(usd(60), usd(10), 80);
    expect(fit.kind).toBe("within_listing_total");
    expect(budgetFitLabel(fit, 80)).toMatch(/tax and fees unknown/);
  });

  it("does not convert currencies or compare a mismatched shipping currency", () => {
    expect(classifyBudgetFit({ amount: 10, currency: "EUR" }, null, 80).kind).toBe("not_comparable");
    expect(classifyBudgetFit(usd(60), { amount: 5, currency: "EUR" }, 80).kind).toBe("within_asking_only");
  });

  it("reports no_budget when none is set", () => {
    expect(classifyBudgetFit(usd(1000), null, null).kind).toBe("no_budget");
  });

  it("no label claims a verified match, winner, cheapest or best", () => {
    const fits = [
      classifyBudgetFit(usd(95), null, 80), classifyBudgetFit(usd(75), usd(10), 80),
      classifyBudgetFit(usd(60), null, 80), classifyBudgetFit(usd(60), usd(10), 80),
      classifyBudgetFit({ amount: 1, currency: "EUR" }, null, 80), classifyBudgetFit(usd(1), null, null),
    ];
    for (const fit of fits) {
      expect(budgetFitLabel(fit, 80)).not.toMatch(/verified match|winner|cheapest|best price|lowest/i);
    }
  });
});
