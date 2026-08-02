# Customization

- Source: /references/ui/customize
- Mirror: /llms/pages/references/ui/customize.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Customization (#customization)
- How it works (#how-it-works)
- Scoping (#scoping)
- Overridable slots (#slots)
- Generic components (#generic-components)
- Compound components (#compound-components)

## Content

Customization

Leaf primitives

Generic

Input (compound)

Radio (compound)

DatePicker (compound)

ToggleSelect (compound)

Loading (namespace)

Any `akanjs/ui` component can be re-skinned per route without forking it. You write a drop-in replacement in your app's `ui/` folder and bind it to a framework slot in a `page/**/_overrides.tsx` manifest. Every existing `<Modal>`, `<Button>`, `<Table>` call site in that route subtree then renders your version instead — no call-site changes.

Overrides cascade down the route tree exactly like layouts: an override declared higher up applies to everything below it, and a nested manifest narrows or replaces it for its own subtree (closest ancestor wins).

The `_overrides.tsx` manifest is logic-free and needs no `"use client"` directive. `override()` returns a plain, server-safe map; the framework generates the client boundary that mounts the provider. Keep the file to imports plus a single `export default override({ … })`.

How it works

1. Write a drop-in component in `apps/<app>/ui/`. Type it against the slot contract (`AkanModalComponent`, or `AkanUiOverrides["<Slot>"]` for any other slot) so it is verified as a real replacement. Compose the framework's headless parts (e.g. `Dialog`) instead of re-implementing behavior.

1. App component

2. Declare it in `page/**/_overrides.tsx`. `override(map)` is a typed identity helper: keys are the PascalCase framework slot names, each value is checked against that slot's props, and unknown slot names are rejected at compile time.

2. Manifest

Scoping

Place `_overrides.tsx` at `page/` for an app-wide skin, or inside any route group / segment to scope it to that subtree. Nested manifests merge over ancestors slot-by-slot, so a child manifest only overrides the slots it lists and inherits the rest.

Nested scoping

Overridable slots

The framework exposes these slots. Behavioral/infrastructure components (Portal, InfiniteScroll, ClientSide, …) are intentionally not overridable — they are wiring, not skins.

Generic components

`Button` and `Select` are generic. The public component keeps its full generic signature, so call sites like `<Select<MyEnum, true> … />` still infer their value and onChange shapes. The override slot stores the widest instantiation, so you author a plain, non-generic replacement.

Generic override

Compound components

Components with sub-parts — `Input.Password`, `Radio.Item`, `DatePicker.RangePicker`, `ToggleSelect.Multi`, and every `Loading.*` member — expose one slot per leaf, named `<Base><Sub>` (e.g. `InputPassword`, `LoadingSpin`). Override just the leaves you want; the rest keep their defaults, and `Input.Password` / `Loading.Spin` access stays intact.

Compound leaf override

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

