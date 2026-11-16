---
"@akanjs/cli": minor
"@akanjs/devkit": minor
"@akanjs/language": patch
---

`akan sync` writes one more generated file in every app and lib, `lib/page.ts`: the page runtime (`usePage`, `msg`, `Err`) and the tab's one fetch client, built with no endpoint descriptor, constant or store. `lib/useClient.ts` keeps its name and its exports and applies the scope's descriptors onto that client, and `client.ts` exports `usePage`, `msg` and `Err` from `lib/page`. This prepares loading a model's descriptors and store only on the routes whose client code imports them; for now every route loads what it loaded before.

- A client module that imports only `usePage`, `msg` or `Err` from an app or lib `client` barrel is rewritten to import `lib/page` alone, not the barrel's descriptors and stores. A module that imports anything else from the barrel keeps both, as before. Each client entry still imports the app's whole client runtime, so no page loads less yet.
- A server render keeps using the live server `fetch` of `lib/sig.ts`: the server bundle hands it to `lib/page.ts` as its client.
- A workspace whose generated files predate `lib/page.ts` builds as before until it is synced.
- `lib/page.ts` is listed with the other generated files: in the lib root allowlist, the agent guide, the agent hook that stops hand edits, the Biome overrides, the code graph, and the `.gitignore` of a new workspace.

**Upgrading.**

Nothing to change in app code. Run `akan sync` once after upgrading, and add `apps/*/lib/page.ts` and `libs/*/lib/page.ts` to your `.gitignore` beside `lib/useClient.ts` so the new file is not committed.
