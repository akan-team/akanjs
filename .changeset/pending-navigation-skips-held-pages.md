---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

fix(akanjs): `usePendingNavigation()` and `pendingClassName` no longer report a page the browser already holds

A navigation to a page drawn before, or to one whose prefetch had already arrived, was reported as loading from the
press until the draw, a few frames in which an app's skeleton flashed over a page that needed no request. Such a
navigation is now never pending. One that asks the server is pending from the press, as before, and so is one whose
prefetch is still on its way.

**Upgrading.** Nothing to change. A workaround that remembers drawn paths to hold a skeleton back can be removed.
