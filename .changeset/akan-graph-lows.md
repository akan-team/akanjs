---
"@akanjs/language": patch
---

The Akan Graph locates a guard made by a curried factory, and follows a folder index and a lib's `export *` chain to the adaptor a plug names.

A factory that returns a function which returns a guard, `curried = (role) => (field) => class implements Guard {…}`, makes a guard when every layer is called: `export const Editor = curried("e")("f")` and an in-place `guards: [curried("e")("f")]` are located at their call with the factory's scope. A wrapper keeps whatever layers its call leaves: `wrap = (role) => curried(role)` and `half = (role) => (field) => curried(role)(field)` take two calls, `(role, field) => curried(role)(field)` one, and `function staged(role) { return (field) => resourceGuard(…) }` follows its inner call. A call short of the layers (`curried("e")`) or past them (`curried("e")("f")("g")`) makes no guard.

A plug imported through a folder index (`import { Clock } from "../../srvkit"`) follows the modules that index exports, as TypeScript does: its own `export { Clock } from "./clockB"`, also renamed (`export { Clock as WallClock } from "./clockA"`), comes before its `export *`s, and a nested index is followed the same way. A file the index does not reach, such as a stray `srvkit/compat/index.ts`, no longer claims the plug. Of two same-name adaptors in one owner, a plug the index reaches neither of, or both of through two `export *`s, is the unlocated `adaptor:<owner>:Clock`. A lib's `export * from "<package>"` makes a plug `adaptor:<package>:<Name>` only when the `export *` chain walked from the import's path reaches it and no lib along that chain declares the name. A stray `export * from "square-sdk"` in a subfolder no barrel exports no longer claims a `Foo` plugged from `@libs/shared/srvkit`, and a second stray one no longer leaves `Square` unlocated.

An import name that is not an identifier (`import { "is(admin" as IsAdmin }`) skips the declaration search; the graph it draws is unchanged.

Ids and details that change for a saved graph or a Change Map base:

- A guard made in place by a call on a call is named by its innermost callee, `…#<model>.<key>:curried@<n>` where it was `…:?@<n>`. Its label and the endpoint's `detail` read `curried("e")("f")` where they read `?("f")`. A non-factory `getGuard()("x")` is `…:getGuard@<n>`. One whose innermost callee comes from a package or akanjs (`vendorCurried("a")("b")`, `roleGuard("a")("b")`) draws no edge, as a one-call guard from there already did, where it drew `…:?@<n>`.
- A plug through a folder index of two same-name adaptors links the file the index exports, where it linked the first file of the folder. When the index reaches neither or both, it links the unlocated `adaptor:<owner>:<Name>`.
- A renamed re-export of an adaptor, `export { Clock as WallClock }`, links the `Clock` it names where it linked an unlocated `adaptor:<owner>:WallClock`.

- **The fact reader** in `@akanjs/language`: `GuardFact`, `GuardCallFact` and `GuardFactoryFact` gain `layers`, the calls past the first before a guard comes back (0 for a plain factory and its call). Each `GuardFactoryFact.via` entry is a `GuardVia`, `{ callee, layers }`, the callee and the calls made on its result.
