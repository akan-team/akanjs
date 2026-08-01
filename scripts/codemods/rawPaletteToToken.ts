#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
/**
 * raw 팔레트 → 시맨틱 토큰 codemod (Phase 1, #9 의 자사-모노레포 슬라이스).
 *
 * 어휘 폐쇄(styles.css `@theme { --color-*: initial }`) 이후 `bg-blue-500`·`text-gray-400` 같은
 * raw Tailwind 팔레트 유틸은 CSS 를 미생성한다. 이 codemod 는 판별 가능한 대량 케이스를 시맨틱 토큰으로
 * 옮긴다:
 *   - 중립(gray/slate/zinc/neutral/stone): 명도로 background/foreground/muted/muted-foreground/secondary/border 로 라우팅
 *   - 상태(red·rose→destructive, green·emerald·lime·teal→success, amber·yellow·orange→warning, blue·sky·cyan·indigo→info)
 * 브랜드성 색(purple/violet/fuchsia/pink)은 자동 매핑하지 않고 "잔여"로 리포트한다 — page/styles.css 토큰이나
 * 스코프 토큰으로 사람이 결정해야 하는 층이기 때문(천장 금지 원칙). daisyuiTokenRename.ts 의 골격을 따른다.
 *
 * 대상 루트(기본): apps/minimal libs pkgs/akanjs. apps/akan(문서, daisyUI 존치)·page/styles.css·에디터 신택스
 * 테마·public/dist/.akan/node_modules 는 제외.
 *
 * 사용:
 *   bun scripts/codemods/rawPaletteToToken.ts --dry                 # 리포트만
 *   bun scripts/codemods/rawPaletteToToken.ts --apply               # 실제 적용
 *   bun scripts/codemods/rawPaletteToToken.ts --apply apps/minimal  # 루트 지정
 */
import { Glob } from "bun";

const NEUTRALS = new Set(["gray", "slate", "zinc", "neutral", "stone"]);
const STATUS: Record<string, string> = {
  red: "destructive",
  rose: "destructive",
  green: "success",
  emerald: "success",
  lime: "success",
  teal: "success",
  amber: "warning",
  yellow: "warning",
  orange: "warning",
  blue: "info",
  sky: "info",
  cyan: "info",
  indigo: "info",
};
// 자동 매핑하지 않는 브랜드성 팔레트(잔여로 리포트).
const BRAND = new Set(["purple", "violet", "fuchsia", "pink"]);
const ALL_PALETTE = [...NEUTRALS, ...Object.keys(STATUS), ...BRAND];

const PREFIX =
  "(?:bg|text|border(?:-[tblrxy])?(?:-[se])?|ring(?:-offset)?|fill|stroke|shadow|from|to|via|divide|outline|decoration|placeholder|caret|accent)";

const RE = new RegExp(
  `(^|[\\s"'\`{(\\[:!])(${PREFIX})-(${ALL_PALETTE.join("|")})-(\\d{2,3})(?=[\\s"'\`})\\]:/!,]|$)`,
  "g",
);

const isBg = (p: string) => p === "bg";
const isBorderish = (p: string) =>
  p.startsWith("border") || p === "divide" || p === "outline" || p === "ring" || p === "ring-offset";
const isInk = (p: string) => p === "text" || p === "fill" || p === "stroke";

/** 중립 팔레트를 prefix + 명도로 시맨틱 토큰에 라우팅. */
const neutralToken = (prefix: string, shade: number): string => {
  if (isBorderish(prefix)) return "border";
  if (isInk(prefix)) return shade >= 700 ? "foreground" : "muted-foreground";
  if (isBg(prefix)) {
    if (shade <= 300) return "muted";
    if (shade <= 600) return "muted-foreground";
    return "secondary";
  }
  return "muted-foreground"; // shadow/from/to/via/placeholder/caret/accent/decoration
};

interface Residue {
  file: string;
  cls: string;
}

const applyRules = (text: string, residue: Residue[], file: string): { out: string; count: number } => {
  let count = 0;
  const out = text.replace(RE, (m, pre: string, prefix: string, palette: string, shadeStr: string) => {
    if (BRAND.has(palette)) {
      residue.push({ file, cls: `${prefix}-${palette}-${shadeStr}` });
      return m; // 미변경
    }
    const token = NEUTRALS.has(palette) ? neutralToken(prefix, Number(shadeStr)) : STATUS[palette];
    count++;
    return `${pre}${prefix}-${token}`;
  });
  return { out, count };
};

const shouldSkip = (path: string): boolean =>
  path.includes("/.akan/") ||
  path.includes("/dist/") ||
  path.includes("/node_modules/") ||
  path.includes("/public/") ||
  path.startsWith("apps/akan/") || // 문서 앱(daisyUI 존치) — 별도 마이그레이션
  /\/page\/styles\.css$/.test(path) ||
  /\/Editor\/Lexical\/theme\.ts$/.test(path); // 신택스 하이라이트 팔레트(정당한 다색 요구)

const main = () => {
  const mode = process.argv.includes("--apply") ? "apply" : "dry";
  const argRoots = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const roots = argRoots.length > 0 ? argRoots : ["apps/minimal", "libs", "pkgs/akanjs"];
  const patterns = ["**/*.tsx", "**/*.ts", "**/*.css"];
  const files: string[] = [];
  for (const root of roots) {
    for (const pat of patterns) {
      for (const f of new Glob(`${root}/${pat}`).scanSync(".")) {
        if (!shouldSkip(f)) files.push(f);
      }
    }
  }
  let totalHits = 0;
  let changedFiles = 0;
  const samples: string[] = [];
  const residue: Residue[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const { out, count } = applyRules(src, residue, file);
    if (count > 0) {
      totalHits += count;
      changedFiles++;
      if (samples.length < 20) samples.push(`  ${file}: ${count}`);
      if (mode === "apply") writeFileSync(file, out);
    }
  }
  console.info(`[${mode}] scanned ${files.length} files across roots: ${roots.join(", ")}`);
  console.info(`[${mode}] ${totalHits} auto-mapped replacements across ${changedFiles} files`);
  console.info("sample changed files:");
  console.info(samples.join("\n"));
  if (residue.length > 0) {
    console.info(`\n⚠️ ${residue.length} brand-palette hits NOT auto-mapped (manual routing needed):`);
    const byFile = new Map<string, string[]>();
    for (const r of residue) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r.cls]);
    for (const [f, classes] of byFile) console.info(`  ${f}: ${classes.join(", ")}`);
  }
  if (mode === "dry") console.info("\n(dry-run only — no files written. Use --apply to write.)");
};

main();
