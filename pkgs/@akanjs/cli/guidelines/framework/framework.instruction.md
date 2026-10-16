# Akan.js Framework Guide

## Ownership
- `pkgs/akanjs` facets include base, constant, document, service, signal, store, client, ui, and CLI tooling.
- Domain behavior lives near the model folder instead of being split by technical layer first.

## Current Akan Patterns
- Database module flow is `constant -> dictionary -> document -> service -> signal -> store -> UI`.
- Scalars (`lib/__scalar/<scalarName>`) represent embedded value objects; service modules (`lib/_<serviceName>`) hold
  behavior not centered on one stored model.
- Pages and components should consume generated client/server helpers rather than duplicating model shapes.

## Codegen Rules
- Prefer the most specific guideline for file syntax; use this guide only for global architecture context.
- When generating a new feature, start with the smallest necessary layer set and add later layers only when required by behavior.
- Keep business decisions in constant, document, or service; keep API exposure in signal; keep client coordination in store; keep rendering in UI files.
- Use direct module imports where scanner rules expect them, and avoid inventing new top-level app folders.

## Theming And UI Customization
When a request implies a distinct look and feel, do not stop at colors — customize both the theme and, when needed, the components.

- **Theme (`apps/<app>/page/styles.css`).** The app imports Tailwind and `akanjs/ui/styles.css`, then overrides semantic token *values* per theme under `:root, [data-theme="dark"]` and `[data-theme="light"]` (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, … each with a `-foreground` pair for text). The framework maps them to Tailwind color names, so `bg-primary` / `text-foreground` follow the `data-theme` attribute; corner rounding uses `--radius-box` / `--radius-field`. Fetch `get_guideline` with `cssRule` for the full token set before a deep theme pass.
- **Lib tokens (`libs/<lib>/ui/tokens.css`).** The one CSS file a lib owns: colors its own components pin that must **not** follow the theme — a vendor brand color, a fixed surface — declared once as plain `:root` custom properties and compiled automatically into every app whose pages reach the lib, ahead of the app's stylesheets, so nothing is imported by hand. Reference them as `bg-[var(--kakao)]`; never copy the block into each app. `@theme` extensions stay in the app stylesheet, because the color vocabulary is closed per stylesheet, and theme-following colors are the app's.
- **Components (`page/**/_overrides.tsx`).** When a default `akanjs/ui` component (Button, Modal, Table, Input, Select, …) is too restrictive for the design, re-skin it per route instead of forking, wrapping, or fighting it with utility classes. Write a drop-in replacement in `apps/<app>/ui/` typed against the slot contract (`AkanModalComponent`, or `AkanUiOverrides["<Slot>"]`), composing the framework's headless parts, then bind it in a `page/**/_overrides.tsx` manifest with a single `export default override({ Slot: BrandComponent })`. Overrides cascade down the route tree like layouts (closest ancestor wins). Fetch `get_guideline` with `componentRule` and read the `references/ui/customize` docs page for the slot list and patterns.
