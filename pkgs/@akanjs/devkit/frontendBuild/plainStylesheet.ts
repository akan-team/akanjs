export interface LoadedStylesheet {
  path: string;
  base: string;
  content: string;
}

export type StylesheetLoader = (id: string, fromBase: string) => Promise<LoadedStylesheet>;

interface ImportConditions {
  layer: string | null;
  supports: string | null;
  media: string | null;
}

export interface PlainImport extends ImportConditions {
  start: number;
  end: number;
  uri: string;
}

// Every at-rule Tailwind v4's `compile()` acts on (`parseCss`, `substituteAtImports`, `registerPlugins`, `@apply`).
const TAILWIND_AT_RULES = new Set([
  "@tailwind",
  "@apply",
  "@plugin",
  "@config",
  "@theme",
  "@utility",
  "@variant",
  "@custom-variant",
  "@slot",
  "@source",
  "@reference",
]);
// Tailwind's own test (`theme\(` also covers `--theme(`), run over declaration values and media/supports params.
const TAILWIND_FUNCTION_RE = /(?:--alpha|--spacing|theme)\(/;
// `@import "x" theme(…)`, `source(…)`, `prefix(…)`, `important` and `reference` become Tailwind-only `@media` params.
const TAILWIND_CONDITION_RE = /\b(?:source|prefix|theme)\(|(?:^|\s)(?:important|reference)(?=\s|$)/i;
const TAILWIND_PACKAGE_RE = /^tailwindcss(?:\/|$)/;
const REMOTE_URI_RE = /^(?:data:|https?:\/\/)/i;
const COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const AT_KEYWORD_RE = /@[\w-]+/y;
const QUOTED_IMPORT_RE = /^\s*(["'])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1([\s\S]*)$/;
const LAYER_RE = /^layer(?:\(\s*([^()]*?)\s*\))?(?![\w(-])/i;
const MAX_IMPORT_DEPTH = 100;

interface OpenAtRule {
  name: string;
  start: number;
  preludeStart: number;
}

type AtRuleVerdict = (ImportConditions & { uri: string }) | "tailwind" | "plain";

export class PlainStylesheet {
  static async bundle(css: string, base: string, load: StylesheetLoader, depth = 0): Promise<string | null> {
    //? Past Tailwind's own depth limit (an import cycle), `compile()` runs instead and reports it.
    if (depth > MAX_IMPORT_DEPTH) return null;
    const imports = PlainStylesheet.scan(css);
    if (!imports) return null;
    const parts: string[] = [];
    let cursor = 0;
    for (const rule of imports) {
      const loaded = await load(rule.uri, base);
      const inner = await PlainStylesheet.bundle(loaded.content, loaded.base, load, depth + 1);
      if (inner === null) return null;
      parts.push(css.slice(cursor, rule.start), PlainStylesheet.#wrap(inner, rule));
      cursor = rule.end;
    }
    parts.push(css.slice(cursor));
    return parts.join("");
  }

  static scan(css: string): PlainImport[] | null {
    const imports: PlainImport[] = [];
    const code: string[] = [];
    let segmentStart = 0;
    let parenDepth = 0;
    let braceDepth = 0;
    let atRule: OpenAtRule | null = null;
    let idx = 0;
    while (idx < css.length) {
      const char = css[idx];
      if (char === "/" && css[idx + 1] === "*") {
        const end = css.indexOf("*/", idx + 2);
        if (end === -1) return null;
        code.push(css.slice(segmentStart, idx));
        idx = segmentStart = end + 2;
        continue;
      }
      if (char === "\\") {
        idx += 2;
        continue;
      }
      if (char === '"' || char === "'") {
        code.push(css.slice(segmentStart, idx));
        idx = segmentStart = PlainStylesheet.#skipString(css, idx);
        continue;
      }
      if (char === "@" && !atRule && parenDepth === 0) {
        AT_KEYWORD_RE.lastIndex = idx;
        const keyword = AT_KEYWORD_RE.exec(css);
        if (keyword) {
          const name = keyword[0].toLowerCase();
          if (TAILWIND_AT_RULES.has(name)) return null;
          atRule = { name, start: idx, preludeStart: idx + keyword[0].length };
          idx += keyword[0].length;
          continue;
        }
      }
      if (char === "(") parenDepth += 1;
      else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
      else if (parenDepth === 0 && (char === ";" || char === "{" || char === "}")) {
        if (atRule && !PlainStylesheet.#closeAtRule(css, atRule, idx, char, imports)) return null;
        atRule = null;
        braceDepth += char === "{" ? 1 : char === "}" ? -1 : 0;
        if (braceDepth < 0) return null;
      }
      idx += 1;
    }
    if (atRule && !PlainStylesheet.#closeAtRule(css, atRule, css.length, "", imports)) return null;
    if (braceDepth !== 0 || parenDepth !== 0) return null;
    code.push(css.slice(segmentStart));
    return TAILWIND_FUNCTION_RE.test(code.join(" ")) ? null : imports;
  }

  static #closeAtRule(css: string, atRule: OpenAtRule, end: number, terminator: string, imports: PlainImport[]) {
    const prelude = css.slice(atRule.preludeStart, end).replace(COMMENT_RE, " ");
    const verdict = PlainStylesheet.#readAtRule(atRule.name, prelude, terminator === "{");
    if (verdict === "tailwind") return false;
    if (verdict !== "plain") imports.push({ ...verdict, start: atRule.start, end: terminator === ";" ? end + 1 : end });
    return true;
  }

  static #readAtRule(name: string, prelude: string, opensBlock: boolean): AtRuleVerdict {
    if (name === "@media") return TAILWIND_CONDITION_RE.test(prelude) ? "tailwind" : "plain";
    if (name !== "@import") return "plain";
    const match = QUOTED_IMPORT_RE.exec(prelude);
    //? Tailwind leaves an `@import url(…)` where it stands, so this does too.
    if (!match) return "plain";
    const [, , uri = "", rest = ""] = match;
    if (TAILWIND_PACKAGE_RE.test(uri) || TAILWIND_CONDITION_RE.test(rest) || opensBlock) return "tailwind";
    if (REMOTE_URI_RE.test(uri)) return "plain";
    const conditions = PlainStylesheet.#parseConditions(rest.trim());
    return conditions ? { uri, ...conditions } : "tailwind";
  }

  static #parseConditions(text: string): ImportConditions | null {
    let rest = text;
    let layer: string | null = null;
    let supports: string | null = null;
    const layerMatch = LAYER_RE.exec(rest);
    if (layerMatch) {
      layer = layerMatch[1] ?? "";
      rest = rest.slice(layerMatch[0].length).trim();
    }
    if (/^supports\(/i.test(rest)) {
      const close = PlainStylesheet.#closingParen(rest, "supports".length);
      if (close === -1) return null;
      supports = rest.slice("supports(".length, close).trim();
      rest = rest.slice(close + 1).trim();
    }
    if (/["']|\burl\(|\blayer\b|\bsupports\(/i.test(rest)) return null;
    return { layer, supports, media: rest || null };
  }

  static #closingParen(text: string, open: number): number {
    let depth = 0;
    for (let idx = open; idx < text.length; idx++) {
      if (text[idx] === "(") depth += 1;
      else if (text[idx] === ")" && --depth === 0) return idx;
    }
    return -1;
  }

  static #wrap(css: string, { layer, media, supports }: PlainImport): string {
    let wrapped = css;
    if (layer !== null) wrapped = `@layer${layer ? ` ${layer}` : ""} {\n${wrapped}\n}`;
    if (media !== null) wrapped = `@media ${media} {\n${wrapped}\n}`;
    if (supports !== null)
      wrapped = `@supports ${supports.startsWith("(") ? supports : `(${supports})`} {\n${wrapped}\n}`;
    return wrapped;
  }

  static #skipString(css: string, start: number): number {
    const quote = css[start];
    let idx = start + 1;
    while (idx < css.length) {
      const char = css[idx];
      if (char === "\\") idx += 2;
      else if (char === quote) return idx + 1;
      else if (char === "\n") return idx;
      else idx += 1;
    }
    return css.length;
  }
}
