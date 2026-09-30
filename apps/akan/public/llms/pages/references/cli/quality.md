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

Quality CLI

Lint tells you a line is wrong. `akan quality` tells you the shape of the codebase is drifting: none of it is a syntax error, and none of it shows until someone measures.

What It Catches

- Files Grown Too Long — A service past 500 lines, a Template or Zone past 800, or a Util past 1,000. — `akan.file.recommended-max-lines`

- Helpers In The Wrong File — A helper function declared in `order.service.ts` next to `OrderService`. — `akan.convention.service`

- Modules With No Server View — Its UI renders only from Template, Zone and Util, so all of it ships to the browser as JavaScript. — `akan.ssr.module-missing-server-view`

- Markup In The Bundle — A client component wraps a large static subtree around one or two handlers. — `akan.ssr.client-static-markup`

Run it before a review, after a refactor, and after any change to a `.tsx` file. The render share is the one number a UI change can quietly lower.

Words Used On This Page

Term

- rule: One check, named `akan.<scope>.<name>`; every warning names the rule that raised it.

- scope: The group a rule belongs to; there are six, and the output is sorted by scope name.

- server render share: Of the JSX elements in `ui/` and `lib/`, the percentage that renders on the server.

`akan quality [action] [--format <text|json>]`

Scan every app and library for code quality warnings, or measure the server/client render balance.`scan` (default) prints every warning, then the SSR balance and the suggested rules.`ssr` prints the SSR balance first, then only the warnings whose scope is `ssr`.

- action (String, default scan, scan | ssr): Which report to print: `scan` covers everything, `ssr` the render balance alone.

- --format (String, default text, text | json): Short form `-f`; `json` prints the whole result for tools, each warning's `fix` included.

- where to run: The workspace root, the folder holding `package.json`, `tsconfig.json` and `.env`.

- what is read: `.ts` and `.tsx` under `apps/` and `libs/` except `.d.ts`, plus every `*.abstract.md`.

- what is skipped: Paths matched by the root `.gitignore`, plus `node_modules` and `.git`.

- exit code: Success whatever it finds, so it runs beside lint and typecheck without becoming a third gate.

What Scan Reports

Each warning says where, which rule, what is wrong and how to fix it. After the warnings come the SSR balance and the suggested rules, so one plain `akan quality` run covers both. A shortened run looks like this:

**One line per warning:** `<file>:<line>:1 - warning <rule>: <message>`. A `global` warning has no single file, so it prints `<global>` instead.

**Indented lines add detail.** `note: related location` lists each place involved, and `fix:` says what to change.

**Sorted by scope name,** then by file and line, so the scopes below appear in this order.

**Only need the render balance?** `akan quality ssr` prints it first and keeps only the `ssr` warnings.

The Six Scopes

- agent: Form fields that publish no agent tool because their setter is wrapped.

- convention: A module file declaring what its role does not allow, such as a helper in `.service.ts`.

- file: Per-file hygiene: length, scaffold leftovers, globals, component-file exports, `//!` markers.

- global: The same exported name, or the same function body, in more than one file.

- layout: Files and folders outside the allowed app, library and module layout.

- ssr: The six render-balance rules, and the only scope `akan quality ssr` keeps.

With --format json

The JSON result has five fields. `akan quality ssr --format json` has the same shape, with `warnings` narrowed to scope `ssr`.

Field

- workspaceRoot: Absolute path of the workspace that was scanned.

- scannedFiles: How many files were read.

- warnings: `rule`, `scope`, `severity`, `message` and `fix`, plus `file`, `line` and `locations` when known.

- ssrBalance: One entry per row of the balance: `scope`, `serverMass`, `clientMass`, `serverShare` (0 to 1).

- suggestedRules: The suggested rules that close the text output, as strings.

Rules By Scope

Look up a rule id from the output here. Rules that share a cause share a row.

Rule

Fires when

- akan.agent.unpublished-form-setter: An arrow handler taking a value calls `st.do.set…On…`, so that field publishes no agent tool.

- akan.convention.<role>: A top-level declaration the module file does not allow; the table below lists what it does.

- akan.file.recommended-max-lines, akan.file.max-lines: Over 500 lines for a service, 800 for a Template or Zone, 1,000 for a Util, 2,000 for any file.

- akan.file.abstract-max-lines: An `*.abstract.md` is over 300 lines; keep only what the code cannot show.

- akan.file.class-export-global-declaration: A file that exports a class declares something else at top level, other than `<Class>Options`.

- akan.file.component-export, akan.file.component-internal-declaration: A component file exports a non-component, or keeps a local type or function besides `<X>Props`.

- akan.file.bang-comment-in-client: A `//!` or `/*!` marker in browser code, which survives minification; write `// FIXME:`.

- akan.file.placeholder-export: An `index.ts` exports a scaffold placeholder such as `aa`, `dumb` or `someCommonLogic`.

- akan.file.dictionary-stale-text: A dictionary still holds scaffold text such as `Order description`.

- akan.file.global-declaration, akan.file.window-augmentation, akan.file.prototype-mutation: A `declare global`, a `Window` interface or a `.prototype.` write; isolate it in one low-level file.

- akan.global.duplicate-exported-function-name: Two files export a function or class with the same name.

- akan.global.duplicate-exported-function-body: Exports with different names share one body; extract a single helper.

- akan.layout.app-root-file, akan.layout.app-root-folder, akan.layout.lib-root-file, akan.layout.lib-root-folder: A file or folder at an app or library root that is not on the allowed list.

- akan.layout.lib-facet-file: A file directly in `lib/` other than `cnst.ts`, `option.ts` and the other support files.

- akan.layout.module-ui-file: A `.tsx` in a module folder whose name is not an allowed role, such as `OrderCard.tsx`.

- akan.ssr.*: The six render-balance rules, listed in the next section.

What Each Module File May Declare

`akan.convention.<role>` fires on any top-level declaration outside this list. Shown for a model named `Order`:

File

Allowed at top level

- order.constant.ts: `OrderInput`, `OrderObject`, `LightOrder`, `Order`, `OrderInsight`, and `enumOf` classes

- order.dictionary.ts: `export const dictionary`

- order.document.ts: `OrderFilter`, `Order`, `OrderModel`

- order.service.ts: `OrderService`

- order.signal.ts: `OrderInternal`, `OrderSlice`, `OrderEndpoint`

- order.store.ts: `OrderStore`

What The Duplicate Checks Skip

**Expected name repeats are exempt.** Files in `ui/` and `page/`, and module files, may reuse a name. An `enumOf` class in a `.constant.ts` may not.

**Short bodies are not compared.** A body counts as a duplicate only at 80 characters or more, with whitespace collapsed.

Server Render Share

The share is the part of your component JSX that renders on the server. Treat 50% as the floor and a falling share as a regression.

If a change moved markup to the client, say why in the PR or move it back.

How It Is Counted

**Elements, not files.** Each JSX tag, opening or self-closing, counts as one element.

**The directive picks the side.** Every element in a file that starts with `"use client"` counts as client; all others count as server.

**One row per app and library,** plus a `workspace` total when there are two or more.

**A row under 50%** ends with `<- below the 50% target`.

`akan quality ssr` prints the share first, then only the `ssr` warnings:

**Only `ui/` and `lib/` are measured.** The share and the six rules read `.tsx` files under `apps|libs/*/ui/` and `apps|libs/*/lib/`, minus tests. `page/`, `webkit/`, `srvkit/` and `common/` are left out, so a route file never moves the number, and neither does a `"use client"` added there.

The Six ssr Rules

- akan.ssr.unnecessary-use-client: The file has `"use client"` but no hook, event handler, store or browser API; delete it.

- akan.ssr.client-static-component: A component in a client file renders 4+ JSX elements with no client-only capability.

- akan.ssr.client-static-markup: 10+ elements wrap only one or two interactive touches; the static part belongs on the server.

- akan.ssr.client-mount-load: A `useEffect(…, [])` calls `fetch.*` or a loading `st.do.*` action; the route could load it first.

- akan.ssr.module-missing-server-view: A module's client files render 12+ elements and it has no server `Unit` or `View`.

- akan.ssr.template-client-state: A `.Template.tsx` calls `useState`, but a Template keeps its form state in the store.

Not Flagged On Purpose

**Third-party code.** A file importing a package, `st` or `fetch` is never told to drop `"use client"`, and a component that renders a package's component is skipped.

**A directive required by role.** A module's `Zone`, `Template` and `Util`, and an `index_.tsx` `lazy()` boundary, are never an unnecessary `"use client"`.

**Loads the user starts.** A fetch inside `onClick`, or an effect with dependencies, is not a mount-time load.

**Service and scalar modules.** Folders starting with `_` under `lib/` are never asked for a `Unit` or `View`.

Related Pages

Architecture · Frontend

Each ssr rule with the code that triggers it and the fix that clears it.

Formats and lints one app, library or package with Biome.

Typechecks one app with TypeScript.

## Code Examples

### quality

```bash
akan quality
akan quality scan
akan quality ssr
akan quality ssr --format json
```

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

