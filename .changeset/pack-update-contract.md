---
"akanjs": patch
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan pack-update` records each pack in `<out>/pack.json`: app, target, platform, env, channel, app id and version, native API, web hash, file count and size. With `--against`, the record also carries the compatibility result. A pack that needs a new store build now exits 2 instead of 1, after writing `pack.json` and `compat.json`; any other failure exits 1 and leaves no `pack.json`. The same commit, env and target pack to the same bytes.

That last guarantee needed an akanjs fix. A library's generated `getSerializedSignal` macro read every signal any other client in the build process had applied, so whether a lib's chunk carried the app's whole registry depended on Bun's transpiler cache. The macro and `FetchClient.from()` now read `ownSerializedSignal`, the signals a client was built with. Merged signals no longer keep keys set to `undefined`. Run `akan sync` to regenerate `lib/sig.ts`.

Upgrade note: a CI step that took exit 1 from `akan pack-update --against` to mean "needs a new store build" checks for 2 now, since 1 is any other failure. Run `akan sync` once on every app and library, so its generated `lib/sig.ts` reads `ownSerializedSignal`.
