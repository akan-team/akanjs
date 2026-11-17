---
"akanjs": patch
"@akanjs/cli": minor
"@akanjs/devkit": minor
"@akanjs/language": patch
---

`akan sync` also writes each app's and lib's client runtime as one generated piece per module under `lib/__client/`, ready for a later release that loads a model's endpoint descriptors and store only on the routes that use them. Nothing imports the pieces yet: `lib/useClient.ts`, `lib/st.ts` and `lib/usePage.ts` are unchanged, and every route loads exactly what it loaded before.

- `<module>.fetch.ts` applies that module's endpoint descriptors onto the tab's fetch client, after the same module's piece of each lib it extends; `_base.fetch.ts` applies the descriptors every scope inherits from `akanjs/signal` itself.
- `<module>.st.ts` registers and builds that module's store alone, after the extended lib store's own piece.
- `_useClient.ts` imports every fetch piece of the scope and its libs and exports what `lib/useClient.ts` exports; `_st.ts` imports every store piece and exports `st`, `RootStore` and each store, as `lib/st.ts` does.
- `lib/sig.ts` exports one more build-time macro, `getSerializedSignalOf(name)`, which answers the descriptors one module brings, or with `"base"` the ones from `akanjs/signal`.
- `lib/__lib/lib.store.ts` imports each extended lib store from its own file instead of the lib's `client` barrel, and registers it when the lib's runtime has not yet, so an app store file imported on its own still has the lib store's actions.
- A server render reads a fetch piece's descriptors from the live server signal, as it does for `lib/useClient.ts`.
- `akan sync` removes the pieces of a module that was deleted or renamed.
- Adding a store root to a running store does work in proportion to the keys that root brings, not to every key already in the store, so building one root per module stays linear. A computed key that a later root adds now starts from the state as it is, so with a lib store's `count: 1` in place, an app store overriding `count: 10` and adding `tripled = computed(["count"], …)` starts at `tripled: 3` rather than 30.
- `lib/__client/` is listed with the other generated files: in the agent guide, the agent hook that stops hand edits, the Biome overrides, the code graph, and the `.gitignore` of a new workspace.

**Upgrading.**

Nothing to change in app code. The `.gitignore` lines for the new files are in the upgrade note of the entry that makes every app load per route.
