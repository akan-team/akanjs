import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ThemeValidator } from "./themeValidator";

const validator = new ThemeValidator();

describe("ThemeValidator.parseHex", () => {
  test("parses shorthand, full, and alpha hex", () => {
    expect(ThemeValidator.parseHex("#fff")).toEqual([255, 255, 255]);
    expect(ThemeValidator.parseHex("#0a0a0a")).toEqual([10, 10, 10]);
    expect(ThemeValidator.parseHex("#ffffff80")).toEqual([255, 255, 255]);
  });

  test("returns null for non-hex values", () => {
    expect(ThemeValidator.parseHex("var(--primary)")).toBeNull();
    expect(ThemeValidator.parseHex("rgb(0,0,0)")).toBeNull();
  });
});

describe("ThemeValidator.contrastRatio", () => {
  test("black/white is 21:1", () => {
    expect(ThemeValidator.contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
  });
});

describe("ThemeValidator.parseThemeTokens", () => {
  test("distributes grouped selectors and normalizes quotes", () => {
    const css = `:root, [data-theme=dark] { --background: #0a0a0a; --foreground: #fafafa; }`;
    const tokens = ThemeValidator.parseThemeTokens(css);
    expect(tokens[":root"].background).toBe("#0a0a0a");
    expect(tokens['[data-theme="dark"]'].foreground).toBe("#fafafa");
  });

  test("ignores at-rule blocks like @theme", () => {
    const css = `@theme inline { --color-primary: var(--primary); } :root { --background: #fff; }`;
    const tokens = ThemeValidator.parseThemeTokens(css);
    expect(Object.keys(tokens)).toEqual([":root"]);
  });
});

describe("ThemeValidator.validate", () => {
  test("flags a low-contrast pair", () => {
    const css = `:root { --background: #ffffff; --foreground: #eeeeee; }`;
    const violations = validator.validate(css);
    expect(violations).toHaveLength(1);
    expect(violations[0].pair).toBe("background / foreground");
    expect(violations[0].ratio).toBeLessThan(4.5);
  });

  test("passes when status pairs meet the relaxed 3:1 threshold", () => {
    // info #3b82f6 on white ≈ 3.68 — below 4.5 but above the 3:1 UI threshold.
    const css = `:root { --info: #3b82f6; --info-foreground: #ffffff; }`;
    expect(validator.validate(css)).toHaveLength(0);
  });

  test("skips pairs whose token is a var() reference", () => {
    const css = `:root { --primary: var(--brand); --primary-foreground: #000000; }`;
    expect(validator.validate(css)).toHaveLength(0);
  });
});

describe("shipped framework palette", () => {
  test("pkgs/akanjs/ui/styles.css passes WCAG contrast for all scopes", () => {
    const stylesPath = path.resolve(import.meta.dir, "../../../akanjs/ui/styles.css");
    const css = readFileSync(stylesPath, "utf8");
    const violations = validator.validate(css);
    expect(violations).toEqual([]);
  });
});
