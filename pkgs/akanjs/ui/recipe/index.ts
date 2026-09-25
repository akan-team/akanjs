/**
 * recipe 레이어 — 프리미티브의 스타일 recipe(변형)를 모으는 **서버-안전** 폴더.
 * **여기엔 절대 `"use client"` 를 붙이지 않는다.** 팩토리(`recipe`/`tv`)는 `./factory` 에 있다.
 *
 * 구조: recipe 하나당 파일 하나(`<name>Recipe.ts`), 이 index 는 재수출만 한다. 앱도 같은 구조를
 * `apps/<app>/ui/Recipe/` 에서 계승한다.
 *
 * 호출 규격: `xRecipe(변형객체, 커스텀클래스?)`. 두 번째 인자 className 은 recipe 안에서 tailwind-merge 로
 * 자동 병합되므로 호출부에서 `cn(...)` 으로 감쌀 필요가 없다. 문자열 하나만이 아니라 배열도 받는다:
 *   buttonRecipe({ variant: "primary" }, "w-full rounded-2xl")   // ✅ cn 불필요
 *   buttonRecipe({ variant: "primary" }, ["h-full", className])  // ✅ 배열 — 여기서도 cn 불필요
 *
 * 레이어: styles.css(토큰) → recipe(변형) → 컴포넌트(동작).
 */
export { type BadgeVariants, badgeRecipe } from "./badgeRecipe";
export { type ButtonVariants, buttonRecipe } from "./buttonRecipe";
export { recipe, tv } from "./factory";
export { type InputSurfaceVariants, inputRecipe } from "./inputRecipe";
