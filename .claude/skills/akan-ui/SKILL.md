---
name: akan-ui
description: "Build Akan pages and components: the server-by-default rule, the Unit/View vs Template/Zone/Util split, forms, and what never to hand-roll."
---

<!-- akan:generated -->

# Akan UI

A new View / Unit / Template / Zone / Util for an existing module comes from the `create-ui` workflow (the
`akan-scaffold` skill). Edit the scaffolded component instead of authoring one from scratch.

## The boundary is mechanical, not a judgement call

| role | side | directive |
| --- | --- | --- |
| `<Model>.Unit.tsx`, `<Model>.View.tsx` | server | never `"use client"` |
| `<Model>.Template.tsx`, `<Model>.Zone.tsx`, `<Model>.Util.tsx` | client | `"use client"` on line 1 |
| `page/**` | server | never |

**Server is the default and `"use client"` is a cost you justify per component.** A component earns the
directive only by using a hook, a JSX event handler, the store, a browser global, or a client-only package.
Rendering markup, reading a param, calling `l()`, and mapping over data are all server work. Measure with
`akan quality ssr`; treat 50% server share as the floor and a falling share as a regression.

Four moves that keep markup on the server: wrap the interaction and render `children` untouched; split a
compound component so only the provider holds state; fetch in the route and pass the result into a `Zone` as
an `init` prop; push the boundary down to the leaf that needs it.

## Never hand-roll these

- loading / empty / list states → `Load.Units` / `Load.View` / `Load.Edit` with `renderItem`, `renderList`,
  `renderView`, `renderEmpty`; `<Empty />` for a bare placeholder; `Model.New` / `Model.Edit` /
  `Model.SureToRemove` for CRUD modals.
- a mount-time fetch → the route calls `fetch.init<Model><Slice>(…)` before the first byte. A
  `useEffect(…, [])` that loads data is flagged by `akan quality ssr`, and `fetch.init*` from a client file
  fails lint outright.
- a model field input → `Field.*`, never a bare `<input>`.
- a mode switch → `Tab`, not a `useState`.

## Component shape

`export const X = ({ … }: XProps) => { return (…); };` — arrow const, block body. Never `React.FC`, never
`defaultProps`, never `PropsWithChildren`; children are `children: ReactNode`. Declare
`interface XProps` directly above the component with `className?: string` first.

Conditional render is `cond ? <X/> : null`. **Never `{cond && <X/>}`** — in a `className` context it renders
the literal string `"false"`.

## Classes

Never hand-order Tailwind classes; the formatter sorts them and its output is correct. Stay inside the
semantic token vocabulary — `bg-primary`, `text-foreground/70` — because a raw palette class (`bg-blue-500`),
an arbitrary colour (`bg-[#3b82f6]`), a daisyUI legacy class, and a colour literal in `style={{…}}` all
render no CSS and fail lint. Reach for `cn` only for a conditional or to merge an incoming `className`, and
merge the caller last.

## Forms

Store-driven end to end: `value={xForm.field}` with `onChange={st.do.setFieldOnX}`, **the setter passed by
reference**. An inline arrow silently drops the control's agent annotation and fails
`no-unpublished-form-setter.grit`. Nested rows use `st.do.writeOnX("payments.3.name", v)`.

Full detail: `get_guideline` with `ssrRule`, `componentRule`, `cssRule`, `recipeRule`, or the per-role
`modelUnit` / `modelView` / `modelZone` / `modelTemplate` / `modelUtil`.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-ui/references/ssrRule.md` — Purpose · When A Client Boundary Is Earned · Quality Rules · Lint Rules Behind The Boundary · Implementation Playbook · …
- `.agents/skills/akan-ui/references/cssRule.md` — Purpose · Ownership · Color Vocabulary — What Lint Refuses · Recipe Layer · Customization Decision (where a design delta goes) · …
- `.agents/skills/akan-ui/references/componentRule.md` — Purpose · Ownership · Current Akan Patterns · Customizing Framework Components (Slot Overrides) · Codegen Rules · …
- `.agents/skills/akan-ui/references/recipeRule.md` — Purpose · Ownership · Consuming Recipes · Recipe vs Component vs Constant — The Gate · Authoring Recipes · …
- `.agents/skills/akan-ui/references/modelTemplate.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-ui/references/modelUnit.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-ui/references/modelView.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-ui/references/modelZone.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-ui/references/modelUtil.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-ui/references/framework.md` — Ownership · Current Akan Patterns · Codegen Rules · Theming And UI Customization
