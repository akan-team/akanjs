/**
 * themeValidator — 시맨틱 토큰 페어의 WCAG 콘트라스트 자동 검사 (의존성 0).
 *
 * 토큰 구조(`--x` ↔ `--x-foreground`)라서 가능해진 검사. AI 가 생성한 팔레트가 "안 읽히는 사이트"가
 * 되는 것을 원천 차단한다. akanjs 런타임을 import 하지 않는다 — 순수 함수만.
 *
 * 임계값(WCAG 2.1):
 *   - 본문/주요 표면 페어(background·primary·secondary·accent·neutral·card·popover): 4.5:1 (AA normal text)
 *   - 상태/보조 페어(info·success·warning·destructive·open·muted): 3:1 (UI 컴포넌트 / 큰 텍스트 / 보조 표면)
 * 현행 styles.css 기본 팔레트(light/dark)는 이 임계값을 모두 통과한다.
 */

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

// 검사 대상 스코프. 그 외 셀렉터(.campaign-x 스코프 토큰 등)는 페어 검사에서 제외.
const THEME_SCOPES = new Set([":root", '[data-theme="dark"]', '[data-theme="light"]']);

export type ThemeTokensByScope = Record<string, Record<string, string>>;

export class ThemeValidator {
  /** CSS 문자열에서 토큰을 추출해 알려진 테마 스코프 전체를 검사한다. */
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
      if (!bgRgb || !fgRgb) continue; // var()/비-hex 값은 검사 불가 → 건너뜀
      const ratio = ThemeValidator.contrastRatio(bgRgb, fgRgb);
      if (ratio >= threshold) continue;
      violations.push({
        scope,
        pair: `${base} / ${fg}`,
        background: bg,
        foreground: front,
        ratio: Math.round(ratio * 100) / 100,
        threshold,
        suggestion: `${scope}의 --${base}(${bg})와 --${fg}(${front}) 대비가 ${ratio.toFixed(2)}:1 로 최소 ${threshold}:1 미만입니다. 한쪽을 더 밝게/어둡게 조정해 대비를 확보하세요.`,
      });
    }
    return violations;
  }

  /**
   * `:root` / `[data-theme="…"]` 블록에서 `--token: value` 를 파싱한다. 그룹 셀렉터
   * (`:root, [data-theme="dark"] { … }`)는 각 셀렉터에 동일 토큰을 분배. 동일 스코프 재등장 시 나중 값이 이긴다
   * (프레임워크-먼저 / 앱-나중 순서로 넘기면 앱 override 가 반영됨).
   */
  static parseThemeTokens(css: string): ThemeTokensByScope {
    const result: ThemeTokensByScope = {};
    // 중첩 없는 단순 규칙 블록만 매칭(@theme/@keyframes 등 at-rule 은 셀렉터에 @ 포함이라 제외).
    const blockRe = /(?:^|})\s*([^{}@]+?)\s*\{([^{}]*)\}/g;
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
    // 따옴표 정규화: [data-theme=dark] / [data-theme='dark'] → [data-theme="dark"]
    return selector.replace(/\[data-theme=['"]?([\w-]+)['"]?\]/g, '[data-theme="$1"]').trim();
  }

  /** #rgb / #rgba / #rrggbb / #rrggbbaa → [r,g,b] (alpha 무시). 비-hex 는 null. */
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
