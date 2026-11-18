---
description: Styling: Tailwind order, the semantic colour vocabulary, cn(), recipes and the app theme.
paths:
  - "{apps,libs}/**/*.tsx"
  - "{apps,libs}/**/*.css"
  - "{apps,libs}/*/ui/Recipe/**"
---

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
