---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

feat(lint): ban `cnst` model types in `*.Util.tsx` / `*.Zone.tsx` props

`Util` and `Zone` are always client components, so a `cnst.Banner` / `cnst.LightBanner` prop is a hydrated class
instance the server has to hand across the boundary — the functions are stripped on the way and what arrives is a
plain object wearing the model's type. `no-model-type-in-util-zone.grit` reports it and points at the two shapes
that work: take `bannerId: string` and read the model from the store, or take the payload the framework already
serializes.

Three exemptions, because none of them is an instance. `cnst.<Enum>["value"]` is an indexed access that resolves to
a string union, which is how every enum prop in the codebase is already written (`roles: cnst.AdminRole["value"][]`).
A `ClientInit` / `ClientView` / `ClientEdit` type argument is mapped through `GetStateObject<…>` before it reaches
a prop, which is the sanctioned server-to-client handoff. A `ModelsProps<cnst.Setting>` type argument spends the
model on `onClickItem?: (model: M) => unknown` and nowhere else, so it is the function-typed-prop exemption reached
through a generic — whoever passes the callback is a client component already holding the value.
`ModelProps<"setting", cnst.LightSetting>` stays reported: it spreads the model onto the props themselves, and the
`Unit` / `View` files that take it are server components outside this rule's scope. Any *other* indexed access is
still reported — `cnst.Banner["image"]` is a `File`.

The rule keys on the `cnst.` qualifier in a type position, so it never touches a value expression, and it is scoped
to those two filename suffixes: `Unit` and `View` are server components and keep taking the model itself.

Only prop positions are read: a `*Props` interface or type alias, and the inline object type on the component's own
parameter. A `cnst` type that never leaves the file is not a boundary crossing and is left alone — a local
annotation, a callback parameter the framework itself types with the model (`renderItem`, `renderList`), a
module-scope helper, a non-`Props` local shape, and the props of a component nested inside another one. A
function-typed prop (`onPick?: (t: cnst.LightTicket) => void`) is exempt too: a closure cannot cross the RSC
boundary at all, so whoever passes it is a client component that already holds the value.
