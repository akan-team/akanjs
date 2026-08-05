import type { ClassNameValue as ClassValue } from "tailwind-merge";
import { createTV } from "tailwind-variants";
import { colorTokens } from "../../client/cn";

/**
 * recipe 팩토리 모듈 — 변형 팩토리를 만드는 **인프라**. **서버-안전** (절대 `"use client"` 금지).
 * 실제 recipe 정의는 이 폴더의 형제 파일 하나당 하나씩 둔다 — 프레임워크는 `./<name>Recipe.ts`,
 * 각 앱은 `apps/<app>/ui/Recipe/<name>.ts`.
 */

// akan 의 시맨틱 색 토큰을 tv 내장 tailwind-merge 에 주입 → `cn` 과 동일한 병합 동작(예: bg-primary→bg-open).
export const tv = createTV({ twMergeConfig: { extend: { theme: { color: colorTokens } } } });

/**
 * recipe 팩토리 — `tv({...})` 인스턴스를 받아 겉을 `(변형, className?)` 2-인자로 노출하고,
 * className 병합(cn)을 안으로 숨긴다. 타입은 넘겨받은 tv 인스턴스에서 그대로 추론되어 변형 타입이
 * 정확히 보존된다. 반환은 순수 className 문자열이라 서버-안전.
 *
 *   export const xRecipe = recipe(tv({ base, variants }));
 *   xRecipe({ variant: "primary" }, "w-full")   // cn 불필요
 */
export const recipe =
  <P extends object>(styles: (props?: P) => string) =>
  (variants?: Omit<P, "class" | "className">, className?: ClassValue): string =>
    styles({ ...variants, class: className } as unknown as P);
