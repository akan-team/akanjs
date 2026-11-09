---
"@akanjs/devkit": patch
---

A route's client code no longer carries the UI of every module in the app and in each lib its store merges.

- **Bootstrap.** Each route's `"use client"` entry, every generated root layout and the SSR dev registry start with `import "@apps/<app>/lib/useClient"` and `import "@apps/<app>/lib/st"`, which load the client runtime and the store. They used to import `@apps/<app>/client` bare, and that bundled the whole barrel.
- **Narrowed barrel imports.** A named import from an app or lib `client` barrel is still narrowed to the files that define the names. This includes `import { st } from "@apps/<app>/client"` in a component and the generated `import { RootStore as <lib> } from "@libs/<lib>/client"` in `lib/st.ts`. What the rewrite keeps of the barrel is now its `lib/useClient` and `lib/st`. It used to keep a bare import of the barrel itself, which put every module's UI of the app and of each merged lib on every route. It also made every lib `"use client"` component a client entry of every route. Client entry discovery and Tailwind's candidate scan follow the same imports, so they skip a module UI file that no route imports.
- **Size.** Production build of `apps/minimal`:
  - A route that renders only `Link` ships 53.1K raw / 17.2K br of route code, down from 226.6K / 67.1K.
  - With `libs/shared` merged into the store, the same route ships 147.0K / 37.9K, down from 645.6K / 172.8K.
  - A route that renders a module's UI still carries whatever that UI imports. On minimal, whose only module is `memo`, the `Memo.Zone` route stays at 243.8K / 72K.
- **Evaluation order.** A module UI file now runs only on the pages that import it, and only when an import reaches it. It used to run up front, in barrel order, as soon as anything imported the barrel.
  - A UI file whose top level registers something or writes a global must be imported where that side effect is needed.
  - A UI file that reads another UI file's export at its top level, through an import cycle, can now find it uninitialised and throw a TDZ error. Move that read into the component.
  - Generated module `index.ts` files only collect namespaces, so they are unaffected.
