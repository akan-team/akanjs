---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(dev): a server-only save keeps SSR output current, a moved file keeps the registry whole, and a broken module recovers on its fix

- A backend restarted by a server-only save (`*.service.ts`, `srvkit/**`) renders from the latest pages build instead
  of the one it booted with, so a client edit saved before it no longer disappears until the next server edit.
- Moving or renaming a file a client module imports (`Foo.tsx` to `Foo/index.tsx`, `.ts` to `.tsx`) compiles its
  importers again, against the files on disk now: new tabs no longer stop hydrating until the builder restarts. The
  first patch after a builder reload that adds a module is made in the builder instead of in a build worker.
- A client module whose top level threw recovers with the save that fixes it: the tab reloads onto the fix instead of
  keeping the error until a manual refresh. A tab that booted beside the vendor file of the build before reloads onto
  the current pair, and a tab that missed a patch while the dev server was unreachable catches up when it reconnects.
- A save during a navigation no longer discards the build of a route it did not touch; only a route build that
  reached a file the save changed runs again.
- A replacement builder continues the save count, so fixing an error after the builder was recycled clears its
  overlay, and a fixed barrel error is no longer shown again to every new tab.
- `akan start` shows an app as ready, and `--open` opens it, as soon as it serves; only the next boot wave waits for
  the app's boot builds, CSR's included when `AKAN_DEV_CSR_REBUILD=1` arms it.
- A registry build that fails on the user's code is retried by the save that fixes it rather than by every route
  build, and one whose build worker was killed is retried at most every 10 seconds. With `AKAN_DEV_CSR_PATCHER=off`,
  a route build no longer rebuilds a registry that already holds its entries.
