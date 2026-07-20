#!/usr/bin/env bun
/**
 * daisyui → shadcn 토큰 rename codemod (Phase 1).
 *
 * className 유틸의 색 토큰 이름만 치환한다:
 *   base-100 → background, base-content → foreground,
 *   error → destructive, *-content → *-foreground (state colors).
 * base-200/base-300 및 primary/secondary/accent/info/success/warning/neutral/open 의
 * bare 이름은 유지(커스텀 존치/동일 명명). CSS 변수 문자열(var(--color-*))·동적 조합
 * (`text-${type}`)은 이 codemod가 다루지 않음 — 별도 수동 처리(플랜 참조).
 *
 * 대상: apps/**, libs/** 의 *.tsx/*.ts/*.css. 프레임워크(pkgs/akanjs)는 Phase 2에서 처리.
 * 제외: 손으로 재작성한 앱 테마(page/styles.css), public/ vendored, .akan/, dist/, node_modules.
 *
 * 사용:
 *   bun scripts/codemods/daisyuiTokenRename.ts --dry     # 변경량만 리포트
 *   bun scripts/codemods/daisyuiTokenRename.ts --apply   # 실제 적용
 */
import { Glob } from "bun";
import { readFileSync, writeFileSync } from "node:fs";

// 유틸 접두사(색을 받는 것들). 방향성 border(border-t 등) 포함.
const PREFIX =
  "(?:bg|text|border(?:-[tblrxy])?(?:-[se])?|ring(?:-offset)?|fill|stroke|shadow|from|to|via|divide|outline|decoration|placeholder|caret|accent)";

// 순서 중요: 더 구체적인 -content 를 bare 보다 먼저. base-200/300 은 대상 아님(미포함).
const TOKEN_MAP: [string, string][] = [
  ["base-content", "foreground"],
  ["base-100", "background"],
  ["error-content", "destructive-foreground"],
  ["error", "destructive"],
  ["primary-content", "primary-foreground"],
  ["secondary-content", "secondary-foreground"],
  ["accent-content", "accent-foreground"],
  ["info-content", "info-foreground"],
  ["success-content", "success-foreground"],
  ["warning-content", "warning-foreground"],
  ["neutral-content", "neutral-foreground"],
  ["open-content", "open-foreground"],
];

// 토큰 경계: 앞은 접두사-(선행은 공백/따옴표/백틱/괄호/콜론/!(important)),
// 뒤는 클래스 종결 문자(공백/따옴표/백틱/괄호/콜론/슬래시(opacity)/!(important)/쉼표/끝).
const rules = TOKEN_MAP.map(([from, to]) => ({
  to,
  re: new RegExp(`(^|[\\s"'\\\`{(\\[:!])(${PREFIX}-)${from}(?=[\\s"'\\\`})\\]:/!,]|$)`, "g"),
}));

const applyRules = (text: string): { out: string; count: number } => {
  let out = text;
  let count = 0;
  for (const { re, to } of rules) {
    out = out.replace(re, (_m, pre, prefix) => {
      count++;
      return `${pre}${prefix}${to}`;
    });
  }
  return { out, count };
};

const shouldSkip = (path: string): boolean =>
  path.includes("/.akan/") ||
  path.includes("/dist/") ||
  path.includes("/node_modules/") ||
  path.includes("/public/") ||
  // 손으로 재작성한 앱 테마 파일
  /\/page\/styles\.css$/.test(path);

const main = () => {
  const mode = process.argv.includes("--apply") ? "apply" : "dry";
  const roots = ["apps", "libs"];
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
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const { out, count } = applyRules(src);
    if (count > 0) {
      totalHits += count;
      changedFiles++;
      if (samples.length < 15) samples.push(`  ${file}: ${count}`);
      if (mode === "apply") writeFileSync(file, out);
    }
  }
  console.info(`[${mode}] scanned ${files.length} files`);
  console.info(`[${mode}] ${totalHits} replacements across ${changedFiles} files`);
  console.info("sample files:");
  console.info(samples.join("\n"));
  if (mode === "dry") console.info("\n(dry-run only — no files written. Use --apply to write.)");
};

main();
