// No akanjs runtime import: this runs inside the lint path.

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

export type ThemeTokensByScope = Record<string, Record<string, string>>;

export class ThemeValidator {
  validate(css: string): ThemeContrastViolation[] {
    const tokensByScope = ThemeValidator.parseThemeTokens(css);
    const violations: ThemeContrastViolation[] = [];
    for (const [scope, tokens] of Object.entries(tokensByScope)) {
      if (!THEME_SCOPES.has(scope)) continue;
      violations.push(...this.validateScope(tokens, scope));
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
    const blockRe = /(?:^|})([^{}@]+)\{([^{}]*)\}/g;
    for (const block of css.matchAll(blockRe)) {
      const selectors = block[1].split(",").map((s) => s.trim());
      const relevant = selectors.filter((s) => THEME_SCOPES.has(ThemeValidator.#normalizeScope(s)));
      if (relevant.length === 0) continue;
      const decls: Record<string, string> = {};
      for (const decl of block[2].matchAll(/--([\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) {
        decls[decl[1]] = decl[2].trim();
      }
      for (const selector of relevant) {
        const scope = ThemeValidator.#normalizeScope(selector);
        result[scope] = { ...(result[scope] ?? {}), ...decls };
      }
    }
    return result;
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
