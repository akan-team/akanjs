// No akanjs runtime import: this runs inside the lint path.
import { type CssBlock, CssBlockParser } from "./cssBlockParser";

export interface ThemeContrastViolation {
  scope: string;
  pair: string;
  background: string;
  foreground: string;
  ratio: number;
  threshold: number;
  suggestion: string;
}

interface PairDef {
  base: string;
  fg: string;
  threshold: number;
}

// WCAG 2.1 AA: 4.5:1 is the floor for normal text, 3:1 for UI components and large text.
const PAIRS: PairDef[] = [
  { base: "background", fg: "foreground", threshold: 4.5 },
  { base: "primary", fg: "primary-foreground", threshold: 4.5 },
  { base: "secondary", fg: "secondary-foreground", threshold: 4.5 },
  { base: "accent", fg: "accent-foreground", threshold: 4.5 },
  { base: "neutral", fg: "neutral-foreground", threshold: 4.5 },
  { base: "card", fg: "card-foreground", threshold: 4.5 },
  { base: "popover", fg: "popover-foreground", threshold: 4.5 },
  { base: "muted", fg: "muted-foreground", threshold: 3 },
  { base: "info", fg: "info-foreground", threshold: 3 },
  { base: "success", fg: "success-foreground", threshold: 3 },
  { base: "warning", fg: "warning-foreground", threshold: 3 },
  { base: "destructive", fg: "destructive-foreground", threshold: 3 },
  { base: "open", fg: "open-foreground", threshold: 3 },
];

const THEME_SCOPES = new Set([":root", '[data-theme="dark"]', '[data-theme="light"]']);
const CONDITIONAL_AT_RULES = new Set(["@media", "@supports", "@container"]);

export type ThemeTokensByScope = Record<string, Record<string, string>>;

export class ThemeValidator {
  validate(css: string): ThemeContrastViolation[] {
    const tokensByScope = ThemeValidator.parseThemeTokens(css);
    const violations: ThemeContrastViolation[] = [];
    for (const [scope, tokens] of Object.entries(tokensByScope)) {
      const underlying = THEME_SCOPES.has(scope) ? null : [...THEME_SCOPES].find((name) => scope.endsWith(` ${name}`));
      const effective = underlying ? ThemeValidator.#overlayPairs(tokensByScope[underlying] ?? {}, tokens) : tokens;
      violations.push(...this.validateScope(effective, scope));
    }
    return violations;
  }

  validateScope(tokens: Record<string, string>, scope: string): ThemeContrastViolation[] {
    const violations: ThemeContrastViolation[] = [];
    for (const { base, fg, threshold } of PAIRS) {
      const bg = tokens[base];
      const front = tokens[fg];
      if (!bg || !front) continue;
      const bgRgb = ThemeValidator.parseHex(bg);
      const fgRgb = ThemeValidator.parseHex(front);
      if (!bgRgb || !fgRgb) continue;
      const ratio = ThemeValidator.contrastRatio(bgRgb, fgRgb);
      if (ratio >= threshold) continue;
      violations.push({
        scope,
        pair: `${base} / ${fg}`,
        background: bg,
        foreground: front,
        ratio: Math.round(ratio * 100) / 100,
        threshold,
        suggestion: `In ${scope}, --${base} (${bg}) against --${fg} (${front}) is ${ratio.toFixed(2)}:1, under the ${threshold}:1 minimum. Lighten or darken one of them until it clears.`,
      });
    }
    return violations;
  }

  /** A scope declared twice keeps the later value, so pass the framework css before the app's. */
  static parseThemeTokens(css: string): ThemeTokensByScope {
    const result: ThemeTokensByScope = {};
    CssBlockParser.walk(CssBlockParser.parse(css), "", (node, condition) => {
      if (node.kind !== "block") return null;
      if (node.atRule === "@layer") return condition;
      if (node.atRule) return CONDITIONAL_AT_RULES.has(node.atRule) ? node.prelude.replace(/\s+/g, " ") : null;
      const scopes = node.prelude
        .split(",")
        .map((selector) => ThemeValidator.#normalizeScope(selector))
        .filter((scope) => THEME_SCOPES.has(scope));
      if (scopes.length === 0) return null;
      const tokens = ThemeValidator.#customProperties(node);
      for (const scope of scopes) {
        const key = condition ? `${condition} ${scope}` : scope;
        result[key] = Object.assign(result[key] ?? {}, tokens);
      }
      return null;
    });
    return result;
  }

  static #customProperties(block: CssBlock): Record<string, string> {
    const tokens: Record<string, string> = {};
    for (const node of block.nodes) {
      if (node.kind === "declaration" && node.property.startsWith("--")) tokens[node.property.slice(2)] = node.value;
    }
    return tokens;
  }

  static #overlayPairs(underlying: Record<string, string>, tokens: Record<string, string>): Record<string, string> {
    const effective: Record<string, string> = {};
    for (const name of PAIRS.flatMap(({ base, fg }) => [base, fg])) {
      const value = tokens[name] ?? underlying[name];
      if (value) effective[name] = value;
    }
    return effective;
  }

  static #normalizeScope(selector: string): string {
    return selector.replace(/\[data-theme=['"]?([\w-]+)['"]?\]/g, '[data-theme="$1"]').trim();
  }

  /** #rgb / #rgba / #rrggbb / #rrggbbaa -> [r,g,b], alpha ignored. Null for anything not hex. */
  static parseHex(value: string): [number, number, number] | null {
    const v = value.trim();
    if (!v.startsWith("#")) return null;
    const hex = v.slice(1);
    let full: string;
    if (hex.length === 3 || hex.length === 4)
      full = hex
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    else if (hex.length === 6 || hex.length === 8) full = hex.slice(0, 6);
    else return null;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    const n = Number.parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  static #relativeLuminance([r, g, b]: [number, number, number]): number {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  static contrastRatio(a: [number, number, number], b: [number, number, number]): number {
    const la = ThemeValidator.#relativeLuminance(a);
    const lb = ThemeValidator.#relativeLuminance(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
}
