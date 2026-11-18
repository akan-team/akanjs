---
"@akanjs/devkit": patch
---

`akan sync` lists an app's libs in one fixed order, and `akan.app.json` records the routes of the lib pages the same sync linked.

- **Libs are listed dependency first, by name where neither depends on the other.** The order came from which lib's scan finished first, so two syncs of an unchanged tree could rewrite the generated barrels (`lib/cnst.ts`, `lib/dict.ts`, `lib/sig.ts`, `lib/st.ts`, `client.ts`, `server.ts` and the rest) with the same libs in another order. A real workspace of nine libs had 58 generated files rewritten that way by the second sync of a clean checkout. `libDeps` in `akan.app.json` and `akan.lib.json` follows the same order.
- **`routes` in `akan.app.json` holds lib pages from the first sync.** With `syncPageLibs`, the manifest was written before the lib page folders were linked, so the first sync of a new checkout recorded the app's own routes only and a second sync added the rest.

**Expect one diff.** The first sync after this upgrade can reorder the lib imports and lists in generated files once, in every app and lib of a workspace. Nothing else in them changes, and a later sync leaves them alone.
