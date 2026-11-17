---
"akanjs": minor
"@akanjs/devkit": minor
---

A page loads less of the framework's own UI code: the icons its files name rather than whole `react-icons` sets, no agent library unless it has an agent, no spring library for a dialog, and the gesture library only when a sheet is first pressed. This applies to every app, under `clientRuntime: "all"`, the default, and `"route"` alike; what a page shows and how it behaves do not change.

- **Icons.** A production browser build rewrites each named import from a `react-icons/<set>` package to a module of the importing file's own, written to the app's `.akan/generated/react-icons`, holding only the icons that file names. A name the set does not define as a plain icon, a namespace or default import, and a re-export keep the set. The server bundle keeps the set, and both draw the same markup. The development server already loaded icons per file. A page using few icons loads less; a page drawing many framework components can load a little more, since an icon that several of its files name is copied into each of their chunks.
- **Agent.** A server-rendered page no longer loads `use-agentic` for its page gate, so a page without an agent ships only the part of it that `akanjs/store` uses. `Agent.Chat`, `useAgent` and `SessionContext` work as before.
- **Dialog.** `Dialog.LegacyModal` loads the first time it renders, behind its own Suspense boundary, so `<Dialog>`, `Dialog.Modal` and `Modal` no longer load it or `@react-spring/web`. `Dialog.LegacyModal` remains a member of `Dialog`.
- **Drag to dismiss.** `BottomSheet`, `Dialog.Modal` and `Dialog.LegacyModal` load `@use-gesture/react` on the first press of their drag handle; the events that arrive while it loads are replayed into it, so the first drag, its flick speed and a tap land as a later one does.
- **Field.** `Field` is no longer one client module: each field kind is its own client reference, so a server component can render `Field.Text` and a page loads only the kinds it names.

**Upgrading.**

Nothing to do under either setting.
