---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

An app that draws no Akan UI component now builds and runs without the UI's optional peers. Before, `akan build` failed with `Could not resolve: "react-icons/ai"` or `"react-spring"` in an app that imported nothing from `akanjs/ui`: the System UI every root layout mounts drew react-icons glyphs and reached the model, list and dialog components through the `Load` and `Button` modules, and the CSR build, on by default, bundled the whole `akanjs/ui` barrel.

**Upgrade note.** A workspace can drop `react-spring`, `@react-spring/web`, `@use-gesture/react`, `react-refresh`, `scheduler` and `tailwind-scrollbar` from its `package.json`, unless its own code imports them. `akanjs` now depends on `@react-spring/web`, `@use-gesture/react`, `react-refresh`, `scheduler` and `tailwind-scrollbar` itself, because the System UI, the dev runtime and `akanjs/ui/styles.css` always use them, and nothing uses `react-spring` any more. New workspaces no longer list them.

- **`react-icons` stays an optional peer.** Install it when the app draws a component that shows its icons, as most form, list and dialog components do. Under `akan start`, a CSR page (`?csr=true` or a native shell) of an app that imports anything from `akanjs/ui` still needs it: the dev module registry loads that barrel whole.
- **`chance`** stays an optional peer that only `akanjs/test` needs.
- **The System UI draws its own icons.** The Button's processing and done states, the toasts and the reconnect overlay render inline SVGs with the same markup react-icons drew.
- **The generated root layout and `_overrides.tsx` wrapper** import `System` and `UiOverrideProvider` from their own files instead of the `akanjs/ui` barrel.
- **The CSR build and its MCP App views** rewrite `akanjs/ui` imports to the components a file names, as the SSR route builds already did, so a page that imports `Link` no longer bundles every component.
- **Animations use `@react-spring/web`** instead of the `react-spring` umbrella package, which also installed the native, three.js, konva and zdog renderers.
