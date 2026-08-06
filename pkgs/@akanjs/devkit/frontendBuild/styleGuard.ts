/**
 * styleGuard — 색 어휘 폐쇄를 강제하는 순수 정적 검사기 (의존성 0).
 *
 * 어휘 폐쇄(styles.css `@theme { --color-*: initial }`)로 raw 팔레트가 CSS를 미생성하게 되면
 * 위반은 "조용한 시각 깨짐"이 된다. styleGuard 는 소스 문자열을 스캔해 그 위반을 명시적 진단으로
 * 끌어올리고, 에이전트가 읽고 수리할 `suggestion` 을 붙인다.
 *
 * severity 는 규칙 고유값(판별력)만 담는다. warn/error 를 막을지 여부는 배선(호출자)이 mode 로 결정한다:
 *   - dev  : 절대 막지 않음 (모두 경고 로그)
 *   - build/CI/lint : severity==="error" 위반이 하나라도 있으면 실패
 *
 * akanjs 런타임을 import 하지 않는다 — node 표준 라이브러리만 사용.
 */

export type StyleGuardRule =
  | "raw-palette"
  | "arbitrary-color"
  | "inline-color"
  | "daisyui-legacy"
  | "interpolated-arbitrary";
export type StyleGuardSeverity = "error" | "warn";

export interface StyleGuardViolation {
  rule: StyleGuardRule;
  severity: StyleGuardSeverity;
  path: string;
  line: number;
  snippet: string;
  suggestion: string;
}

export interface StyleGuardFile {
  path: string;
  content: string;
}

export interface NamedComponentClassMetric {
  count: number;
  names: string[];
}

// 색을 받는 유틸 접두사. daisyuiTokenRename.ts 의 PREFIX 와 동일 계보(방향성 border 포함).
const PREFIX =
  "(?:bg|text|border(?:-[tblrxy])?(?:-[se])?|ring(?:-offset)?|fill|stroke|shadow|from|to|via|divide|outline|decoration|placeholder|caret|accent)";

// Tailwind 기본 팔레트 이름. `neutral` 은 시맨틱 토큰이기도 하므로 숫자 suffix 를 요구해 구분한다
// (`bg-neutral` 은 허용, `bg-neutral-500` 은 raw 팔레트).
const PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";

// 클래스 경계: 앞은 공백/따옴표/백틱/여는 괄호/콜론(변형)/!(important), 뒤는 종결 문자(+ 슬래시=opacity, !).
const LEAD = "(^|[\\s\"'`{(\\[:!])";
const TAIL = "(?=[\\s\"'`})\\]:/!,]|$)";

const RAW_PALETTE_RE = new RegExp(`${LEAD}((?:${PREFIX})-)${PALETTE}-\\d{2,3}${TAIL}`, "g");

// 임의값 대괄호 안의 색 리터럴. `[--var]` 같은 변수 참조는 매치되지 않는다(의도).
const ARBITRARY_COLOR_RE = /\[(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb|color)\([^\]]*\))\]/g;

// 런타임 값으로 조립한 임의값(`min-h-[${n}px]`, `bg-[${color}]`). Tailwind 는 소스 **텍스트**에서
// 임의값을 추출하므로 CSS 가 아예 생성되지 않는다 — 클래스는 DOM 에 있고 prop 은 연결된 듯 보이지만
// 아무것도 적용되지 않는 무증상 실패다. 같은 모양의 리터럴이 코드베이스 어딘가에 있으면 기본값만
// 우연히 동작하고 override 만 조용히 죽어 더 찾기 어려워진다.
const INTERPOLATED_ARBITRARY_RE = new RegExp(`${LEAD}[a-z][a-z0-9-]*-\\[[^\\]\`]*\\$\\{`, "g");

// style 객체 / <style> 블록. 색 리터럴이 이 안에 있으면 클래스 스캐너를 우회한 것.
const STYLE_OBJECT_RE = /style=\{\{([\s\S]*?)\}\}/g;
const STYLE_TAG_RE = /<style[^>]*>([\s\S]*?)<\/style>/g;
// var(...) 는 허용이므로 매치 대상에서 자연히 빠진다(hex/색함수 리터럴만 탐지).
const INLINE_COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb)\(/g;

// daisyUI 잔재. 판별력 높은 compound(변형 suffix 포함) 패턴만 error 로 잡아 오탐을 억제한다.
const DAISYUI_LEGACY_RE = new RegExp(
  `${LEAD}(?:` +
    // 버튼/배지/알림/입력 등 variant compound
    "btn-(?:primary|secondary|accent|neutral|info|success|warning|error|ghost|link|outline|square|circle|wide|block|xs|sm|md|lg)|" +
    "badge-(?:primary|secondary|accent|neutral|info|success|warning|error|ghost|outline)|" +
    "alert-(?:info|success|warning|error)|" +
    "input-(?:bordered|primary|secondary|accent|ghost|error)|" +
    "select-(?:bordered|primary|ghost)|textarea-(?:bordered|primary|ghost)|" +
    "checkbox-(?:primary|secondary|accent)|toggle-(?:primary|secondary|accent)|" +
    "loading-(?:spinner|dots|ring|ball|bars|infinity)|" +
    // 구조 클래스(daisyUI 전용 조각)
    "card-(?:body|title|actions)|modal-(?:box|action|backdrop)|" +
    "collapse-(?:title|content|arrow|plus)|dropdown-(?:content|end|start|hover)|" +
    "stat-(?:title|value|desc)|tabs-(?:boxed|lifted|bordered)|tab-active|" +
    "menu-(?:title|dropdown)|steps-(?:horizontal|vertical)|join-item|" +
    "mockup-(?:code|phone|browser|window)|drawer-(?:side|content|toggle)" +
    `)${TAIL}`,
  "g",
);

const ALL_RULES: StyleGuardRule[] = [
  "raw-palette",
  "arbitrary-color",
  "inline-color",
  "daisyui-legacy",
  "interpolated-arbitrary",
];

/**
 * 위반 억제 지시어(escape hatch). 정당한 팔레트 요청(에디터 신택스 하이라이트, 데이터-viz, 의도적 브랜드
 * 데모)은 거절이 아니라 "명시적 옵트아웃"으로 라우팅한다 — 천장은 제약하지 않되 흔적을 남긴다.
 *   styleguard-disable <rule?>            → 파일 전체
 *   styleguard-disable-next-line <rule?>  → 바로 다음 줄
 * rule 을 생략하면 모든 규칙을 억제한다.
 */
interface Directives {
  file: Set<StyleGuardRule> | "all" | null;
  nextLine: Map<number, Set<StyleGuardRule> | "all">;
}

export class StyleGuard {
  run(files: StyleGuardFile[]): StyleGuardViolation[] {
    const out: StyleGuardViolation[] = [];
    for (const file of files) {
      const directives = this.#parseDirectives(file.content);
      // 주석 내용을 공백으로 치환(offset·줄번호 보존). 주석에 남은 예전 클래스명이 오탐되지 않게.
      // directives 는 원본에서 파싱한다 — 지시어 자체가 주석이기 때문.
      const scan = this.#stripComments(file.content);
      const local: StyleGuardViolation[] = [];
      this.#scanClassLiterals(file, scan, local);
      this.#scanInlineColors(file, scan, local);
      for (const v of local) if (!this.#isSuppressed(v, directives)) out.push(v);
    }
    return out;
  }

  /** 라인/블록 주석을 같은 길이의 공백으로 치환. 문자열/템플릿 리터럴 안의 `//`·`/*` 는 보존. */
  #stripComments(src: string): string {
    const out = src.split("");
    const blank = (i: number) => {
      if (src[i] !== "\n") out[i] = " ";
    };
    let state: "code" | "line" | "block" | "squote" | "dquote" | "template" = "code";
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      const d = src[i + 1];
      if (state === "code") {
        if (c === "/" && d === "/") {
          blank(i);
          blank(i + 1);
          state = "line";
          i += 2;
        } else if (c === "/" && d === "*") {
          blank(i);
          blank(i + 1);
          state = "block";
          i += 2;
        } else {
          if (c === "'") state = "squote";
          else if (c === '"') state = "dquote";
          else if (c === "`") state = "template";
          i++;
        }
      } else if (state === "line") {
        if (c === "\n") state = "code";
        else blank(i);
        i++;
      } else if (state === "block") {
        if (c === "*" && d === "/") {
          blank(i);
          blank(i + 1);
          state = "code";
          i += 2;
        } else {
          blank(i);
          i++;
        }
      } else {
        // 문자열/템플릿: 내용 보존, escape 건너뛰고 종결 문자에서 code 로 복귀.
        const close = state === "squote" ? "'" : state === "dquote" ? '"' : "`";
        if (c === "\\") i += 2;
        else {
          if (c === close) state = "code";
          i++;
        }
      }
    }
    return out.join("");
  }

  #parseDirectives(content: string): Directives {
    const directives: Directives = { file: null, nextLine: new Map() };
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLineMatch = line.match(/styleguard-disable-next-line\b(.*)$/);
      if (nextLineMatch) {
        directives.nextLine.set(i + 2, this.#extractRules(nextLineMatch[1]));
        continue;
      }
      const fileMatch = line.match(/styleguard-disable\b(.*)$/);
      if (fileMatch) directives.file = this.#mergeFileScope(directives.file, this.#extractRules(fileMatch[1]));
    }
    return directives;
  }

  #extractRules(tail: string): Set<StyleGuardRule> | "all" {
    const found = ALL_RULES.filter((rule) => tail.includes(rule));
    return found.length === 0 ? "all" : new Set(found);
  }

  #mergeFileScope(
    prev: Set<StyleGuardRule> | "all" | null,
    next: Set<StyleGuardRule> | "all",
  ): Set<StyleGuardRule> | "all" {
    if (prev === "all" || next === "all") return "all";
    return new Set([...(prev ?? []), ...next]);
  }

  #isSuppressed(v: StyleGuardViolation, directives: Directives): boolean {
    if (directives.file === "all" || directives.file?.has(v.rule)) return true;
    const nextLine = directives.nextLine.get(v.line);
    return nextLine === "all" || (nextLine?.has(v.rule) ?? false);
  }

  #scanClassLiterals(file: StyleGuardFile, scan: string, out: StyleGuardViolation[]): void {
    for (const m of scan.matchAll(RAW_PALETTE_RE)) {
      out.push(
        this.#violation(file, m.index ?? 0, {
          rule: "raw-palette",
          severity: "error",
          suggestion:
            "시맨틱 토큰으로 교체하세요 — 예: text-gray-500→text-muted-foreground, bg-red-500→bg-destructive, bg-blue-500→bg-info. 브랜드 색은 page/styles.css 토큰에서 조정합니다.",
        }),
      );
    }
    for (const m of scan.matchAll(ARBITRARY_COLOR_RE)) {
      out.push(
        this.#violation(file, m.index ?? 0, {
          rule: "arbitrary-color",
          severity: "error",
          suggestion:
            "임의 색 리터럴 대신 토큰을 쓰세요 — bg-[#3b82f6]→bg-info, text-[rgb(...)]→시맨틱 토큰. 꼭 필요하면 스코프 토큰(.campaign-x { --primary: … })을 정의하세요.",
        }),
      );
    }
    for (const m of scan.matchAll(DAISYUI_LEGACY_RE)) {
      out.push(
        this.#violation(file, m.index ?? 0, {
          rule: "daisyui-legacy",
          severity: "error",
          suggestion:
            "daisyUI 클래스는 제거됐습니다. akanjs/ui 프리미티브(Button/Badge 등)나 buttonRecipe()/badgeRecipe() + 시맨틱 토큰으로 교체하세요.",
        }),
      );
    }
    for (const m of scan.matchAll(INTERPOLATED_ARBITRARY_RE)) {
      out.push(
        this.#violation(file, m.index ?? 0, {
          rule: "interpolated-arbitrary",
          severity: "error",
          suggestion:
            "런타임 값으로 임의값 클래스를 조립하면 CSS 가 생성되지 않습니다(스캐너는 소스 텍스트를 읽습니다). 크기/위치는 style prop 으로 넘기세요 — style={{ minHeight }}. 값이 enum 이면 리터럴 클래스 맵으로 두세요.",
        }),
      );
    }
  }

  #scanInlineColors(file: StyleGuardFile, scan: string, out: StyleGuardViolation[]): void {
    const push = (index: number) =>
      out.push(
        this.#violation(file, index, {
          rule: "inline-color",
          severity: "error",
          suggestion:
            "인라인 색 리터럴 대신 CSS 변수/토큰을 참조하세요 — style={{ color: 'var(--primary)' }} 또는 시맨틱 클래스(text-primary). 하드코딩 hex/rgb 는 테마 전환을 깨뜨립니다.",
        }),
      );
    for (const region of [STYLE_OBJECT_RE, STYLE_TAG_RE]) {
      for (const m of scan.matchAll(region)) {
        const inner = m[1] ?? "";
        const innerStart = (m.index ?? 0) + m[0].indexOf(inner);
        for (const lit of inner.matchAll(INLINE_COLOR_LITERAL_RE)) {
          push(innerStart + (lit.index ?? 0));
        }
      }
    }
  }

  #violation(
    file: StyleGuardFile,
    index: number,
    base: Pick<StyleGuardViolation, "rule" | "severity" | "suggestion">,
  ): StyleGuardViolation {
    const before = file.content.slice(0, index);
    const line = before.length === 0 ? 1 : before.split("\n").length;
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineEnd = file.content.indexOf("\n", index);
    const snippet = file.content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
    return { ...base, path: file.path, line, snippet };
  }

  /**
   * `@layer components` 안에서 선언된 명명 클래스 개수 — 그림자 디자인 시스템 증식의 warn 지표(차단 X).
   */
  static countNamedComponentClasses(css: string): NamedComponentClassMetric {
    const names = new Set<string>();
    const layerRe = /@layer\s+components\s*\{/g;
    for (const layer of css.matchAll(layerRe)) {
      const bodyStart = (layer.index ?? 0) + layer[0].length;
      const body = StyleGuard.#extractBalanced(css, bodyStart);
      for (const sel of body.matchAll(/(^|[\s}])\.(-?[a-zA-Z_][\w-]*)/g)) names.add(sel[2]);
    }
    return { count: names.size, names: [...names].sort() };
  }

  static #extractBalanced(css: string, start: number): string {
    let depth = 1;
    for (let i = start; i < css.length; i++) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return css.slice(start, i);
      }
    }
    return css.slice(start);
  }
}
