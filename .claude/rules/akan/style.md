---
description: Styling: Tailwind order, the semantic colour vocabulary, cn(), recipes and the app theme.
paths:
  - "apps/**/*.tsx"
  - "libs/**/*.tsx"
  - "apps/**/*.css"
  - "libs/**/*.css"
  - "apps/*/ui/Recipe/**"
  - "libs/*/ui/Recipe/**"
---

<!-- akan:generated -->

# Styling

The theme, lib tokens, `cn`, recipes and component overrides: `cssRule`, `recipeRule` and `componentRule` in the
`akan-ui` skill.

- **Never hand-order Tailwind classes** — `nursery/useSortedClasses` sorts them, `cn()` arguments included.
- **Plain CSS needs no Tailwind**: a stylesheet with no `@import "tailwindcss"`, `@theme`, `@apply` or `theme()` is
  only inlined and minified.
- **Stay inside the color vocabulary** (`no-raw-palette-class`, `no-arbitrary-color`, `no-interpolated-arbitrary-class`,
  `no-daisyui-legacy-class`, `no-inline-color`): no raw palette (`bg-blue-500`), arbitrary or interpolated color
  classes, daisyUI classes or slots, or `style={{}}` colors — they render no CSS. Use semantic tokens
  (`bg-primary`, `text-foreground/70`); a fixed color takes `// biome-ignore lint/plugin: <reason>`.
- **Never guess a recipe name or variant value**, nor open a recipe file to call one: an app's or lib's recipes are
  in its `AGENTS.md` (`## Recipes In Scope`), the framework's below. A recipe's second argument merges itself
  and takes an array; never wrap it in `cn()`.

The framework recipes (`*` marks the default, `key?` is a boolean flag) — the full contract:

Import from `akanjs/ui`:
- `badgeRecipe`(variant: default*|primary|secondary|accent|neutral|success|warning|info|error|outline · size: xs|sm|md*|lg · outline?) — 뱃지 look — 시맨틱 variant × size, outline 플래그는 색을 유지한 외곽선 스타일. `<Badge>` 가 소비하며, recipes.badge 슬롯으로 교체 가능.
- `buttonRecipe`(variant: default|primary*|secondary|accent|neutral|outline|ghost|destructive|success|warning|info|link · size: xs|sm|md*|lg|xl|icon · shape: default*|square|circle · outline?) — 버튼 look — 시맨틱 variant × size × shape, outline 플래그는 색을 유지한 외곽선 스타일. `<Button>` 이 소비하며, `_overrides.tsx` 의 recipes.button 슬롯으로 교체 가능.
- `inputRecipe`(kind: field*|area|select · size: xs|sm|md*|lg|xl · tone: default*|primary|error) — 입력 표면 look — Input/TextArea/DatePicker 가 공유하는 필드 셸. kind 로 한 줄 필드(field)/멀티라인(area)/네이티브 `<select>`(select), tone 으로 강조/오류 상태를 고른다.
