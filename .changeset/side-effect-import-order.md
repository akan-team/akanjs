---
"@akanjs/devkit": patch
---

An MCP App view or CSR shell that draws `@lexical/code-prism` under a `lazy()` component no longer fails with `ReferenceError: Prism is not defined` (a host shows "The page failed to load."). These single-file bundles don't split, and Bun (1.4.4 included) runs a module that only an `import()` reaches with its ESM imports ahead of its CommonJS ones, whatever their order, so the Prism language files ran before the `prismjs` they extend. A vendor module's bare import of a module that may run late now goes through a shim that imports the same specifier, so it runs where it is written. ES module targets and packages that declare `sideEffects` are left to the bundler, so a bundle changes by the shims alone.
