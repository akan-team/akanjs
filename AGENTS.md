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
- The grit lint plugins scope `apps/` and `libs/` only; `pkgs/` still follows the house style, comments included.
- `akan verify @akanjs/cli` lints and typechecks one package. Tests run with `bun run akan test <pkg> [files]` from
  the root or `cd <pkg> && bun test --isolate ./<file>`, never plain `bun test` from the root.
- The managed block below, `.claude/rules/akan/`, `.cursor/rules/akan-*.mdc`, `.claude/skills/` and
  `.agents/skills/` are generated from `pkgs/@akanjs/cli/guidelines/conventions/` (`core.md`, `rules/*.md`) and
  `pkgs/@akanjs/devkit/codeAgent/skills/`. Edit those sources, then run `akan agent install`.

<!-- akan:agent:start -->
<!-- akan:agent:version 3.1.1-rc.16 -->

## Workspace

- Repo: akanjs
- Apps: akan, groupedroot, minimal
- Libraries: shared, util
- Packages: @akanjs/cli, @akanjs/devkit, @akanjs/native, akanjs, create-akan-workspace, use-agentic

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
5. Check an endpoint with a signal test (`akan test <app> [files]`), never raw HTTP against the dev server.
6. Scaffolds take the target positionally (`akan create-module photo <app>`, `akan sync <app>`); only `add-field` and
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

Lint enforces these, and `akan verify` reports them; the bracketed path rule carries the full contract.

- Throw `new Err("<module>.error.<key>")` with the key in the module dictionary's `.error({})`; never a raw `Error`
  [app].
- A third-party package reaches `page/**`, a barrel or a module file only through a lib re-export [app].
- Colors only from the semantic vocabulary (`bg-primary`, `text-foreground/70`) — no palette, arbitrary, daisyUI or
  `style={{}}` colors [style].
- No `console.log` / `console.debug`, never `logger.log()`; server code logs through `this.logger` [app].
- No `document.cookie`, `localStorage` or `sessionStorage` — `getCookie`, `setCookie`, `storage`, `secretStorage`
  from `akanjs/client` [app].
- Client files never import server files and the reverse; `import type` is legal everywhere [ssr].
- A server write leaves the browser only through a store action, one write per action or handler; chained writes
  become one service method behind one endpoint [gates].
- Every endpoint and named slice names its `guards` (`[Public]` when anonymous is the intent) [auth].
- Never ask a list for more than 500 rows [module]; never call a hook conditionally, `st.*` hooks included [tsx].
- A file or component past its size limit fails, and `akan.baseline.json` only shrinks — never add or raise an
  entry [gates].
- Suppress a plugin diagnostic as `// biome-ignore lint/plugin: <reason>`; every suppression carries a reason [app].

## Code Style

- `const` arrow functions over `function`; `interface` for shapes, `type` for unions; no non-null assertions
  (`as unknown as T`, never `as any`); `#private`, but `private` in `*.{constant,document,service,store}.ts`.
- One class per file, named after it; TypeScript files are camelCase, component and convention files excepted.
- Identifiers, endpoint names and logs are English; everything a user reads goes through `l("model.field")` or
  `l.trans({ en, ko })`, and dictionary entries are `[en, ko]` pairs.
- Comment only what the code cannot say — a vendor quirk, an infrastructure constraint, security reasoning, a domain
  field's meaning, a state transition, a rejected alternative. Never restate code, label a section or add JSDoc;
  retire a symbol with `/** @deprecated <what instead> */`.
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

## Path Rules

Each area's full contract is a rule file. Claude Code and Cursor load it when a matching file is touched; any other
agent reads it before editing a match.

| Files | Rule |
|---|---|
| `{apps,libs}/**` | `.claude/rules/akan/app.md` |
| `{apps,libs}/**/*.signal.ts`, `{apps,libs}/**/srvkit/**` | `.claude/rules/akan/auth.md` |
| `{apps,libs}/*/akan.config.ts`, `{apps,libs}/*/main.ts`, `{apps,libs}/*/env/**` | `.claude/rules/akan/config.md` |
| `{apps,libs}/**/*.constant.ts` | `.claude/rules/akan/constant.md` |
| `{apps,libs}/**/*.tsx`, `{apps,libs}/**/*.{store,service,document}.ts`, `{apps,libs}/*/{ui,webkit}/**`, `{apps,libs}/*/akan.baseline.json` | `.claude/rules/akan/gates.md` |
| `{apps,libs}/*/{common,webkit,srvkit,ui,plugin,native}/**` | `.claude/rules/akan/layer.md` |
| `{apps,libs}/*/script/migration/**` | `.claude/rules/akan/migration.md` |
| `{apps,libs}/**/lib/**` | `.claude/rules/akan/module.md` |
| `{apps,libs}/**/page/**` | `.claude/rules/akan/page.md` |
| `**/.env*`, `**/*secret*`, `**/*credential*`, `infra/**` | `.claude/rules/akan/sensitive.md` |
| `{apps,libs}/**/*.{service,signal,document}.ts`, `{apps,libs}/**/srvkit/**` | `.claude/rules/akan/server.md` |
| `{apps,libs}/**/*.tsx`, `{apps,libs}/**/page/**` | `.claude/rules/akan/ssr.md` |
| `{apps,libs}/**/*.tsx`, `{apps,libs}/**/*.css`, `{apps,libs}/*/ui/Recipe/**` | `.claude/rules/akan/style.md` |
| `{apps,libs}/**/*.{test,spec}.ts` | `.claude/rules/akan/test.md` |
| `{apps,libs}/**/*.{ts,tsx}` | `.claude/rules/akan/ts.md` |
| `{apps,libs}/**/*.tsx` | `.claude/rules/akan/tsx.md` |

Skills in `.claude/skills/` and `.agents/skills/` carry procedures and the full guidelines:
`akan-validate`, `akan-scaffold`, `akan-module`, `akan-scalar`, `akan-service`, `akan-store`, `akan-ui`, `akan-err`, `akan-deps`, `akan-debug`, `akan-page`, `akan-query`, `akan-transport`, `akan-runtime`, `akan-mcp`, `akan-agent`. `akan guideline show <name>` prints any
guideline.

## Generated Files

Never hand-edit `apps/*/client.ts`, `apps/*/server.ts`, `*/lib/cnst.ts`, `*/lib/db.ts`, `*/lib/dict.ts`, `*/lib/sig.ts`, `*/lib/srv.ts`, `*/lib/st.ts`, `*/lib/useClient.ts`, `*/lib/useServer.ts`, `*/lib/**/index.ts`, `*/ui/index.ts`, `*/webkit/index.ts`, `*/srvkit/index.ts`, `*/common/index.ts`. When one is stale or broken, fix the
owning source file and run `akan sync <app-or-lib>` or `akan repair generated`.
<!-- akan:agent:end -->
