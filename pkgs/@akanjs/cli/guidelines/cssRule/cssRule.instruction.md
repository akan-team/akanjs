# CSS Rule Guideline

## Purpose
Use TailwindCSS and DaisyUI in a theme-safe, composable way for Akan UI and docs pages.

## Ownership
- Use Tailwind utility classes for layout, spacing, typography, and responsive behavior.
- Use DaisyUI semantic tokens such as base, primary, secondary, accent, info, success, warning, and error.
- Use `clsx` from `akanjs/client` for conditional class composition.
- Forward `className` at the end of composed class strings to allow callers to extend styles.

## Current Akan Patterns
- Prefer mobile-first responsive classes.
- Use card, btn, input, badge, alert, divider, tabs, modal, and other documented DaisyUI classes when they match the design.
- Use consistent density and spacing within one component family.
- Keep custom CSS files rare and scoped to cases utilities cannot express cleanly.

## Theme Customization (`apps/<app>/page/styles.css`)
- The app theme is defined in `apps/<app>/page/styles.css` with daisyUI v5 `@plugin "daisyui/theme"` blocks (typically `light` and a `default: true` `dark`).
- Brand-level customization means tuning the whole theme block, not only the color tokens. A theme that only changes `--color-*` still looks like the default framework skin.
- Color tokens: `--color-primary`, `--color-secondary`, `--color-accent`, `--color-neutral`, `--color-info`, `--color-success`, `--color-warning`, `--color-error`, `--color-base-100/200/300`, and their `*-content` pairs.
- Shape and feel tokens (set these too):
  - `--radius-selector` — rounding for checkbox, toggle, badge.
  - `--radius-field` — rounding for button, input, select, tab.
  - `--radius-box` — rounding for card, modal, alert.
  - `--size-selector`, `--size-field` — base scale (density) of selector and field controls.
  - `--border` — component border width (e.g. `1px`, `2px`).
  - `--depth` — `0` flat, `1` adds a subtle 3D lift to components.
  - `--noise` — `0` off, `1` adds a grain texture to surfaces.
- Keep shape/feel tokens consistent across the light and dark theme blocks unless the design deliberately differs by mode.

## When Utilities Are Not Enough
- Prefer theme tokens and DaisyUI component classes over one-off utility stacks that re-implement a component's look.
- When a framework `akanjs/ui` component is structurally too restrictive, re-skin it with a `page/**/_overrides.tsx` slot override (see the componentRule guideline), not with `!important` utilities or a fork.

## Codegen Rules
- Do not hardcode hex colors or one-off brand colors unless the existing file already defines that design system.
- Do not use important flags to fight component composition.
- Do not hide focus states on interactive elements.
- Do not add global CSS for one component-specific layout.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
