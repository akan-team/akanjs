/**
 * minimal 앱의 recipe 레이어 — **서버-안전** 폴더 (여기에 `"use client"` 를 붙이지 않는다).
 * 구조는 프레임워크 `akanjs/ui/recipe` 를 계승한다: recipe 하나당 파일 하나, 이 index 는 재수출만 한다.
 *
 * 레이어: page/styles.css(토큰) → 프레임워크 recipe → **이 앱 recipe** → 컴포넌트/페이지.
 * 프레임워크 recipe 를 아래에서 이름 단위로 재수출해 계승한다 — 소비자는 `@apps/minimal/ui` 한 경로에서
 * 프레임워크/앱 recipe 를 모두 가져온다. `export *` 가 아니라 named 재수출이어야 한다(컴포넌트까지 끌고
 * 오지 않도록). recipeScanner 는 선언만 감지하므로 AGENTS.md 목록에 중복 등재되지 않는다.
 *
 * 규약: 새 앱 변형은 페이지에 인라인하지 말고 `./<name>.ts` 를 만들어
 * `export const <name> = recipe(tv({ base, variants }))` 로 추가한 뒤 여기서 재수출한다.
 * 호출은 `<name>(변형객체, 커스텀클래스?)` — cn 불필요.
 */
export {
  type BadgeVariants,
  type ButtonVariants,
  badgeRecipe,
  buttonRecipe,
  type InputSurfaceVariants,
  inputRecipe,
} from "akanjs/ui";
export { type AppBoxVariants, appBox } from "./appBox";
export { type AppCardVariants, appCard } from "./appCard";
export { appNavClass } from "./appNav";
export { type ChatBubbleVariants, chatBubbleRecipe } from "./chatBubble";
export { type GradientSurfaceVariants, gradientSurfaceRecipe } from "./gradientSurface";
export { type IconTileVariants, iconTileRecipe } from "./iconTile";
export { neonButtonRecipe } from "./neonButton";
