---
"@akanjs/devkit": patch
---

A page's client code no longer carries every module's UI. Each `"use client"` entry of a route, every generated root layout and the SSR dev registry now start with `import "@apps/<app>/lib/useClient"` and `import "@apps/<app>/lib/st"` (the client runtime and the store), instead of a bare `import "@apps/<app>/client"`. Nothing names an export on a bare import, so the barrel rewrite could not narrow it, and the barrel re-exports each module's `Template`, `Unit`, `Util`, `View` and `Zone`.

- On `apps/minimal`, a route that renders only `Link` ships 53.1K raw / 17.2K br of route code in a production build, down from 226.6K / 67.1K. The saving grows with the number of modules that have UI.
- A grouped root layout with no `page/_layout.tsx` above it imported the whole barrel too, so every module's client components became client entries of every route under it. It now runs the same bootstrap.
- A module UI file now runs only on the pages that import it. A module `Template`, `Unit`, `Util`, `View` or `Zone` file whose top level registers something, or writes to a global, has to be imported where that side effect is needed. Generated module `index.ts` files only collect namespaces, so they are unaffected.
