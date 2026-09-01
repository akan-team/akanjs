# Akan.js Framework Guide

## Purpose
Use this as the compact framework context for AI codegen. It should explain how Akan turns convention-based files into a full-stack app without teaching every API in one place.

## Ownership
- `apps/<app>` contains app code, pages, env files, module folders, UI, webkit, srvkit, and common utilities.
- `libs/<lib>` contains reusable domain and utility libraries consumed by apps.
- `pkgs/akanjs` contains framework facets such as base, constant, document, service, signal, store, client, ui, and CLI tooling.
- Domain behavior lives near the model folder instead of being split by technical layer first.

## Current Akan Patterns
- Database module flow is `constant -> dictionary -> document -> service -> signal -> store -> UI`.
- Scalars live under `lib/__scalar/<scalarName>` and represent embedded value objects.
- Service modules live under `lib/_<serviceName>` when behavior is not centered on one stored model.
- Generated registry files such as `cnst.ts`, `db.ts`, `dict.ts`, `sig.ts`, `srv.ts`, and `st.ts` are scanner outputs and should not be hand-authored.
- Pages and components should consume generated client/server helpers rather than duplicating model shapes.

## Codegen Rules
- Prefer the most specific guideline for file syntax; use this guide only for global architecture context.
- When generating a new feature, start with the smallest necessary layer set and add later layers only when required by behavior.
- Keep business decisions in constant, document, or service; keep API exposure in signal; keep client coordination in store; keep rendering in UI files.
- Use direct module imports where scanner rules expect them, and avoid inventing new top-level app folders.

## Theming And UI Customization
When a request implies a distinct look and feel, do not stop at colors — customize both the theme and, when needed, the components.

- **Theme (`apps/<app>/page/styles.css`).** The app imports Tailwind and `akanjs/ui/styles.css`, then overrides semantic token *values* per theme under `:root, [data-theme="dark"]` and `[data-theme="light"]` (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, … each with a `-foreground` pair for text). The framework maps them to Tailwind color names, so `bg-primary` / `text-foreground` follow the `data-theme` attribute; corner rounding uses `--radius-box` / `--radius-field`. Fetch `get_guideline` with `cssRule` for the full token set before a deep theme pass.
- **Lib tokens (`libs/<lib>/ui/tokens.css`).** Colors a lib's own components pin — a vendor brand color, a fixed surface — are declared once there as plain `:root` custom properties and compiled into every app that reaches the lib, ahead of the app's stylesheets. Reference them as `bg-[var(--kakao)]`; never copy the block into each app.
- **Components (`page/**/_overrides.tsx`).** When a default `akanjs/ui` component (Button, Modal, Table, Input, Select, …) is too restrictive for the design, re-skin it per route instead of forking, wrapping, or fighting it with utility classes. Write a drop-in replacement in `apps/<app>/ui/` typed against the slot contract (`AkanModalComponent`, or `AkanUiOverrides["<Slot>"]`), composing the framework's headless parts, then bind it in a `page/**/_overrides.tsx` manifest with a single `export default override({ Slot: BrandComponent })`. Overrides cascade down the route tree like layouts (closest ancestor wins). Fetch `get_guideline` with `componentRule` and read the `references/ui/customize` docs page for the slot list and patterns.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
