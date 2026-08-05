# CSS Rule Guideline

## Purpose
Use TailwindCSS with Akan's semantic design-token layer and the `akanjs/ui` primitives for app UI and docs pages.

## Ownership
- Use Tailwind utility classes for layout, spacing, typography, and responsive behavior.
- Use Akan's semantic color tokens — never a raw Tailwind palette color (`bg-blue-500`) or a hex value:
  - Surfaces/text: `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `bg-card`, `bg-popover`, `border-border`, `border-input`, `ring-ring`.
  - Brand/status: `primary`, `secondary`, `accent`, `destructive`, `success`, `warning`, `info`, `neutral`, `open` — each with a `-foreground` pair for text on that surface (e.g. `bg-primary text-primary-foreground`).
- Compose classes with `cn` from `akanjs/client` (token-aware tailwind-merge) — the only class-combining function. No object syntax: write `cond && "x"`.
- Forward `className` last so callers can extend styles.

## Recipe Layer
- Reusable or variant-like styling belongs in a recipe (a cva-style factory), not repeated inline class stacks.
- Framework primitives ship recipes: `buttonRecipe` and `badgeRecipe` from `akanjs/ui`. Call them as `buttonRecipe(variants, className?)` — the second argument is merged automatically, so you never wrap it in `cn()`:
  - `buttonRecipe({ variant: "primary", size: "lg" }, "w-full rounded-2xl")`
- Prefer the `akanjs/ui` primitives (`Button`, `Badge`, `Input`, `Field`, `Table` …) over re-implementing a component's look with utility stacks. There is **no `Card`/`Box` primitive** — a card/box is a recipe surface (e.g. `appCard`), not an `akanjs/ui` component; do not `import { Card }`.
- App-specific repeated surfaces go one-per-file in `apps/<app>/ui/Recipe/` (server-safe, no `"use client"`) via `recipe(tv({ base, variants }))`, imported from `@apps/<app>/ui`. App recipes **extend** (surfaces the lib lacks — chat bubble, tile); they never re-define a lib component in parallel.
- Full recipe authoring/consumption policy: the `recipeRule` guideline. Never guess recipe names/imports — the authoritative list is `AGENTS.md` `## UI Recipes` plus the `list_recipes` tool.

## Customization Decision (where a design delta goes)
Screen code is invariant — a plain `<Button variant="primary">` never changes. Only these config files do:
- **Theme differs** (color/radius/font) → override token *values* in `apps/<app>/page/styles.css`.
- **A lib component's look differs** → recipe override: `export default override({ recipes: { button: neonButtonRecipe } })` in a `page/**/_overrides.tsx`. Every `<Button>` in that route subtree re-skins; behavior (async states, focus, a11y) is untouched. The swap recipe must accept the framework recipe's full variant surface.
- **Structure/behavior differs** (modal → drawer) → component override (`override({ Modal: BrandModal })`), reassembling headless parts.
- **A surface the lib lacks** → a new app recipe (extension).
- Do not fight the cascade with `!important`, and when the same inline className tweak repeats, promote it to a recipe override or a variant.

## Theme Declaration (`apps/<app>/page/styles.css`)
- The file imports Tailwind and the framework tokens, then overrides token *values* per theme:
  ```css
  @import "tailwindcss";
  @import "akanjs/ui/styles.css";

  :root,
  [data-theme="dark"] {
    --background: #1a1a1a;
    --foreground: #ffffff;
    --primary: #ff493b;
    --primary-foreground: #ffffff;
    --muted: #2a2a2a;
    --border: #3a3a3a;
  }
  [data-theme="light"] {
    --background: #fafafa;
    --foreground: #2c3e50;
    --primary: #c33c32;
    --primary-foreground: #ffffff;
    --muted: #f5f5f5;
    --border: #e5e5e5;
  }
  ```
- The framework maps these variables to Tailwind color names (`@theme inline` in `akanjs/ui/styles.css`), so a class like `bg-primary` / `text-foreground` resolves to different colors per `data-theme` — the app only sets values, never re-declares the mapping.
- Switching themes is toggling the `data-theme` attribute. Keep every token defined in both the dark and light blocks.
- Radius uses `rounded-box` (cards/modals), `rounded-field` (buttons/inputs), `rounded-selector` (toggles/checkboxes).

## Codegen Rules
- Do not hardcode hex or raw-palette colors (`bg-red-500`, `#ff0000`); use semantic tokens.
- Do not put inline color literals in `style={{ }}`; use token classes.
- Do not use `!important` to fight component composition.
- Do not hide focus states on interactive elements.
- When an `akanjs/ui` component is structurally too restrictive, re-skin it with a `page/**/_overrides.tsx` slot override (see the componentRule guideline), not `!important` utilities or a fork.

## Review Checklist
- All color goes through semantic tokens — no raw palette, no hex, no inline color.
- Repeated/variant styling uses a recipe; class composition uses `cn` (never raw `twMerge`/`clsx` imports).
- The instruction points to current docs pages and current Akan builder APIs.
- The output contract tells the model which file paths to return.
