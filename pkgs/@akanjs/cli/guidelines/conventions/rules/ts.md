---
description: TypeScript house style: classes, naming, file size, type shape, imports, comments.
paths:
  - "{apps,libs}/**/*.{ts,tsx}"
---

# TypeScript Style

## Coding Style

- Run a large unit of work through a class instance; prefer class or `static` methods over unrelated top-level
  helpers, and keep a class file's functions and variables inside the class when they reasonably can be.
- `#private` over TypeScript `private`, except in the four lint-banned suffixes, which use `private`.
- `const` function expressions over `function` declarations, unless hoisting, overloads, generators, or a framework
  convention make `function` the better fit.
- One class per file, named after it (`RouteClientBuilder.ts`, not `buildRouteClient.ts`). Migrate callers off an
  exported function that only instantiates a class and calls one method.
- TypeScript filenames are camelCase, except React component and convention files.
- One-off `className` strings stay inline; extract a constant only when reused, conditionally composed, or too large
  to read in JSX.

### File Size And Duplication

- Keep files small (house median well under 50 lines); split a component before ~150 lines rather than adding
  section comments.
- Ship every scaffold file even when empty — `export class XInternal extends internal(srv.x, () => ({})) {}`, empty
  dictionary stages, the `// state` / `// action` markers. They mark where things go.
- Never add a sibling helper file inside `lib/<model>/`; helpers go to `common/`, `webkit/`, `srvkit/`, or `ui/`.
- Prefer duplication to premature abstraction at the leaf: near-identical sibling modules and per-vendor pages are
  copied with changed literals, not parameterised; share enums by import only.

### TypeScript Shape

- `interface` for object shapes, `type` only for unions and aliases.
- `interface <ComponentName>Props` sits directly above the component (no blank line), `className?: string` first,
  named for the component (`CardProps`), never the model; exported only when a sibling imports it.
- No non-null assertions — narrow with `?.`, an early return, or a type predicate
  (`.filter((id): id is string => !!id)`). Escape with `as unknown as T`, never `as any`.
- Never annotate a component's return type; annotate a helper only for a union, tuple, or type predicate.
- `as const` on every `enumOf(...)` array (even though `enumOf` infers its literals, so a typo already fails to
  compile), `via(Model, [...] as const, …)` Light tuple, and module-scope lookup map; never the `enum` keyword.
- Async functions carry no `Async` suffix.

- **`#private` is banned in exactly `*.constant.ts`, `*.document.ts`, `*.service.ts`, `*.store.ts`**
  (`no-js-private-class-method`, by path, so it stays the house style everywhere else, `srvkit/` and `adapt()` classes
  included). A `#method` there becomes `private method()`, never `_method` (a service runs `_preCreate`-style names as
  hooks); `akan verify` renames it and its calls unless the class already has that name.

## TypeScript And Imports

- Bun and ESM per the root `tsconfig.json`. Path aliases across packages: `akanjs/*`, `@apps/*`, `@libs/*`,
  `@contract/*`, respecting the `/client` and `/server` entrypoints. Let Biome organize imports.
- Backend `.ts` namespaces the generated barrels — `import * as cnst from "../cnst"`, `* as db`, `* as srv` —
  with `import type * as srv` in services (keeps the runtime graph lazy) and a value import in signals.
- `.tsx` uses one flat named import from the package client path
  (`import { cnst, fetch, st, Ticket, usePage } from "@apps/<app>/client"`), never a relative `../` import.

- Biome formats: 2-space indent, 120 columns, double quotes.

## Naming And Language

- Component exports are role names (`Card`, `General`, `Preview`, `Admin`, `Remove`) — the namespace carries the
  model (`<Floor.Unit.Card>`, never `FloorCard`). `Util` exports are the endpoint verb minus the noun (`Serve`,
  `Refund`).
- Layer the verbs: the document chain method drops the model (`sign()`), the service keeps the bare verb, signal,
  store and dictionary re-add it (`signScContract`) — clear of generated CRUD, and `st.do.X` reads like `fetch.X`.
- Slice and filter names are prepositional (`inOrg`, `byStatuses`, `ofPortfolio`), never `getXInY` or `listX`.
- Handlers are `onX` props taking inline arrows, never an extracted `handleX`.
- Booleans `is*` / `has*` / `can*` / `show*` / `disable*`; counters `*Num`; indices `idx`; collections `*List` or
  plural; no `SCREAMING_SNAKE` — module-scope tables are camelCase + `as const`.
- Keep existing domain vocabulary and its typos — transliterated terms and misspellings in use are load-bearing, and
  renaming silently breaks callers that match on the name.
- Identifiers, type names, endpoint names, and log messages are **English**. Everything a user reads goes through
  `l("model.field")` or `l.trans({ en, ko })` — never a hard-coded JSX string, never `window.alert`.
- Dictionary entries are `[en, ko]` pairs, nearly every label with a `.desc([en, ko])` even when repetitive; English
  in Title Case, Korean the plain domain term, `.error()` Korean ending in `다.`.

## Comments

Do not narrate code. Do document the thing the code cannot say. Both halves are the rule.

- Never restate the identifier, the signature, or the control flow; prefer names and structure. No JSDoc, section
  banners, or "why/how" comments on ordinary logic.
- Density tracks the layer: pages carry none, product `lib/` and `ui/` stay under 1 %, `srvkit/` adapters and
  `guards.ts` (what would leak without each guard) carry what the external constraints require. `akan quality scan`
  reports a `lib/` module or `ui/` entry past 1 % once it holds five comment lines (`akan.comment.density`).
- Mark a retired field or function `/** @deprecated <what to use instead> */` on its declaration, never a
  `// deprecated` comment — only the tag strikes through every use site.
- Warranted for: a vendor or protocol quirk; an infrastructure constraint; a library gotcha; security reasoning; why
  an arbitrary-looking rule is correct; a math derivation; a domain field's business meaning; a state transition above
  a document chain method; why an obvious alternative was rejected.
- Markers: `TODO` (tracked unfinished work), `FIXME` (known broken), `XXX` (a hazard a reader must not miss), `//!`
  (disabled or must-fix — server, `srvkit/`, CLI only), `//?` (an aside), `//*` (a design note), and a deletion
  caution saying why removing a line would break something non-obvious.
- One short line each. Every suppression carries a reason (`// biome-ignore lint/<rule>: <why>`), never a bare
  disable block. Match the nearby density.
