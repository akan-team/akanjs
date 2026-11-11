## Akan.js

Akan.js is a full-stack TypeScript framework: business code written once reaches web, native apps, server, database
and infrastructure. A workspace is Bun-first: `apps/<app>` holds pages, domain modules, UI, env files and
`akan.config.ts`; `libs/<lib>` holds shared domain and utility code apps reuse.

## Work Loop

1. Read the module's `*.abstract.md` and its neighbours before changing it. Update the abstract when an invariant, a
   workflow or public behaviour changes, never for a style-only edit.
2. Prefer an Akan workflow to a hand edit: `akan workflow list` / `explain <name>` / `plan <name> … --out <plan>` /
   `apply <plan>`, or the `list_workflows` / `plan_workflow` / `apply_workflow` tools of `akan mcp`. Split a
   compound request into workflows applied in order (`create-module`, then `add-field`). Hand-edit only the owning
   source file, and only when no workflow fits or apply reports manual action.
3. Never hand-edit a generated file (listed below). After adding, renaming or deleting a file, run
   `akan sync <app-or-lib>`.
4. After editing, run `akan verify [<app-or-lib>]` once. It syncs, lints with fixes, typechecks, fast-builds and
   checks SSR over what changed, and prints only what failed. Fix and rerun until it prints `verify ok`; never run
   `akan lint`, `akan typecheck` and `akan build` one by one.
5. After a page, UI or runtime change, run `akan preview <app> --changed` (or name the paths) and quote its verdict
   lines; it reuses the running dev server. Name any platform you could not open.
6. Check an endpoint with a signal test (`akan test <app> [files]`), never raw HTTP against the dev server.
7. Scaffolds take the target positionally (`akan create-module photo <app>`, `akan sync <app>`); only `add-field` and
   `add-enum-field` take `--app` / `--module`.

## Change Scope

- Change what the task needs and the files directly tied to it — no formatting-only diffs, no style rewrites nearby.
- Never revert or overwrite someone else's change in a dirty working tree.
- Follow the nearest established pattern; when two shapes disagree, follow the newer neighbour. A new abstraction must
  remove real duplication — near-identical sibling modules are copied with changed literals, not parameterised.

## Looks Wrong, Is Right — Do Not "Fix"

- Tailwind class order (`font-bold text-2xl text-foreground`) — Biome sorts it, `cn()` arguments included.
- `static name = "User";` on a guard class — `fetch` serializes it and the API explorer filters on it.
- `(this as unknown as RootStore).logout()` in a store — the sanctioned way to reach another store.
- `key={idx}` and short dependency arrays — `noArrayIndexKey` and `useExhaustiveDependencies` are off on purpose.
- Empty scaffold files, empty dictionary stages, the `// state` / `// action` markers — they mark where code goes.
- One-line re-export shims in a lib's `common/`, `webkit/`, `ui/` — the only legal path for a third-party package.
- `return await …save()` in a service; `as const` on every `enumOf(...)` array.
- Typos and transliterated terms in domain vocabulary — callers match on the name.

## Rules That Break The Build

`akan verify` reports each through the check named in parentheses, and the bracketed path rule carries the full
contract. Path rules name their checks the same way.

- Throw `new Err("<module>.error.<key>")` with the key in the module dictionary's `.error({})`; never a raw `Error`
  (`no-throw-raw-error`) and never the untyped `Err` of `akanjs/common` (`no-import-common-err`) [app].
- A third-party package reaches `page/**`, a barrel or a module file only through a lib re-export
  (`no-import-external-library`) [app].
- Colors only from the semantic vocabulary (`bg-primary`, `text-foreground/70`) — no palette, arbitrary, daisyUI or
  `style={{}}` colors (`no-raw-palette-class`, `no-arbitrary-color`, `no-daisyui-legacy-class`, `no-inline-color`)
  [style].
- No `console.log` / `console.debug`, never `logger.log()` (`noConsole`, `no-deprecated-log-level`); server code logs
  through `this.logger` [app].
- No `document.cookie`, `localStorage` or `sessionStorage` (`no-document-cookie`, `no-web-storage`) — `getCookie`,
  `setCookie`, `storage`, `secretStorage` from `akanjs/client` [app].
- Client files never import server files and the reverse (`no-import-server-in-client`, `no-import-client-in-server`);
  `import type` is legal everywhere [ssr].
- A server write leaves the browser only through a store action, one write per action or handler
  (`akan.write.placement`, `akan.store.multi-write`, `akan.component.write-chain`); chained writes become one service
  method behind one endpoint [gates].
- Every endpoint and named slice names its `guards`, `[Public]` when anonymous is the intent (`no-unguarded-endpoint`)
  [auth].
- Never ask a list for more than 500 rows (`no-oversized-list-limit`) [module]; never call a hook conditionally, `st.*`
  hooks included (`useHookAtTopLevel`, `no-conditional-st-hook`) [tsx].
- A file or component past its size limit fails (`akan.size.file`, `akan.size.component`), and `akan.baseline.json`
  only shrinks (`akan.baseline.growth`) — never add or raise an entry [gates].
- Suppress a plugin diagnostic as `// biome-ignore lint/plugin: <reason>`; every suppression carries a reason [app].

## Code Style

- `const` arrow functions over `function`; `interface` for shapes, `type` for unions; no non-null assertions
  (`as unknown as T`, never `as any`); `#private`, but `private` in `*.{constant,document,service,store}.ts`.
- One class per file, named after it; TypeScript files are camelCase, component and convention files excepted.
- Identifiers, endpoint names and logs are English; everything a user reads goes through `l("model.field")` or
  `l.trans({ en, ko })`, and dictionary entries are `[en, ko]` pairs.
- Comment only what the code cannot say (`akan verify` flags each new one as `akan.comment.added`) — a vendor quirk,
  an infrastructure constraint, security reasoning, a domain field's meaning, a state transition, a rejected
  alternative. Never restate code, label a section or add JSDoc; retire a symbol with
  `/** @deprecated <what instead> */`.
- Server rendering is the default: `"use client"` only for a hook, an event handler, the store, a browser global or
  a client-only package.

## Where Code Goes

| Code | Place |
|---|---|
| A database-backed noun (User, Product) | `lib/<model>/` — `akan create-module <model> <app>` |
| A workflow or integration with no stored model | `lib/_<service>/` — `akan create-service <service> <app>` |
| An embedded value type (Address) | `lib/__scalar/<scalar>/` — `akan create-scalar <scalar> <app>` |
| A route | `page/` — `<route>.tsx`, `_index.tsx`, `_layout.tsx`, `[param]/` |
| A pure, isomorphic helper | `common/<name>.ts` (imports `akanjs/base` only, never throws) |
| A React hook, browser or native-bridge code | `webkit/use<Thing>.tsx` |
| An adapter, guard, or code touching `node:*`, `Bun`, env or a secret | `srvkit/<name>.ts` |
| JSX or a look not bound to one model | `ui/<Component>.tsx`, `ui/Recipe/<name>.ts` |
| The color theme | semantic token values in `page/styles.css` |
| An iOS, Android or desktop app | `native: { … }` in `akan.config.ts`; an owned plugin in `native/<id>/` |
| A change to the stored document shape | `akan create-migration <name> <app>` |

## Secrets

Never print, summarise or commit secret values, credentials, tokens, private keys or `.env` contents; name env keys
with placeholders only. `AKAN_PUBLIC_*` values ship to the browser — never put a secret in one.
