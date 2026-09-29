---
"@akanjs/devkit": patch
---

The dev module registries load packages that used to take the whole vendor file down with them

- A module that reads `import.meta` (jotai's and zustand's ESM builds) no longer makes the vendor file a SyntaxError:
  `import.meta` is the module's own `{ url }`, as in a browser module, with no `env`, so an `import.meta.env` check
  branches as it does in the ESM bundle. `import.meta.url` is an http URL instead of this machine's `file://` path.
- A package esbuild already bundled (the `@mermaid-js/parser` chunks) keeps its own `__reExport` / `__toESM` helpers
  instead of stopping the registry build, and a package file's `#!` line no longer breaks its vendor file.
- A file the browser build tree-shook away (vfile, behind a side-effect-free barrel) resolves its imports with the
  browser condition, and a package `browser` field mapping a file or a module to `false` gives an empty module;
  neither reaches a Node built-in stub that throws at startup.
- Every module factory is parsed as a classic script before it is written. A package file that cannot be one (a
  top-level await, or anything else a script cannot hold) is left out and named in the dev log, and requiring it
  throws why, where it used to fail the whole registry or drop every module of its vendor file in the browser; app
  code that cannot be one still fails the build. A registry built before this rebuilds once.
