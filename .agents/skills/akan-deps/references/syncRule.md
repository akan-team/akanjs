<!-- akan:generated -->

# Sync Rule — What `akan sync` Accepts, Generates And Owns

The layout `akan sync` holds an app or lib to, the files it writes, and the `package.json` fields it keeps. The
`app` rule carries the refusals a hand edit meets first; this is the full list behind them.

## Root Allowlists

- App root files: `AGENTS.md`, `CLAUDE.md`, `akan.app.json`, `akan.baseline.json`, `akan.budget.json`,
  `akan.config.ts`, `client.ts`, `main.ts`, `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`;
  folders: `.akan`, `common`, `env`, `lib`, `native`, `page`, `plugin`, `private`, `public`, `script`, `secrets`,
  `srvkit`, `ui`, `webkit`. A Capacitor-era `ios` / `android` / `mobile` folder or `capacitor.config.*` in an app root
  is refused as a leftover (native projects live under `dist/native/<app>/<target>`).
- Lib root files: `AGENTS.md`, `CLAUDE.md`, `README.md`, `akan.baseline.json`, `akan.config.ts`, `akan.lib.json`,
  `client.ts`, `index.ts`, `package.json`, `server.ts`, `tsconfig.json`, `tsconfig.spec.json`, `tsconfig.tsbuildinfo`;
  folders: the app's minus `.akan`, `secrets` (no `main.ts` either — a lib is never booted). A lib's `script/` is
  asset tooling nothing runs or ships (`private/` ships in every image); a `script/migration` there is refused.
- The allowlists' one source is `pkgs/@akanjs/devkit/workspace/workspaceLayout.ts`, read by `akan sync` (error),
  `akan doctor` and `akan quality scan` — `workspaceLayout.test.ts` holds this list to it.
- `apps/<app>/AGENTS.md` / `libs/<lib>/AGENTS.md` carry a generated `## Recipes In Scope` block between the
  `akan:agent` markers — never hand-edit it (outside the markers is yours); `akan lint` fails when it is stale.
- `plugin/<name>.plugin.ts` declares an Akan plugin. No `apps/*/base` or `libs/*/base` — use `common/`.

## `lib/` And Module Files

- `lib/` root holds only `cnst.ts`, `db.ts`, `dict.ts`, `option.ts`, `sig.ts`, `srv.ts`, `st.ts`, `useClient.ts`,
  `usePage.ts`, `useServer.ts` — no hand-written file or test.
- `lib/__lib/` and `lib/__client/` (each module's client runtime piece) are generated; never hand-edit them.
- Modules are `lib/<model>`, `lib/_<service>`, `lib/__scalar/<scalar>`; their UI files are
  `<Model>.Template|Unit|Util|View|Zone.tsx`, `<Service>.Util|Zone.tsx`, `<Scalar>.Template|Unit.tsx`. A test is
  named after the one file it covers, so `<model>.<topic>.signal.test.ts` is refused like `<model>.<topic>.signal.ts`.
  Sync removes, and names, a module folder left with only its generated `index.ts` (a merge moved its sources away).

## Generated Barrels

- `ui/`, `webkit/`, `srvkit/`, `common/`, `plugin/` and module `index.ts` barrels are generated
  (`export * from "./name";` per 1-depth entry, `export {};` when empty, so a stale one heals on sync;
  `akan create-library` starts `common/`, `srvkit/`, `webkit/`, `ui/` with that empty barrel) — never hand-edit or
  track them.
- **Never hand-write an `index.tsx` / `.jsx` / `.mts` at those roots**: Bun resolves it before the generated
  `index.ts`, so new exports are `undefined` at runtime (`akan sync` refuses it, `akan doctor` reports
  `facet-index-shadowed`); a namespace belongs in `ui/<Folder>/index.tsx`.
- Sync writes barrels, module indexes and `akan.*.json` exactly as Biome prints them (`akan lint --no-fix` passes
  right after a sync), so a lint diff in one is a generator bug — fix the generator.

## `package.json` Dependencies

- **`akan sync` owns package.json `dependencies`**: it adds imports at the root's version, realigns root-declared
  entries, and drops unimported ones (logged); undeclared-at-root entries are kept with a warning.
- Keep a package no TS file imports (a CSS `@plugin`, a runtime-only package) with `akan.keepDependencies`;
  `externalLibs` and `trustedDependencies` always stay; devDependencies are realigned, never pruned.
- `akan install-library` lets the root win — it adds only what the root lacks and warns when the lib wants a newer
  version.
