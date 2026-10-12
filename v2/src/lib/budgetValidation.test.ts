import { describe, expect, it } from "vitest";
import { parseBudgetInput } from "./budgetValidation";

describe("parseBudgetInput", () => {
  it("allows empty budget", () => {
    expect(parseBudgetInput("")).toEqual({ ok: true, value: null });
    expect(parseBudgetInput("   ")).toEqual({ ok: true, value: null });
  });

  it("parses positive numbers", () => {
    expect(parseBudgetInput("120")).toEqual({ ok: true, value: 120 });
    expect(parseBudgetInput("1,250")).toEqual({ ok: true, value: 1250 });
  });

  it("rejects non-positive values", () => {
    expect(parseBudgetInput("0").ok).toBe(false);
    expect(parseBudgetInput("-5").ok).toBe(false);
    expect(parseBudgetInput("abc").ok).toBe(false);
  });
});
