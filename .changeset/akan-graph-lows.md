---
"@akanjs/language": patch
---

The Akan Graph locates a guard made by a curried factory, and follows a folder index and a lib's `export *` chain to the adaptor a plug names.

A factory that returns a function which returns a guard, `curried = (role) => (field) => class implements Guard {…}`, makes a guard when every layer is called: `export const Editor = curried("e")("f")` and an in-place `guards: [curried("e")("f")]` are located at their call with the factory's scope, and `function staged(role) { return (field) => resourceGuard(…) }` follows its inner call as a one-layer factory does. A partial call, `curried("e")`, makes no guard. A wrapper that returns a curried factory's first call is not followed.

Of two same-name adaptors in one owner, a plug imported through a folder index (`import { Clock } from "../../srvkit"`) reaches the one the index re-exports, by name (`export { Clock } from "./clockB"`) or through its `export *` chain. When that chain reaches both, the plug is the unlocated `adaptor:<owner>:Clock`, as TypeScript drops a name two `export *` share. A lib's `export * from "<package>"` makes a plug `adaptor:<package>:<Name>` only when the `export *` chain walked from the import's path reaches it, so a stray `export * from "square-sdk"` in a subfolder no barrel exports no longer claims a `Foo` plugged from `@libs/shared/srvkit`, and a second stray one no longer leaves `Square` unlocated.

An import name that is not an identifier (`import { "is(admin" as IsAdmin }`) skips the declaration search; the graph it draws is unchanged.

Ids and details that change for a saved graph or a Change Map base:

- A guard made in place by a curried factory is `…#<model>.<key>:curried@<n>` where it was `…:?@<n>`, and its label and the endpoint's `detail` read `curried("e")("f")` where they read `?("f")`.
- A plug through a folder index of two same-name adaptors links the file the index exports where it linked the first file, or the unlocated `adaptor:<owner>:<Name>` when the index's `export *` reaches both.

- **The fact reader** in `@akanjs/language`: `GuardFactoryFact` and `GuardCallFact` gain `layers`, the calls past the first before a guard comes back (0 for a plain factory and its call).
