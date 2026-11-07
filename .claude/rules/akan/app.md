---
description: Akan app and library code: the lint gates, sync allowlists and the warts not to copy.
paths:
  - "apps/**"
  - "libs/**"
---

<!-- akan:generated -->

# Akan App And Library Code

## Rules Every File Obeys

`biome.json` extends `@akanjs/devkit/biome.base.json`, which scopes every grit plugin in `@akanjs/devkit/lint/`;
each plugin's header and diagnostic carry its full reasoning.

- **Never construct a raw `Error`** (`no-throw-raw-error`). Throw `new Err("<module>.error.<key>")` with the key
  registered as `[en, ko]` in the module dictionary's `.error({})` — imported from `"../dict"` on the server, from
  `"@libs/<lib>/client"` / `"@apps/<app>/client"` in UI. A `throw` is an error; a raw `Error` rejected, returned or
  stored loses the key and status too (a warning for now). Exempt: tests, `*.constant.ts`, a root `native/` folder
  (plugins throw `AkanNativeError`), `script/migration/**` (an operator reads its message), and `common/**` / `env/**`,
  which have no legal `Err` import — keep throwing code out of them.
- **Never import a third-party package** (`no-import-external-library`) from `page/**`, any barrel, a module logic file
  (`*.{constant,dictionary,document,service,signal,store}.ts`) or module component
  (`*.{Template,Unit,Util,View,Zone}.tsx`) — re-export it through a lib first (one-line shims in a lib's `common/`,
  `webkit/`, `ui/` are load-bearing). `*.signal.test.ts` / `*.service.test.ts` too, though they may import `node:*` and
  `bun:*` (`no-import-external-library-in-test`).
- **No `console.log` / `console.debug`** (`noConsole`; only `assert`, `error`, `info`, `warn`; server code uses
  `this.logger` or `new Logger("ClassName")`), and **never `logger.log()` / `Logger.log()`** (`no-deprecated-log-level`)
  — it emits at `info` while reading like its own level; write `.info()`. The ladder is
  `trace verbose debug info warn error`.
- **Never touch `document.cookie`, `localStorage` or `sessionStorage`** (`no-document-cookie`, `no-web-storage`) — a
  native shell's page keeps no cookies on iOS, macOS and Linux, and Web Storage throws during SSR. Use `getCookie` /
  `setCookie` / `removeCookie`, `storage`, `secretStorage` from `akanjs/client`. Browser APIs a WebView lacks
  (`navigator.share`, `serviceWorker`, `Notification`, `geolocation`, `vibrate`) live in a `webkit/` hook behind
  `isNativeApp()` (`no-web-only-api-outside-webkit`, a warning). Both in full: `runtimeRule`.
- **No deep imports past a barrel** (`no-deep-internal-import`), except cross-module constants (`../map/map.constant`).
- **Suppress a grit diagnostic as `lint/plugin`** (`// biome-ignore lint/plugin: <reason>`,
  `// biome-ignore-all lint/plugin: <reason>`); bare `plugin:` does nothing. `pkgs/` is out of scope.
- **`biome.json` is strict JSON** — a comment breaks config resolution without an error (Biome falls back to
  discovery and aborts on a nested config); rename it `biome.jsonc` to document a disabled rule.
- **`akan lint` prints up to 200 diagnostics** (`--max-diagnostics <n>`, `0` = all); Biome's own uncounted 20 reads
  as progress when the mix merely changed.

## Akan Sync Conventions

- App root files: `AGENTS.md`, `CLAUDE.md`, `akan.app.json`, `akan.baseline.json`, `akan.config.ts`, `client.ts`,
  `main.ts`, `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`; folders: `.akan`, `common`, `env`,
  `lib`, `native`, `page`, `plugin`, `private`, `public`, `script`, `secrets`, `srvkit`, `ui`, `webkit`. A Capacitor-era
  `ios` / `android` / `mobile` folder or `capacitor.config.*` in an app root is refused as a leftover (native
  projects live under `dist/native/<app>/<target>`).
- Lib root files: `AGENTS.md`, `CLAUDE.md`, `README.md`, `akan.baseline.json`, `akan.config.ts`, `akan.lib.json`,
  `client.ts`, `index.ts`, `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.spec.json`, `tsconfig.tsbuildinfo`;
  folders: the app's minus `.akan`, `script`, `secrets` (no `main.ts` either — a lib is never booted).
- The allowlists' one source is `pkgs/@akanjs/devkit/workspaceLayout.ts`, read by `akan sync` (error), `akan doctor`
  and `akan quality scan` — add an entry there and mirror it here.
- `apps/<app>/AGENTS.md` / `libs/<lib>/AGENTS.md` carry a generated `## Recipes In Scope` block between the
  `akan:agent` markers — never hand-edit it (outside the markers is yours); `akan lint` fails when it is stale.
- `plugin/<name>.plugin.ts` declares an Akan plugin. No `apps/*/base` or `libs/*/base` — use `common/`.
- `lib/` root holds only `cnst.ts`, `db.ts`, `dict.ts`, `option.ts`, `sig.ts`, `srv.ts`, `st.ts`, `useClient.ts`,
  `useServer.ts` — no hand-written file or test.
- Modules are `lib/<model>`, `lib/_<service>`, `lib/__scalar/<scalar>`; their UI files are
  `<Model>.Template|Unit|Util|View|Zone.tsx`, `<Service>.Util|Zone.tsx`, `<Scalar>.Template|Unit.tsx`. A test is
  named after the one file it covers, so `<model>.<topic>.signal.test.ts` is refused like `<model>.<topic>.signal.ts`.
- `ui/`, `webkit/`, `srvkit/`, `common/`, `plugin/` and module `index.ts` barrels are generated
  (`export * from "./name";` per 1-depth entry, `export {};` when empty, so a stale one heals on sync;
  `akan create-library` starts `common/`, `srvkit/`, `webkit/`, `ui/` with that empty barrel) — never hand-edit or
  track them. **Never hand-write an
  `index.tsx` / `.jsx` / `.mts` at those roots**: Bun resolves it before the generated `index.ts`, so new exports are
  `undefined` at runtime (`akan sync` refuses it, `akan doctor` reports `facet-index-shadowed`); a namespace belongs
  in `ui/<Folder>/index.tsx`.
- Sync writes barrels, module indexes and `akan.*.json` exactly as Biome prints them (`akan lint --no-fix` passes
  right after a sync), so a lint diff in one is a generator bug — fix the generator.
- **`akan sync` owns package.json `dependencies`**: it adds imports at the root's version, realigns root-declared
  entries, and drops unimported ones (logged); undeclared-at-root entries are kept with a warning. Keep a package no
  TS file imports (a CSS `@plugin`, a runtime-only package) with `akan.keepDependencies`; `externalLibs` and
  `trustedDependencies` always stay; devDependencies are realigned, never pruned. `akan install-library` lets the
  root win — it adds only what the root lacks and warns when the lib wants a newer version.

## Present In The Code — Do Not Imitate

Warts in older files — never copy them; when two shapes disagree, follow the newer neighbour: `children: any`
(use `ReactNode`); hard-coded API keys or secrets (they belong in `option.ts` or env); large commented-out blocks;
stale `// TODO: Implement …` above implemented methods; `{cond && <X/>}`, hard-coded Korean bypassing `l()`,
`window.alert(...)`; bare `/* eslint-disable */` blocks; raw palette grays like `text-gray-400`. A store reaching
another through `(this as unknown as RootStore)` is **not** a wart — it is the sanctioned way.
