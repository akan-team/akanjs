---
"@akanjs/cli": minor
"@akanjs/devkit": minor
"@akanjs/language": patch
---

`akan sync` splits each app's and lib's client runtime into one generated piece per module under `lib/__client/`: `<module>.fetch.ts` applies that module's endpoint descriptors onto the tab's fetch client, `<module>.st.ts` registers and builds that module's store, and `_base.fetch.ts` applies the descriptors the scope inherits from its libs. `lib/useClient.ts` imports every fetch piece and `lib/st.ts` every store piece, so both keep their exports and every route loads what it loaded before. This prepares loading a model's descriptors and store only on the routes that use them.

- `lib/sig.ts` exports one more macro, `getSerializedSignalOf(name)`, which answers the descriptors one module (or one inherited lib) brings, in the order of the scope's whole signal.
- `lib/usePage.ts` exports a typed `st` handle without importing `lib/st.ts`.
- `lib/__lib/lib.store.ts` imports each extended lib store from its own file instead of the lib's `client` barrel.
- A server render reads each piece's descriptors from the live server signal, as it did for `lib/useClient.ts`.
- `akan sync` removes the pieces of a module that was deleted or renamed.
- `lib/__client/` is listed with the other generated files: in the agent guide, the agent hook that stops hand edits, the Biome overrides, the code graph, and the `.gitignore` of a new workspace.

**Upgrading.**

Nothing to change in app code. Run `akan sync` once after upgrading, and add `apps/**/lib/__client` and `libs/**/lib/__client` to your `.gitignore` beside `lib/__lib` so the new pieces are not committed.
