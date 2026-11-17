---
"akanjs": minor
"@akanjs/devkit": minor
---

A page loads less of the framework's own UI code: the icons its files name rather than whole `react-icons` sets, no agent library unless it has an agent, no spring library for a dialog, and the gesture library only when a sheet is first pressed. This applies to every app, under `clientRuntime: "route"` and `"all"` alike; what a page shows and how it behaves do not change.

- **Icons.** A production browser build rewrites each named import from a `react-icons/<set>` package to a module written to the app's `.akan/generated/react-icons`, and each icon lives in exactly one such module: the naming file's own when one file names it, the app's shared module for that set when only the app's files name it, or the set's module shared with the workspace's libs and the framework when one of them names it too. A page loads each icon it uses once, and can carry the other icons of a shared module it touches, never more of a set than the whole set held. A name the set does not define as a plain icon, a namespace or default import, and a re-export keep the set. The server bundle keeps the set, and both draw the same markup. The development server already loaded icons per file.
- **Agent.** A server-rendered page no longer loads `use-agentic` for its page gate, so a page without an agent ships only the part of it that `akanjs/store` uses. `Agent.Chat`, `useAgent` and `SessionContext` work as before.
- **Dialog.** `Dialog.LegacyModal` loads the first time it renders, behind its own Suspense boundary, so `<Dialog>`, `Dialog.Modal` and `Modal` no longer load it or `@react-spring/web`. `Dialog.LegacyModal` remains a member of `Dialog`.
- **Drag to dismiss.** `BottomSheet`, `Dialog.Modal` and `Dialog.LegacyModal` load `@use-gesture/react` on the first press of their drag handle; the events that arrive while it loads are replayed into it, so the first drag, its flick speed and a tap land as a later one does.
- **Field.** `Field.Text` and `Field.TextArea` are memoized in their own file, so `Field`'s file only gathers its members: under `"route"` a page that names `Field.Text` loads that kind's file and not every kind, and a server component that names only members can render it. Under `"all"` `Field` stays one client module, as before.

**Upgrading.**

Nothing to do under either setting, with one change in timing: `Dialog.LegacyModal`, and the top-level `LegacyModal` that renders through it, load in a chunk of their own, with `@react-spring/web`, the first time they render. A legacy modal mounted only when it opens therefore shows its first open one chunk load later; it then springs in from transparent as a later open does, nothing is drawn in its place meanwhile, and the open is not lost. A test that expects its content in the first render must wait for it.
