---
"@akanjs/language": patch
---

The Akan Graph walks a plug's `export *` chain with its own stack, so a chain thousands of modules deep resolves where it used to throw `Maximum call stack size exceeded` out of the whole graph (Bun at about 10,000 modules, Node at about 1,400). A walk runs once per import path and name in a build. It is skipped when no file along the import path's `export *`s mentions the name, and a package `export *` is checked against the chain's declarations only when there is one. 3,000 plugs of names no module exports, imported from a 300-file `srvkit`, take about 50 ms where they took 1.5 s, and 4,000 through an 8,000-file `srvkit` take about 0.4 s where they took over a minute.

A module that declares and exports a name itself (`export class Stripe {}`, `export const`, `export function`, `export enum`, or a local `export { Inner as Stripe }`) binds that name, as TypeScript does, so its `export *`s no longer supply it.

Ids that change for a saved graph or a Change Map base:

- A plug whose import reaches a module that declares the name beside an `export *` that re-exports it from a package (`export * from "../vendor/stripe"` next to `export class Stripe {}`) is the unlocated `adaptor:<lib>:<Name>`, where it was `adaptor:<package>:<Name>`.
- A plug whose name one `export *` of a barrel reaches as a module's own declaration and another as a package re-export is the unlocated `adaptor:<lib>:<Name>`, as TypeScript drops a name two `export *` share, where it was `adaptor:<package>:<Name>`.
- A plug whose import reaches a local binding exported under the plug's name (`class Inner {}` and `export { Inner as Stripe }`) is the unlocated `adaptor:<lib>:<Name>`. The walk used to look for `Inner` through the module's `export *`s, and could name a package's `Inner`.
