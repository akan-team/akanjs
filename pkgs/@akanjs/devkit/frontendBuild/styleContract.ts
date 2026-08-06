/**
 * styleGuard + themeValidator 결과를 배선(build/dev/lint)이 공유하는 포맷으로 정리한다.
 * severity 사다리: style 위반은 severity==="error" 인 것만, theme 위반은 전부 차단(build/CI) 대상.
 * dev 는 이 결과를 경고로만 출력한다.
 */
import type { StyleGuardViolation } from "./styleGuard";
import type { ThemeContrastViolation } from "./themeValidator";

export interface StyleContractViolations {
  style: StyleGuardViolation[];
  theme: ThemeContrastViolation[];
}

export const countBlocking = (v: StyleContractViolations): number =>
  v.style.filter((s) => s.severity === "error").length + v.theme.length;

export const formatStyleContract = (v: StyleContractViolations): string => {
  const lines: string[] = [];
  for (const s of v.style) {
    lines.push(`  [${s.severity}] ${s.rule}  ${s.path}:${s.line}`);
    lines.push(`      ${s.snippet}`);
    lines.push(`      → ${s.suggestion}`);
  }
  for (const t of v.theme) {
    lines.push(`  [error] contrast  ${t.scope}  ${t.pair} = ${t.ratio}:1 (min ${t.threshold}:1)`);
    lines.push(`      → ${t.suggestion}`);
  }
  return lines.join("\n");
};
