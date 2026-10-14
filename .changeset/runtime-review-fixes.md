---
"akanjs": patch
---

Runtime fixes:

- **A disabled module takes its relations with it.** A module whose model relates to a module that `enabled: false`, `disableModules`, `disableLibs` or an operation mode left out is not mounted either, where it used to mount and answer 500 for every response that resolved the relation.
- **An untyped queue backoff waits.** `backoff: { delay }` without a `type` now waits its delay on bullmq too, as it did on SolidQueue; bullmq used to throw, and with this branch's backoff cap it retried at once.
- **Fonts in `public/`** are served with `Access-Control-Allow-Origin: *`, so an app's `@font-face` loads in an MCP App view.
- **Router:**
  - A basePath is stripped only on a segment boundary: under basePath `office`, `/officers` stays `/officers`.
  - `canGoBack()`, `backOrFallback`, `Link.Back` and the Android back button take the fallback where going back would do nothing, such as the first screen after a reload.
  - `back()` with nothing to go back to no longer posts a `pathChange`.
- **BottomSheet:**
  - A closed sheet is hidden, so Tab no longer reaches its controls.
  - A controlled sheet whose parent keeps `open` springs back after a drag-dismiss.
  - On a page that is not current in a native page stack, the sheet hides and gives up Escape and the scroll lock until its page is current again.
- **WebSocket client:**
  - The reconnect count resets only after a socket stayed up 5 seconds, so a gateway that accepts and drops every upgrade reaches `maxAttempts`.
  - Going online or making the tab visible reconnects at once.

Upgrade note: a module that relates to a module you disable is now left out as well. The `verbose` log names it ("relates to disabled module …"); disable it on purpose, or keep the related module enabled.
