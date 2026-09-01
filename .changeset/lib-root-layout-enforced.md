---
"@akanjs/devkit": patch
"@akanjs/cli": patch
"akanjs": patch
---

fix(sync): hold libraries to the root layout allowlist, and check a library's own `page/` tree

`apps/<app>/base` was refused by `akan sync`, `akan doctor` and `akan quality scan`; `libs/<lib>/base` passed all
three. The rule lives in one file — `workspaceLayout.ts` exists precisely so the three tiers cannot disagree — but
the call sites read it behind `exec.type === "app"` / `for (const app of context.apps)` / `segments[0] === "apps"`,
so a library root was never compared to anything at all. A lib could carry a `base/`, a `helper.ts`, a stray
`script/`, and every command stayed green.

Libraries now answer to their own allowlist, and it is the app's minus what only an app can use: no `main.ts`, no
`capacitor.config.ts`, no `.akan` / `android` / `ios` / `mobile` / `script` / `secrets`, because a library is never
booted or packaged. `index.ts`, `README.md` and `tsconfig.spec.json` are added, since a library ships as a package.
`public/` and `private/` stay, because `syncAssets` symlinks them into each consuming app.

Three more places the same gate was one-sided:

- `akan doctor` walked `context.apps` only. It now walks libraries too and reports `lib-root-unknown-entry` beside
  the existing `app-root-unknown-entry`.
- `akan quality scan` warned on an unexpected app root *file* and nothing else — not a library root file, and not a
  root *folder* on either side, which is the shape `base/` actually takes. It now reports all four
  (`akan.layout.{app,lib}-root-{file,folder}`). Its `lib/` facet rule kept its own copy of the allowlist and flagged
  a `<model>.signal.test.ts` that `akan sync` explicitly permits; both now read the shared helper, and the rule is
  renamed `akan.layout.lib-facet-file` so its name no longer collides with the library root it was never about.
- A library's `page/` folder was validated only once an app opted into it with `syncPageLibs`. An app checks route
  filenames in `getPageKeys`, which a library has no equivalent of, so `libs/<lib>/page/Component.tsx` synced clean
  in the library it belongs to and failed in somebody else's app. `akan sync <lib>` now reports it as a scan
  violation, from the same rule `validatePageSourceFile` throws — split out as `getPageSourceFileViolation` so the
  reason is available where throwing is the wrong answer.
