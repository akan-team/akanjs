# CSS Rule Guideline

## Purpose
Use TailwindCSS with Akan's semantic design-token layer and the `akanjs/ui` primitives for app UI and docs pages.

## Ownership
- Use Tailwind utility classes for layout, spacing, typography, and responsive behavior.
- Use Akan's semantic color tokens:
  - Surfaces/text: `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `bg-card`, `bg-popover`, `border-border`, `border-input`, `ring-ring`.
  - Brand/status: `primary`, `secondary`, `accent`, `destructive`, `success`, `warning`, `info`, `neutral`, `open` — each with a `-foreground` pair for text on that surface (e.g. `bg-primary text-primary-foreground`).
- Compose classes with `cn` from `akanjs/client` (token-aware tailwind-merge) — the only class-combining function. No object syntax: write `cond && "x"`.
- Static class strings stay plain: `cn` only for a conditional or to merge an incoming `className`.
- Forward `className` last so callers can extend styles: `cn("base", cond && "extra", className)`.
- Multi-slot components take named props (`wrapperClassName`), never a `classNames` object.
- An enum→class lookup is a module-scope `as const` map typed `{ [key in cnst.XStatus["value"]]: string }`, not
  `Record<...>`. Shared by a second module, the classes become a recipe variant in `ui/Recipe/`; only an enum→variant
  name map (`BadgeVariants["variant"]`) moves to `webkit/`.

## Color Vocabulary
- What lint refuses and its exception are the `style` rule, loaded with every `.tsx` and `.css`. daisyUI's dropped
  color slots (`bg-base-100`, `text-base-content`, `text-primary-content`, `bg-error`) become `background` / `muted` /
  `border`, `foreground`, `<color>-foreground` and `destructive`; the exception fits a fixed color such as an
  OS-chrome mockup or a data-viz palette.
- daisyUI component classes (`btn-primary`, `card-body`) render no CSS unless the app defines them, so lint only warns;
  `akan verify` drops the warning once the app's or a lib's stylesheet defines the class.
- Color literals in SVG color attributes (`fill`, `stroke`, `stopColor`, `floodColor`, `lightingColor`, `color`) and
  in `el.style.<prop> = …` / `el.style.setProperty(…)` writes are flagged as warnings for now; `currentColor`,
  `none`, `transparent`, `var(--…)` and `url(#id)` stay legal.

## Recipe Layer
- Reusable or variant-like styling belongs in a recipe (a cva-style factory), not repeated inline class stacks.
- Framework primitives ship recipes: `buttonRecipe` and `badgeRecipe` from `akanjs/ui`. Call them as `buttonRecipe(variants, className?)`:
  - `buttonRecipe({ variant: "primary", size: "lg" }, "w-full rounded-2xl")`
- Prefer the `akanjs/ui` primitives (`Button`, `Badge`, `Input`, `Field`, `Table` …) over re-implementing a component's look with utility stacks. There is **no `Card`/`Box` primitive** — a card/box is a recipe surface (e.g. `appCard`), not an `akanjs/ui` component; do not `import { Card }`.
- App-specific repeated surfaces go one-per-file in `apps/<app>/ui/Recipe/` (server-safe, no `"use client"`) via `recipe(tv({ base, variants }))`, imported from `@apps/<app>/ui`. App recipes **extend** (surfaces the lib lacks — chat bubble, tile); they never re-define a lib component in parallel.
- Full recipe authoring/consumption policy: the `recipeRule` guideline. The recipe lists are the `style` rule (framework recipes) and each app's or lib's `AGENTS.md` (`## Recipes In Scope`).

## Customization Decision (where a design delta goes)
When a request implies a distinct look and feel, do not stop at colors — customize the theme and, when needed, the
components. Screen code is invariant — a plain `<Button variant="primary">` never changes. Only these config files do:
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
- Radius uses `rounded-box` (cards/modals), `rounded-field` (buttons/inputs), `rounded-selector` (toggles/checkboxes);
  the theme retunes corner rounding through `--radius-box` / `--radius-field`.

## Lib-Owned Tokens (`libs/<lib>/ui/tokens.css`)
- A lib that needs colors of its own — vendor brand colors pinned by someone else's guide (Kakao `#fee500`, Naver `#1ec800`), fixed in-game surfaces — declares them **once** in `libs/<lib>/ui/tokens.css`. Never copy the block into each app's stylesheet.
- The file is collected automatically: every app whose page graph reaches that lib compiles it, ordered **ahead of** the app's own stylesheets, so the app wins on any variable both declare. There is nothing to import and no sync step to remember; two libs both declaring one variable resolve in lib-name order, so do not rely on that.
- Declare plain custom properties under `:root`, not a Tailwind `@theme` extension: the color vocabulary is closed per stylesheet, so `bg-kakao` would generate no CSS. Reference them as `bg-[var(--kakao)]` / `text-[var(--kakao-foreground)]`, which `no-arbitrary-color` allows by design (a `var()` reference is not an arbitrary color literal).
- Theme-following colors still belong to the app: a lib token is for a color that must **not** change with `data-theme`.
- An `@import` the CSS pipeline cannot resolve fails the build; it is never dropped. A stylesheet under `page/` that no route imports is compiled by nothing and warns at build time.
- A stylesheet whose import graph uses no Tailwind (no `@import "tailwindcss"`, no `@theme`, `@apply`, `@plugin` or other Tailwind at-rule, no `theme()`/`--alpha()`/`--spacing()`) skips the Tailwind compiler: only its imports are inlined and the build minifies it, with no Tailwind banner; one Tailwind feature anywhere in that graph compiles the whole stylesheet with Tailwind.

## Frame Variables (the page's chrome and the device's insets)

The frame writes these on `#frameRoot` and `<html>`, so any class can read them. The insets and the content height
are there on every surface; the three keyboard variables are written only on the server-rendered web:

- `--akan-top-safe-area` / `--akan-bottom-safe-area` — the notch and the home indicator. On the web they are
  `env(safe-area-inset-*)` where the route chain declares `safeArea` (`.config({ safeArea: true })` on the root
  layout) and `0px` where it does not, and `env()` measures nothing unless the viewport meta carries
  `viewport-fit=cover` — the root layout's `.viewport({ fitCover: true })`, which a native app has by default; in a
  native app they are the shell's inset. Use the variable alone: never write `env(safe-area-inset-*)` beside it, and
  never subtract one from the other. The frame paints the bottom strip only under bottom chrome (a `BottomInset` or
  `BottomTab`) or a route's own `bottomSafeAreaColor`; elsewhere a page's `fixed bottom-0` bar paints its own
  safe-area padding.
- `--akan-top-inset` / `--akan-bottom-inset` — the height of the page's top bar and bottom tab slot, per breakpoint
  when the page declares a responsive inset. A slot whose inset is 0 at a width clips its chrome there and hides it
  from the keyboard and screen readers, so a phone-only bar needs no `md:hidden`.
- `--akan-overlay-top` / `--akan-overlay-bottom` — the chrome a route's `overlay` runs the page under (`0px`
  elsewhere); pad the page's scroller by it so its last row clears the bar.
- `--akan-keyboard-inset`, `--akan-viewport-height`, `--akan-viewport-offset-top` — the on-screen keyboard over the
  page's bottom, the visible height, and how far iOS panned the page to show a field (the top slots follow it). Only
  an SSR page in a browser writes them; a CSR bundle and a native app never do, so read them with a fallback
  (`var(--akan-keyboard-inset, 0px)`), or take the keyboard from the store's `keyboardHeight`, which a native app's
  keyboard plugin fills.
- `--akan-content-height` — the room between the insets. iOS pans under the keyboard instead of shrinking the page,
  so a column sized by it leaves the panned-to area blank: keep a keyboard-heavy screen's input bar in flow at the end
  of its column, or in the keyboard slot.

## Codegen Rules
- Do not use `!important` to fight component composition.
- Do not hide focus states on interactive elements.
- When an `akanjs/ui` component is structurally too restrictive, re-skin it with a `page/**/_overrides.tsx` slot override (see the componentRule guideline), not `!important` utilities or a fork.

## Review Checklist
- Repeated/variant styling uses a recipe; class composition uses `cn` (never raw `twMerge`/`clsx` imports).
- The instruction points to current docs pages and current Akan builder APIs.
- The output contract tells the model which file paths to return.
