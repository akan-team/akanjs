---
"@akanjs/devkit": patch
---

A route's client code no longer carries the UI of every module in the app and in each lib its store merges.

- **Bootstrap.** Each route's `"use client"` entry, every generated root layout and the SSR dev registry start with `import "@apps/<app>/lib/useClient"` and `import "@apps/<app>/lib/st"`, which load the client runtime and the store. They used to import `@apps/<app>/client` bare, and that bundled the whole barrel.
- **Narrowed barrel imports.** A named import from an app or lib `client` barrel is still narrowed to the files that define the names. This includes `import { st } from "@apps/<app>/client"` in a component and the generated `import { RootStore as <lib> } from "@libs/<lib>/client"` in `lib/st.ts`.
  - What the rewrite keeps of the barrel is now the files that define its `usePage` and `st`, normally `lib/useClient` and `lib/st`. It used to keep a bare import of the barrel itself, which put every module's UI of the app and of each merged lib on every route.
  - A barrel that lacks either name keeps its bare import, as before. One that defines only one of them is not the generated shape, so what else it runs on import is unknown.
- **Namespace re-exports.** A name the barrel re-exports as a namespace (`export * as cnst`, `export * as store`) is now narrowed too. `import { cnst } from "@libs/<lib>/client"` becomes `import * as cnst from "@libs/<lib>/lib/cnst"`, where it used to load the whole barrel.
- **`akan start`.** The dev module registry narrows app and lib barrels the same way, so a page loads in dev the module UI it loads in production. The narrowed imports are written as relative paths, so a save that adds a barrel import still updates the page without a full rebuild. `akanjs` barrels stay whole in dev: in an installed workspace their files are npm modules, and a save that reached a new one would rebuild the whole registry.
  - On `apps/minimal`, the registry behind `/en/explore`, `/en/memo` and `/en/lab/data` holds 505 modules (2.5MB app, 1.2MB vendor), down from 949 (2.6MB app, 6.0MB vendor).
  - Moving an export to another file of a barrel compiles again the importers whose names now point at that file, and only those. This works during `akan start` and on the next start after a move made while it was stopped.
  - Client entry discovery under `akan start` reads a barrel again when one of its files changes. An export moved into a `"use client"` file is found without a restart.
- **CSR shell and MCP App views.** The single-file CSR build that native apps load, and each MCP App view, narrow app and lib barrels too; they used to narrow only `akanjs/ui`. On `apps/minimal` the CSR shell is 1.58MB raw / 411.9K br, down from 3.51MB / 828.8K, and its MCP App views are 20-29% smaller.
- **Discovery and Tailwind.** Client entry discovery and Tailwind's candidate scan follow the same imports. A lib `"use client"` component is no longer a client entry of every route, and a module UI file that no route imports is no longer scanned.
- **Size.** Production build of `apps/minimal`:
  - A route that renders only `Link` ships 53.1K raw / 17.2K br of route code, down from 226.6K / 67.1K.
  - With `libs/shared` merged into the store, the `Link` route ships 147.0K / 37.9K, down from 645.6K / 172.8K. A route rendering shared's `Field` ships 416.0K / 113.9K, down from 645.6K / 172.5K. A route rendering shared's `Banner.Zone` ships 454.3K / 123.2K, down from 658.9K / 175.7K.
  - A route still carries whatever its UI imports. On minimal, whose only module is `memo`, the `Memo.Zone` route stays at 243.8K / 72K.
- **Evaluation order.** A module UI file now runs only on the pages that import it, and only when an import reaches it. It used to run up front, in barrel order, as soon as anything imported the barrel.
  - A UI file whose top level registers something or writes a global must be imported where that side effect is needed.
  - A UI file that reads another UI file's export at its top level, through an import cycle, can now find it uninitialised and throw a TDZ error. Move that read into the component.
  - Generated module `index.ts` files only collect namespaces, so they are unaffected.
