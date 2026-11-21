---
"@akanjs/devkit": patch
---

`akan build` fails when a client or shared file (`page/`, `ui/`, `webkit/`, `common/`, a `*.store.ts`, a `*.constant.ts`, any `.tsx`) of the app or one of its libs imports server code: a `*.document`, `*.dictionary`, `*.service` or `*.signal` file, `srvkit/`, a package `server` entrypoint, or the `db`, `srv`, `sig`, `dict`, `option` and `useServer` barrels. It checks the files and patterns `no-import-server-in-client` lints, after the typecheck and before any bundle, and lets an `import type` and a `biome-ignore lint/plugin` through as the lint does. Before, the build and the tests passed and only `akan lint` or `akan verify` found it.
