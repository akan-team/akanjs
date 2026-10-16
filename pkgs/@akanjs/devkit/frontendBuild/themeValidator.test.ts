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

  test("reads every block, not every other one", () => {
    const css = `.a {} :root { --background: #fff; } .b {} [data-theme='light'] { --background: #eee; } [data-theme="dark"] { --background: #111; }`;
    expect(ThemeValidator.parseThemeTokens(css)).toEqual({
      ":root": { background: "#fff" },
      '[data-theme="light"]': { background: "#eee" },
      '[data-theme="dark"]': { background: "#111" },
    });
  });

  test("reads the first block after @source and @import lines", () => {
    const css = [
      `@source "./**/*";`,
      `@import "tailwindcss";`,
      `@plugin "tailwind-scrollbar";`,
      `:root { --background: #ffffff; --foreground: #0a0a0a; }`,
      `[data-theme="dark"] { --background: #0a0a0a; --foreground: #fafafa; }`,
      `[data-theme="light"] { --background: #fafafa; --foreground: #171717; }`,
    ].join("\n");
    expect(Object.keys(ThemeValidator.parseThemeTokens(css))).toEqual([
      ":root",
      '[data-theme="dark"]',
      '[data-theme="light"]',
    ]);
  });

  test("keeps a block's own declarations, skipping comments and nested rules", () => {
    const css = `:root { /* --background: #000; */ --background: #fff; .x { --foreground: #000; } --foreground: #111 }`;
    expect(ThemeValidator.parseThemeTokens(css)).toEqual({ ":root": { background: "#fff", foreground: "#111" } });
  });

  test("merges a scope declared twice, the later value winning", () => {
    const css = `:root { --background: #fff; --foreground: #000; } :root { --foreground: #111; }`;
    expect(ThemeValidator.parseThemeTokens(css)).toEqual({ ":root": { background: "#fff", foreground: "#111" } });
  });

  test("reads through @layer and keys a conditional scope by its condition", () => {
    const css = [
      `@layer base { :root { --background: #fff; --foreground: #000; } }`,
      `@media (prefers-color-scheme: dark) { :root { --background: #000; } }`,
    ].join("\n");
    expect(ThemeValidator.parseThemeTokens(css)).toEqual({
      ":root": { background: "#fff", foreground: "#000" },
      "@media (prefers-color-scheme: dark) :root": { background: "#000" },
    });
  });

  test("adversarial input finishes well under a second", () => {
    for (const css of [
      " ".repeat(100_000),
      `}${" ".repeat(100_000)}`,
      `:root{${"--".repeat(100_000)}`,
      `:root{---:${" ".repeat(100_000)}`,
      ":root{--background:#fff}".repeat(100_000),
      `${"@media x{".repeat(100_000)}:root{--background:#fff}`,
    ]) {
      const started = performance.now();
      ThemeValidator.parseThemeTokens(css);
      expect(performance.now() - started).toBeLessThan(1000);
    }
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

  test("checks a conditional scope over the scope it overrides", () => {
    const css = [
      `:root { --background: #ffffff; --foreground: #000000; }`,
      `@media (prefers-color-scheme: dark) { :root { --background: #111111; } }`,
    ].join("\n");
    const violations = validator.validate(css);
    expect(violations.map(({ scope, pair }) => [scope, pair])).toEqual([
      ["@media (prefers-color-scheme: dark) :root", "background / foreground"],
    ]);
  });
});

describe("shipped framework palette", () => {
  const css = readFileSync(path.resolve(import.meta.dir, "../../../akanjs/ui/styles.css"), "utf8");

  test("pkgs/akanjs/ui/styles.css parses :root, dark and light", () => {
    const tokens = ThemeValidator.parseThemeTokens(css);
    expect(Object.keys(tokens)).toEqual([":root", '[data-theme="dark"]', '[data-theme="light"]']);
    expect(tokens[":root"].background).toBe("#0a0a0a");
    expect(tokens['[data-theme="dark"]'].background).toBe("#0a0a0a");
    expect(tokens['[data-theme="light"]'].background).toBe("#ffffff");
    for (const scopeTokens of Object.values(tokens)) expect(Object.keys(scopeTokens).length).toBeGreaterThanOrEqual(26);
  });

  test("pkgs/akanjs/ui/styles.css passes WCAG contrast for all scopes", () => {
    const violations = validator.validate(css);
    expect(violations).toEqual([]);
  });
});
