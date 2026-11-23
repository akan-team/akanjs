## Akan.js

Akan.js is a full-stack TypeScript framework: business code written once reaches web, native apps, server, database
and infrastructure. A workspace is Bun-first: `apps/<app>` holds pages, domain modules, UI, env files and
`akan.config.ts`; `libs/<lib>` holds shared domain and utility code apps reuse.

## Read First

A common task's docs in one `cat` before writing code. With the path rules of the files you write, they are enough to
start; `pageRule`, `ssrRule` and `cssRule` answer a question they leave open.

- Pages over an outside HTTP API, no stored model: `.agents/skills/akan-{service,page}/SKILL.md
  .agents/skills/akan-service/references/akanApi-{services-and-adapters,endpoints}.md
  .agents/skills/akan-page/references/akanApi-routes.md .claude/rules/akan/{page,ssr,config,style}.md`
- A stored model and its screens: `.agents/skills/akan-{scaffold,module,ui}/SKILL.md
  .claude/rules/akan/{module,page,ssr,tsx}.md`
- A page or layout alone: `.agents/skills/akan-page/SKILL.md .agents/skills/akan-page/references/akanApi-routes.md
  .claude/rules/akan/{page,ssr,style}.md`

## Work Loop

1. Read the module's `*.abstract.md` and its neighbours before changing it; when to update it is the `module` rule.
2. Prefer an Akan workflow to a hand edit: `akan workflow list` / `plan <name> … --out <plan>` / `apply <plan>`, or
   `akan mcp`'s `plan_workflow` / `apply_workflow`, one per step of a compound request (`create-module`, then
   `add-field`) — the `akan-scaffold` skill. Hand-edit the owning source file only when no workflow fits or apply
   reports manual action.
3. Never hand-edit a generated file (listed below). After adding, renaming or deleting a file, run
   `akan sync <app-or-lib>`.
4. After editing, run `akan verify [<app-or-lib>]` once: it syncs, lints with fixes, typechecks, fast-builds and
   checks SSR over what changed. Fix and rerun until it prints `verify ok`; never run `akan lint`, `akan typecheck`
   and `akan build` one by one. Run it before a slow end-to-end suite (Playwright, `npm test`), so what it asks for
   is fixed before that run rather than repeating it.
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

## Finishing Work

- Carry the task through to `verify ok`. A failing check, a stale generated file, a stopped dev server or a tool
  error is an ordinary obstacle: diagnose it and work through it (`akan sync`, `akan repair generated`, a retry,
  another command) rather than stopping to report it or offering to continue. Silencing a check is not a way through.
- Routine steps need no confirmation: reading code, `akan sync`, `akan verify`, `akan test`, `akan preview`, and the
  workflow plan and apply the task calls for. Ask only when the work cannot go on without the answer, and keep doing
  the parts that do not depend on it.
- A deliberate blocker stays put — another person's change in a dirty tree, an `akan.baseline.json` entry, a secret
  you cannot read, a failure outside what you changed: leave it, say what you found, and finish the rest. Confirm
  before a step that is hard to undo or leaves this machine, such as a push, a deploy or a write to a shared database.

## Reporting

Write the final message for a reader who did not watch your tool calls. Lead with the outcome, name every file you
changed (small edits too), give each check's own result line, and say what you left undone or could not check, and
why. Use plain words, not labels you coined during the work.

## Looks Wrong, Is Right — Do Not "Fix"

Each is deliberate, and the bracketed rule says why: Tailwind class order (Biome sorts it) [style];
`static name = "User";` on a guard class [auth]; `(this as unknown as RootStore)` in a store, `return await …save()`
in a service [module]; `key={idx}` and short dependency arrays [tsx]; empty scaffold files, the `// state` /
`// action` markers, `as const` on `enumOf(...)` arrays, typos in domain vocabulary [ts]; one-line re-export shims in
a lib's `common/`, `webkit/`, `ui/` [app].

## Rules That Break The Build

`akan verify` reports each by the check in parentheses; the bracketed path rule holds the full contract.

- Throw `new Err("<module>.error.<key>")`, the key in the module dictionary's `.error({})` — never a raw `Error`
  (`no-throw-raw-error`) or `akanjs/common`'s untyped `Err` (`no-import-common-err`) [app].
- A third-party package reaches `page/**`, a barrel or a module file only through a lib re-export
  (`no-import-external-library`) [app].
- Semantic colors only (`bg-primary`, `text-foreground/70`), no palette, arbitrary, daisyUI or `style={{}}` color
  (`no-raw-palette-class`, `no-arbitrary-color`, `no-daisyui-legacy-class`, `no-inline-color`) [style].
- No `console.log` / `console.debug` or `logger.log()` (`noConsole`, `no-deprecated-log-level`) [app].
- No `document.cookie`, `localStorage`, `sessionStorage` (`no-document-cookie`, `no-web-storage`): `getCookie`,
  `setCookie`, `storage`, `secretStorage` from `akanjs/client` [app].
- Client and server files never import each other, `import type` aside (`no-import-server-in-client`,
  `no-import-client-in-server`) [ssr].
- A server write leaves the browser only through a store action, one write per action or handler; chain writes in
  one service method (`akan.write.placement`, `akan.store.multi-write`, `akan.component.write-chain`) [gates].
- Every endpoint and named slice names its `guards`, `[Public]` for anonymous (`no-unguarded-endpoint`) [auth].
- No list over 500 rows (`no-oversized-list-limit`) [module]; no conditional hook call, `st.*` included
  (`useHookAtTopLevel`, `no-conditional-st-hook`) [tsx].
- Files and components have size limits (`akan.size.file`, `akan.size.component`); `akan.baseline.json` only shrinks:
  never add or raise an entry (`akan.baseline.growth`) [gates].
- A plugin diagnostic is suppressed only as `// biome-ignore lint/plugin: <reason>` [app].

## Code Style

- `const` arrows, `interface` shapes, no non-null assertions or `as any`, `#private` (TypeScript `private` in a
  `*.constant.ts`, `*.document.ts`, `*.service.ts` or `*.store.ts`), one class per file, English identifiers, and
  user text through `l("model.field")` or `l.trans({ en, ko })`, inline when `i18n.locales` names one locale [ts].
- Comment only what the code cannot say — a vendor quirk, an infrastructure constraint, security reasoning, a domain
  field's meaning, a state transition, a rejected alternative (`akan.comment.added`) [ts].
- `"use client"` only for a hook, an event handler, the store, a browser global or a client-only package [ssr].

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
| URLs without `/<locale>/` (one language, or paths fixed from outside) | `i18n: { localePrefix: "as-needed" }` in `akan.config.ts` |
| A change to the stored document shape | `akan create-migration <name> <app>` |

## Secrets

Never print, summarise or commit secret values, credentials, tokens, private keys or `.env` contents; name env keys
with placeholders only. `AKAN_PUBLIC_*` values ship to the browser — never put a secret in one.
