# Quality

- Source: /references/cli/quality
- Mirror: /llms/pages/references/cli/quality.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Quality CLI (#quality-cli)
- What Scan Reports (#scan-scopes)
- Rules By Scope (#scan-rules)
- Server Render Share (#server-share)

## Content

Quality

Files Grown Too Long

A service past 500 lines, a Template or Zone past 800, or a Util past 1,000.

Helpers In The Wrong File

Modules With No Server View

Its UI renders only from Template, Zone and Util, so all of it ships to the browser as JavaScript.

Markup In The Bundle

A client component wraps a large static subtree around one or two handlers.

One check, named `akan.<scope>.<name>`; every warning names the rule that raised it.

The group a rule belongs to; there are six, and the output is sorted by scope name.

Of the JSX elements in `ui/` and `lib/`, the percentage that renders on the server.

`akan quality [action] [--format <text|json>]`

Which report to print: `scan` covers everything, `ssr` the render balance alone.

Short form `-f`; `json` prints the whole result for tools, each warning's `fix` included.

where to run

The workspace root, the folder holding `package.json`, `tsconfig.json` and `.env`.

what is read

`.ts` and `.tsx` under `apps/` and `libs/` except `.d.ts`, plus every `*.abstract.md`.

what is skipped

Paths matched by the root `.gitignore`, plus `node_modules` and `.git`.

exit code

Success whatever it finds, so it runs beside lint and typecheck without becoming a third gate.

Form fields that publish no agent tool because their setter is wrapped.

A module file declaring what its role does not allow, such as a helper in `.service.ts`.

Per-file hygiene: length, scaffold leftovers, globals, component-file exports, `//!` markers.

The same exported name, or the same function body, in more than one file.

Files and folders outside the allowed app, library and module layout.

The six render-balance rules, and the only scope `akan quality ssr` keeps.

Absolute path of the workspace that was scanned.

How many files were read.

`rule`, `scope`, `severity`, `message` and `fix`, plus `file`, `line` and `locations` when known.

One entry per row of the balance: `scope`, `serverMass`, `clientMass`, `serverShare` (0 to 1).

The suggested rules that close the text output, as strings.

An arrow handler taking a value calls `st.do.set…On…`, so that field publishes no agent tool.

A top-level declaration the module file does not allow; the table below lists what it does.

Over 500 lines for a service, 800 for a Template or Zone, 1,000 for a Util, 2,000 for any file.

An `*.abstract.md` is over 300 lines; keep only what the code cannot show.

A file that exports a class declares something else at top level, other than `<Class>Options`.

A component file exports a non-component, or keeps a local type or function besides `<X>Props`.

A `//!` or `/*!` marker in browser code, which survives minification; write `// FIXME:`.

An `index.ts` exports a scaffold placeholder such as `aa`, `dumb` or `someCommonLogic`.

A dictionary still holds scaffold text such as `Order description`.

A `declare global`, a `Window` interface or a `.prototype.` write; isolate it in one low-level file.

Two files export a function or class with the same name.

Exports with different names share one body; extract a single helper.

A file or folder at an app or library root that is not on the allowed list.

A file directly in `lib/` other than `cnst.ts`, `option.ts` and the other support files.

A `.tsx` in a module folder whose name is not an allowed role, such as `OrderCard.tsx`.

The six render-balance rules, listed in the next section.

`OrderInput`, `OrderObject`, `LightOrder`, `Order`, `OrderInsight`, and `enumOf` classes

The file has `"use client"` but no hook, event handler, store or browser API; delete it.

A component in a client file renders 4+ JSX elements with no client-only capability.

10+ elements wrap only one or two interactive touches; the static part belongs on the server.

A `useEffect(…, [])` calls `fetch.*` or a loading `st.do.*` action; the route could load it first.

A module's client files render 12+ elements and it has no server `Unit` or `View`.

A `.Template.tsx` calls `useState`, but a Template keeps its form state in the store.

Quality CLI

What It Catches

Words Used On This Page

Term

What Scan Reports

The Six Scopes

With --format json

Field

Rules By Scope

Look up a rule id from the output here. Rules that share a cause share a row.

Rule

Fires when

What Each Module File May Declare

File

Allowed at top level

What The Duplicate Checks Skip

Server Render Share

The share is the part of your component JSX that renders on the server. Treat 50% as the floor and a falling share as a regression.

If a change moved markup to the client, say why in the PR or move it back.

How It Is Counted

The Six ssr Rules

Not Flagged On Purpose

Related Pages

Architecture · Frontend

Each ssr rule with the code that triggers it and the fix that clears it.

Formats and lints one app, library or package with Biome.

Typechecks one app with TypeScript.

## Code Examples

### Terminal

```bash
$ akan quality

Akan Code Quality Scan
workspace: /home/me/acme
scanned files: 412
warnings: 3

Warnings:

apps/koyo/lib/order/Order.Zone.tsx:1:1 - warning akan.file.recommended-max-lines: File has 912 lines. Recommended limit for this file type is 800 lines.
  fix: Split the file by responsibility — move Zones, Utils, or subcomponents into sibling files.
apps/koyo/lib/order/OrderCard.tsx:1:1 - warning akan.layout.module-ui-file: Unexpected database module UI filename "OrderCard.tsx". Expected one of: Order.Template.tsx, Order.Unit.tsx, Order.Util.tsx, Order.View.tsx, Order.Zone.tsx.
  fix: Rename the file to an allowed module UI name, or move it to ui/ if it is not a module component.
apps/koyo/ui/OrderPanel.tsx:12:1 - warning akan.ssr.client-static-markup: Client component "OrderPanel" renders 16 JSX elements around only 1 client-only touch (onClick). Most of this subtree does not need the client bundle.
  fix: Keep the interactive element in the client component and hoist the static subtree into a server component, then accept it as `children` or render it through a Unit/View reference.

SSR balance (component files, JSX elements rendered per side):

  apps/koyo: 43% server (163 of 381 JSX elements, 218 client)  <- below the 50% target
  libs/shared: 62% server (460 of 742 JSX elements, 282 client)
  workspace: 55% server (623 of 1123 JSX elements, 500 client)

Suggested quality rules:

  - Keep generated scanSync index files out of hand-written changes; generated indexes should only contain one-depth export statements.
  - ...
```

### Terminal

```bash
$ akan quality ssr

Akan SSR Balance Scan
workspace: /home/me/acme
scanned files: 412
ssr warnings: 1

Server render share (component files, JSX elements rendered per side):

  apps/koyo: 43% server (163 of 381 JSX elements, 218 client)  <- below the 50% target
  libs/shared: 62% server (460 of 742 JSX elements, 282 client)
  workspace: 55% server (623 of 1123 JSX elements, 500 client)

Warnings:

apps/koyo/ui/OrderPanel.tsx:12:1 - warning akan.ssr.client-static-markup: Client component "OrderPanel" renders 16 JSX elements around only 1 client-only touch (onClick). Most of this subtree does not need the client bundle.
  fix: Keep the interactive element in the client component and hoist the static subtree into a server component, then accept it as `children` or render it through a Unit/View reference.
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

