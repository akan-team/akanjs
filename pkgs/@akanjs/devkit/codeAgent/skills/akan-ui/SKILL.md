---
name: akan-ui
description: "A module's components: the Unit/View vs Template/Zone/Util split, forms, and what never to hand-roll. A page or a model-free ui/ component needs only the ssr, style and tsx rules."
---

# Akan UI

A page, or a `ui/` component bound to no model, needs nothing more from here: the `ssr`, `style` and `tsx` rules
loaded with the file are its contract. The rest is for a module's own components, lists and forms.

**Server is the default and `"use client"` is a cost you justify per component.** A component earns the
directive only by using a hook, a JSX event handler, the store, a browser global, or a client-only package.
Rendering markup, reading a param, calling `l()`, and mapping over data are all server work.

Four moves that keep markup on the server: wrap the interaction and render `children` untouched; split a
compound component so only the provider holds state; fetch in the route and pass the result into a `Zone` as
an `init` prop; push the boundary down to the leaf that needs it.

## A module's components

A new View / Unit / Template / Zone / Util for an existing module comes from the `create-ui` workflow (the
`akan-scaffold` skill). Edit the scaffolded component instead of authoring one from scratch. The boundary is
mechanical by role, not a judgement call:

| role | side | directive |
| --- | --- | --- |
| `<Model>.Unit.tsx`, `<Model>.View.tsx` | server | never `"use client"` |
| `<Model>.Template.tsx`, `<Model>.Zone.tsx`, `<Model>.Util.tsx` | client | `"use client"` on line 1 |
| `page/**` | server | never |

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

## Forms

Store-driven end to end: `value={xForm.field}` with `onChange={st.do.setFieldOnX}`, **the setter passed by
reference**. An inline arrow silently drops the control's agent annotation and fails
`no-unpublished-form-setter.grit`. Nested rows use `st.do.writeOnX("payments.3.name", v)`.

Full detail: `get_guideline` with `ssrRule`, `componentRule`, `cssRule`, `recipeRule`, or the per-role
`modelUnit` / `modelView` / `modelZone` / `modelTemplate` / `modelUtil`.
