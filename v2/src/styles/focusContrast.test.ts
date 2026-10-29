import { describe, expect, it } from "vitest";
import css from "./global.css?raw";
import appCss from "./app.css?raw";

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`missing token ${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function resolve(value: string): string {
  const v = value.trim();
  const ref = v.match(/^var\(--([a-z]+)\)$/);
  return ref ? token(ref[1]) : v;
}

describe("focus indicator contrast", () => {
  const rule = css.match(/:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
  const outline = resolve(rule.match(/outline:\s*\d+px solid\s+([^;]+);/)?.[1] ?? "");
  const halo = resolve(rule.match(/box-shadow:\s*0 0 0 \d+px\s+([^;]+);/)?.[1] ?? "");
  const lightSurfaces = [token("paper"), "#fffaf2"];
  const darkSurfaces = [token("ink")];

  it("defines a two-tone ring", () => {
    expect(outline).toMatch(/^#/);
    expect(halo).toMatch(/^#/);
  });

  it("outline is at least 3:1 against every light form/panel surface", () => {
    for (const surface of lightSurfaces) expect(ratio(outline, surface)).toBeGreaterThanOrEqual(3);
  });

  it("halo is at least 3:1 against the dark page background", () => {
    for (const surface of darkSurfaces) expect(ratio(halo, surface)).toBeGreaterThanOrEqual(3);
  });

  it("does not regress to chartreuse-on-light (about 1.05:1)", () => {
    expect(ratio(token("chartreuse"), token("paper"))).toBeLessThan(1.2);
    expect(outline.toLowerCase()).not.toBe(token("chartreuse").toLowerCase());
  });

  it("has no component override that weakens the ring", () => {
    expect(appCss).not.toMatch(/summary:focus-visible/);
    expect(appCss).not.toMatch(/outline:\s*none/);
  });
});
