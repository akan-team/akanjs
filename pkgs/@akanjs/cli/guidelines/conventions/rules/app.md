---
description: Akan app and library code: the lint gates, what sync refuses and the warts not to copy.
paths:
  - "{apps,libs}/**"
---

# Akan App And Library Code

## Rules Every File Obeys

The root guide's "Rules That Break The Build" names each check and its fix; this adds only what it leaves out.
`biome.json` extends `@akanjs/devkit/biome.base.json`, which scopes every grit plugin in `@akanjs/devkit/lint/`;
each plugin's diagnostic carries its reasoning.

- **`Err` is imported from `"../dict"`** on the server and from `"@libs/<lib>/client"` / `"@apps/<app>/client"` in
  UI, its key registered as `[en, ko]`; `import type` of `akanjs/common`'s stays legal, to annotate a caught `Err`.
  A raw `Error` rejected, returned or stored loses the key and status too (a warning for now).
  `no-throw-raw-error` exempts tests, `*.constant.ts`, a root `native/` folder (plugins throw `AkanNativeError`),
  `script/migration/**` (an operator reads its message), and `common/**` / `env/**`, which have no legal `Err`
  import — keep throwing code out of them.
- **The third-party import ban** covers `page/**`, any barrel, a module logic file
  (`*.{constant,dictionary,document,service,signal,store}.ts`) and a module component
  (`*.{Template,Unit,Util,View,Zone}.tsx`). `*.signal.test.ts` / `*.service.test.ts` too, though they may import
  `node:*` and `bun:*` (`no-import-external-library-in-test`).
- Server code logs through `this.logger` or `new Logger("ClassName")`, on the ladder
  `trace verbose debug info warn error`; `console` keeps `assert`, `error`, `info`, `warn`.
- Browser APIs a WebView lacks (`navigator.share`, `serviceWorker`, `Notification`, `geolocation`, `vibrate`) live
  in a `webkit/` hook behind `isNativeApp()` (`no-web-only-api-outside-webkit`, a warning). In full: `runtimeRule`.
- **No deep imports past a barrel** (`no-deep-internal-import`), except cross-module constants (`../map/map.constant`).

## What `akan sync` Refuses And Owns

The root allowlists, module file names, and everything sync generates or keeps: `syncRule`, a reference of the
`akan-deps` skill.

- Sync refuses a file or folder its root allowlist lacks, a hand-written file or test in `lib/`'s root, and a
  module file named off the pattern (`<model>.<topic>.signal.ts`). No `apps/*/base` or `libs/*/base` — use `common/`.
- `ui/`, `webkit/`, `srvkit/`, `common/`, `plugin/` and module `index.ts` barrels, `lib/__lib/` and `lib/__client/`
  are generated — never hand-edit or track them. **Never hand-write an `index.tsx` / `.jsx` / `.mts` at those
  roots**: Bun resolves it before the generated `index.ts`, so new exports are `undefined` at runtime; a namespace
  belongs in `ui/<Folder>/index.tsx`.
- **`akan sync` owns package.json `dependencies`**: it adds what a file imports and drops what none does (logged).
  Keep a package no TS file imports (a CSS `@plugin`, a runtime-only package) with `akan.keepDependencies`.

## Present In The Code — Do Not Imitate

Warts in older files — never copy them; when two shapes disagree, follow the newer neighbour: `children: any`
(use `ReactNode`); hard-coded API keys or secrets (they belong in `option.ts` or env); large commented-out blocks;
stale `// TODO: Implement …` above implemented methods; `{cond && <X/>}`, hard-coded Korean bypassing `l()`,
`window.alert(...)`; bare `/* eslint-disable */` blocks; raw palette grays like `text-gray-400`.
