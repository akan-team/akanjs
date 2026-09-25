import type { ClassNameValue as ClassValue } from "tailwind-merge";
import { createTV } from "tailwind-variants";
import { colorTokens, radiusTokens } from "../../client/cn";

/**
 * recipe 팩토리 모듈 — 변형 팩토리를 만드는 **인프라**. **서버-안전** (절대 `"use client"` 금지).
 * 실제 recipe 정의는 이 폴더의 형제 파일 하나당 하나씩 둔다 — 프레임워크는 `./<name>Recipe.ts`,
 * 각 앱은 `apps/<app>/ui/Recipe/<name>.ts`.
 */

// akan 의 시맨틱 색/radius 토큰을 tv 내장 tailwind-merge 에 주입 → `cn` 과 동일한 병합 동작
// (예: bg-primary→bg-open, rounded-field→rounded-full).
export const tv = createTV({ twMergeConfig: { extend: { theme: { color: colorTokens, radius: radiusTokens } } } });

/**
 * recipe 팩토리 — `tv({...})` 인스턴스를 받아 겉을 `(변형, className?)` 2-인자로 노출하고,
 * className 병합(cn)을 안으로 숨긴다. 타입은 넘겨받은 tv 인스턴스에서 그대로 추론되어 변형 타입이
 * 정확히 보존된다. 반환은 순수 className 문자열이라 서버-안전.
 *
 *   export const xRecipe = recipe(tv({ base, variants }));
 *   xRecipe({ variant: "primary" }, "w-full")            // cn 불필요
 *
 * 2번째 인자는 `ClassNameValue` — 문자열 하나만이 아니라 **배열·중첩 배열·falsy 값**을 그대로 받는다.
 * 여러 클래스를 합칠 때 `cn(...)` 으로 감쌀 이유가 없다(모르면 감싸게 되는데, cn 을 몰아내려고 만든
 * 2-인자 계약이 거기서 새어나간다):
 *
 *   xRecipe({}, ["h-full", className])                   // ✅ cn 불필요
 *   xRecipe({}, ["h-full", isWide && "w-full"])          // ✅ falsy 는 무시됨
 *   xRecipe({}, cn("h-full", className))                 // ❌ 불필요한 래핑
 */
export const recipe =
  <P extends object>(styles: (props?: P) => string) =>
  (variants?: Omit<P, "class" | "className">, className?: ClassValue): string =>
    styles({ ...variants, class: className } as unknown as P);
