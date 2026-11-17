---
"@akanjs/devkit": patch
---

Two readings that kept a whole app's routes on every model's runtime are gone, so those routes load per module again.

- A server file that takes `fetch` from the server barrel (`../useServer`, `@apps/<app>/server`) and only calls endpoints no longer counts every model on every route because some other line says `slice`, such as `ips.slice(0, 1)` on an array. The build now reads what the file does with `fetch` itself: `fetch.init<Model>`, `view<Model>`, `edit<Model>`, their `get` forms and `fetch.slice` still count every model, and so does a `fetch` that is indexed, passed on or taken apart. In a real workspace one such service held all 38 routes of an app.
- A name `akanjs/ui` re-exports from the package it carries (`SessionContext`, `useAgent`, `AgentProvider`, `httpRunner` and the rest of the agent client) is imported from the file that declares it in an installed `akanjs` too. Installed, those names sit in a folder beside `ui/`, which the import narrowing did not follow, so one import of them pulled the whole `akanjs/ui` barrel and, with it, every model's runtime into the route. A workspace that links the framework source was not affected.
