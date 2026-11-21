# Akan.js Monorepo — Agent Guide

This is the canonical, tool-neutral guide for coding agents (Claude Code, Codex, Cursor, and others)
working in this repository, and the only copy. Claude Code reads it through `CLAUDE.md` (`@AGENTS.md`)
and Cursor through `.cursor/rules/akan.mdc`, both of which are pointers holding no content of their own —
there is nothing to mirror a rule change into. The section between the `akan:agent` markers is generated
by `akan agent install`; edit anything outside the markers freely.

## Working On The Framework

- `pkgs/akanjs/*` holds the framework, runtime and tooling facets (base, constant, document, service, signal, store,
  client, ui) published as the single `akanjs` package — extend an existing facet before adding a framework-level
  pattern. `pkgs/@akanjs/cli` and `pkgs/@akanjs/devkit` hold the CLI and build tooling; `infra/` holds Helm,
  deployment templates, edge configs and the Jenkins env/secret scripts.
- A file in an `akanjs` facet imports its siblings by path, never its own facet's `index.ts` (`facetImports.test.ts`).
  The `signal`, `client`, `server`, `constant` and `store` barrels name every export, so a new export reaches
  `akanjs/<facet>` only once its facet's `index.ts` names it. `bun run api:report` then rewrites the report CI checks.
- The grit lint plugins scope `apps/` and `libs/` only; `pkgs/` still follows the house style, comments included.
- `akan lint` and `akan verify` hold a package to a structure budget: a file ≤ 800 lines, a function ≤ 150
  (`akan.size.function`), a class ≤ 60 members (`akan.size.class`). `pkgs/<pkg>/akan.baseline.json` records the debt
  it started with and only shrinks; split the code rather than raise an entry.
- In `pkgs/akanjs`, `server/`, `service/` and `signal/` fail with an `AkanError` subclass carrying a code, never a
  bare `Error` constructed, thrown, rejected or extended (`akan.error.bare-error`). The same baseline holds the
  package's total of them, recorded per file, so moving one passes and a new one anywhere fails. Removing one lowers
  the section in the same change: `akan verify akanjs` writes it, and CI fails until it is committed. A new or changed
  code goes into the `errorCodes` guideline with `bun run error:codes`; the devkit test fails while it is stale.
- `akan verify @akanjs/cli` lints and typechecks one package. Tests run with `bun run akan test <pkg> [files]` from
  the root or `cd <pkg> && bun test --isolate ./<file>`, never plain `bun test` from the root.
- `apps/akan/public/llms/**` and `llms-full.txt` mirror the docs pages under `apps/akan/page/(docs)`. After changing
  a docs page run `bun apps/akan/script/generateLlms.ts` (after `akan sync akan` in a fresh checkout) and commit the
  result; CI's `Sync is clean` job fails while the mirror is behind.
- The managed block below, `.claude/rules/akan/`, `.cursor/rules/akan-*.mdc`, `.claude/skills/` and
  `.agents/skills/` are generated from `pkgs/@akanjs/cli/guidelines/conventions/` (`core.md`, `rules/*.md`) and
  `pkgs/@akanjs/devkit/codeAgent/skills/`. Edit those sources, then run `akan agent install`.

<!-- akan:agent:start -->
<!-- akan:agent:version 3.2.0 -->

## Workspace

- Repo: akanjs
- Apps: akan, groupedroot, minimal
- Libraries: shared, util
- Packages: @akanjs/cli, @akanjs/devkit, @akanjs/language, @akanjs/native, @akanjs/vscode, akanjs, create-akan-workspace, use-agentic

## Akan.js

Akan.js is a full-stack TypeScript framework: business code written once reaches web, native apps, server, database
and infrastructure. A workspace is Bun-first: `apps/<app>` holds pages, domain modules, UI, env files and
`akan.config.ts`; `libs/<lib>` holds shared domain and utility code apps reuse.

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
   and `akan build` one by one.
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

## Path Rules

Each area's full contract is a rule file in `.claude/rules/akan/`. Claude Code and Cursor load it when a
file tool reads or edits a match, not when a shell command or a scaffold writes one: read it yourself before that,
as any other agent does before editing a match.

| Files | Rule |
|---|---|
| `{apps,libs}/**` | `app.md` |
| `{apps,libs}/**/*.signal.ts`, `{apps,libs}/**/srvkit/**` | `auth.md` |
| `{apps,libs}/*/akan.config.ts`, `{apps,libs}/*/main.ts`, `{apps,libs}/*/env/**` | `config.md` |
| `{apps,libs}/**/*.constant.ts` | `constant.md` |
| `{apps,libs}/**/*.tsx`, `{apps,libs}/**/*.{store,service,document}.ts`, `{apps,libs}/*/{ui,webkit}/**`, `{apps,libs}/*/akan.baseline.json`, `pkgs/**/*.{ts,tsx}`, `pkgs/**/akan.baseline.json` | `gates.md` |
| `{apps,libs}/*/{common,webkit,srvkit,ui,plugin,native}/**` | `layer.md` |
| `{apps,libs}/*/script/migration/**` | `migration.md` |
| `{apps,libs}/**/lib/**` | `module.md` |
| `{apps,libs}/**/page/**` | `page.md` |
| `**/.env*`, `**/*secret*`, `**/*credential*`, `infra/**` | `sensitive.md` |
| `{apps,libs}/**/*.{service,signal,document}.ts`, `{apps,libs}/**/srvkit/**` | `server.md` |
| `{apps,libs}/**/*.tsx`, `{apps,libs}/**/page/**` | `ssr.md` |
| `{apps,libs}/**/*.tsx`, `{apps,libs}/**/*.css`, `{apps,libs}/*/ui/Recipe/**` | `style.md` |
| `{apps,libs}/**/*.{test,spec}.ts` | `test.md` |
| `{apps,libs}/**/*.{ts,tsx}` | `ts.md` |
| `{apps,libs}/**/*.tsx` | `tsx.md` |

Skills in `.claude/skills/` and `.agents/skills/` carry procedures and the full guidelines:
`akan-validate`, `akan-scaffold`, `akan-module`, `akan-scalar`, `akan-service`, `akan-store`, `akan-ui`, `akan-err`, `akan-deps`, `akan-debug`, `akan-page`, `akan-query`, `akan-transport`, `akan-runtime`, `akan-mcp`, `akan-agent`. `akan guideline show <name>` prints any
guideline.

## Generated Files

Never hand-edit `apps/*/client.ts`, `apps/*/server.ts`, `*/lib/cnst.ts`, `*/lib/db.ts`, `*/lib/dict.ts`, `*/lib/sig.ts`, `*/lib/srv.ts`, `*/lib/st.ts`, `*/lib/usePage.ts`, `*/lib/useClient.ts`, `*/lib/useServer.ts`, `*/lib/__client/*.ts`, `*/lib/**/index.ts`, `*/ui/index.ts`, `*/webkit/index.ts`, `*/srvkit/index.ts`, `*/common/index.ts`. When one is stale or broken, fix the
owning source file and run `akan sync <app-or-lib>` or `akan repair generated`.
<!-- akan:agent:end -->
