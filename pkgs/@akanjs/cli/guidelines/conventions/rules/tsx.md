---
description: React components: the five roles, forms, loading states, hooks and the lint rules on .tsx files.
paths:
  - "{apps,libs}/**/*.tsx"
---

# React Components

A screen that grows keeps five roles: an **assembly** `Zone` that reads the store and places pieces, with no
branching; **pieces** (`Unit`, `View`, small components) that only display, server-rendered where they can be; a
**kind table** `{ [kind in cnst.X["value"]]: Component }` instead of mode flags, so a new enum value without an entry
is a type error — each entry is a component of the module that owns that kind's data (a tab of video scenes is
`VideoScene.Zone.<X>`), so a screen spanning several models adds no folder; an **interaction hook**
`webkit/use<X>.tsx` over a pure, tested `common/<x>.ts` class for drag, selection and keys, handed its writes as
arguments; and **writes** as one-line store actions, one endpoint each. Kinds a screen invents rather than a model
(canvas node kinds) key the table by an `as const` union in `common/`. A screen choosing along two axes (what to
pick, and where the pick lands) keeps two tables, the second mapping each purpose to its one commit action. State
several components or an agent tool read stays in the store, where `st.tool` sees it; the hook keeps only gesture
state. Reach for the path, not the nearest file:

| Task | Path |
|---|---|
| A state-changing act, or chained writes in an action or handler | `akan workflow plan add-mutation --app <app> --module <m> --mutation <verbModel> --guard <Guard>[,…] [--with <ref>.<method>] [--after <ref>.<method>]` |
| Event, keyboard, pointer or layout logic growing in a component | `akan workflow plan create-interaction --app <app> --interaction <name>` |
| A missing `View` / `Unit` / `Template` / `Zone` / `Util` | `akan workflow plan create-ui --app <app> --module <m> --surface <surface>` |

- `export const X = ({ … }: XProps) => { return (…); };` — `export default` only for pages, layouts, `lazy()`
  targets. No `React.FC`, `defaultProps`, `PropsWithChildren`; defaults in the destructuring, `children: ReactNode`.
- `cond ? <X/> : null`, never `{cond && <X/>}` (renders `"false"` in a `className`); early `return null` only for
  guard clauses.
- Never hand-roll loading, empty, or list states: `Load.Units` / `Load.View` / `Load.Edit` (`renderItem`,
  `renderList`, `renderView`, `renderEmpty`), `<Empty />`, `Model.New` / `Model.Edit` / `Model.SureToRemove`.
  Otherwise `<Load.Stream of={promise} fallback={…}>{(value) => …}</Load.Stream>` awaits one promise behind its own
  boundary (a resolved value renders in the shell).
- Avoid hooks. `useState` only for modal-open, tab, draft-input, and drag state, never server data; `useEffect` only
  for a genuine effect (subscribe-with-cleanup, one-shot init); `Tab` over a mode switch; zero `useState` in a
  `.Template.tsx`.
- Forms are store-driven: `value={xForm.field}`, `onChange={st.do.setFieldOnX}` **by reference** — that emits the
  `data-akan-action` / `data-akan-state` the in-page agent, E2E selectors and browser agents read. Always `Field.*`,
  never a bare `<input>` for a model field; nested rows use `st.do.writeOnX("payments.3.name", v)` and the generated
  `add<Field>OnX` / `sub<Field>OnX`. Never hand-write `data-akan-*`.
- Read with `st.use.*`, write with `st.do.*`; client components never call `fetch.*`.
- A raw `<button>` defaults to `type="submit"`, so a click inside any `<form>` also submits it. Write
  `type="button"` on every raw `<button>` that does not submit; `<Button>` from `akanjs/ui` already defaults to it.
- **Never persist form values yourself** — `Load.Edit`, `Model.EditModal` and `Model.New` save and recover the whole
  `<model>Form` per record or route and user (`draft={false}` off, `draft="<scope>"` to name it; secret and hidden
  values never saved; field `cache` / `cacheKey` props are deprecated no-ops — `modelStore`).
- `<Link>` from `akanjs/ui` for internal navigation; `<a>` only for `mailto:` and external links. A `<Link>` handed
  an absolute URL (any scheme, any case) or a `//host` path passes it through untouched and opens it outside the app;
  only an app path gets the locale (none for the default locale under `i18n.localePrefix: "as-needed"`) and basePath.
  `Href.isExternal(href)` from `akanjs/client` is that test.

## Lint Rules On Components

- **Never type a `*.Util.tsx` / `*.Zone.tsx` prop as a `cnst` model** (`no-model-type-in-util-zone`) — the server would
  hand a class instance to a client component; take `bannerId: string` and read the model from the store. Exempt:
  `cnst.<Enum>["value"]`, a `ClientInit` / `ClientView` / `ClientEdit` / `ModelsProps<…>` type argument, a
  function-typed prop, a `cnst` type that never leaves the file; `ModelProps<…>` and other indexed accesses stay
  flagged.
- **Never wrap a form setter in a pass-through arrow** (`no-unpublished-form-setter`) —
  `(v) => st.do.setTypeOnTicket(v)` emits no `data-akan-action` and publishes no agent tool. A wrapper that transforms,
  adds a statement, or calls `writeOnX` is legal; publish it with an explicit `st.tool`.
- **Never call a hook conditionally** — a skipped call shifts every later hook, and production React crashes
  elsewhere. Biome's `useHookAtTopLevel` checks plain hooks (`useState`, `useEffect`), early returns included.
  `no-conditional-st-hook` checks the `st` hooks it cannot see — `st.use.*`, `st.slice.<x>.use.*`, `st.sel`, `st.ref`,
  `st.tool(…).exec()` / `.card()`, `st.useState(…).init()`, `st.expose(…).value()` — behind `||` / `&&` / `??`, in a
  ternary, an `if`, a `switch`, a loop, a `catch`, a default value, an optional call or a callback; not after an early
  `return` or inside a helper the component calls. Read each into its own `const` at the top, then combine.
- **No async component under `ui/`** (`no-async-component-in-ui`) — React has no async client component. Await in the
  page, or hand an unawaited `fetch.*` field to a `Zone` / `<Load.Stream of={…}>`, and take the data as a prop. An async
  handler in a synchronous component and `lazy(async () => import(…))` are untouched.
- **Never call `fetch.init<Model><Suffix>` / `fetch.get<Model>Init<Suffix>` from a client file** (`"use client"` or
  `*.store.ts`; `no-init-fetch-in-client`) — it is the hydration snapshot. Load it in the page and pass `init` down;
  reload with `st.do.init<Model><Suffix>()`.
- `noArrayIndexKey` and `useExhaustiveDependencies` are **off** on purpose — `key={idx}` for embedded scalars and
  short dependency arrays are intentional.
