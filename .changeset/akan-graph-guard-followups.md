---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

The Akan Graph keys a guard function by the file that declares it, locates more of a workspace's guards, and stops counting things that are not guards.

A guard function a route or layout imports is keyed by its file, as one the page declares already was: `guard:libs/shared:webkit/signedIn.ts#signedIn`. A `canEdit` in `webkit/` and one in `common/` are two nodes, each at its own declaration, and an edit to either marks only that one changed in the Change Map. A guard called through a namespace import (`auth.signedIn()`), or imported under a name a file re-exports (`export { signedIn as hasSession } from "./auth"`), reaches its declaration. A function the guard declares itself shadows an import of the same name, and an overloaded guard's digest covers every signature. Only a file whose text declares or re-exports the name is parsed, so a guard that calls `usePage()` from the generated client no longer parses every page that names it.

A function is a guard factory only when it returns a guard, a class that implements `Guard` or a call to a factory, so `const guardCount = countGuards()` is no longer a guard. An import from a package outside the workspace (`@vendor/auth`) resolves to no guard: it no longer links a same-name workspace guard, and a vendor's `Public` no longer reads as the framework's. A factory imported from akanjs or a package makes no guard.

More guards carry their location: a name a lib re-exports under another name (`export { Admin as AdminGuard }`) reaches the class, and one it re-exports from akanjs is `guard::Public`; `srvkit.SSO.Kakao` reads through the namespace to the lib's map; a map entry a factory makes (`SSO = { Kakao: ssoGuardOf("kakao") }`) is the guard `SSO.Kakao`; a local wrapper of an imported factory, a factory called through a namespace (`srvkit.resourceGuard("pin")`) and a class that extends a guard (`class DemoAdmin extends Admin`) make guards; a guard made in place, `guards: [canEdit("memo")]`, is a node at the call. Of two same-name guards in one owner, an import reaches the one its path names. A wrapper's digest covers every factory it can return, and an edit to a factory in another file marks the guards it makes changed instead of listing the file as unmapped.

`get_graph` past the node limit names owners by the nodes it would answer with, changed pages included, so 650 changed routes no longer hide behind one changed lib method. A guard on `const route = page()…; export default route` is no longer read: `RouteSourceValidator` rejects that shape.

Ids and details that change for a saved graph or a Change Map base:

- An imported guard function's id names its file: `guard:libs/shared:signedIn` is now `guard:libs/shared:webkit/signedIn.ts#signedIn`.
- A guard name two files of one owner declare is keyed by file, `guard:apps/demo:srvkit/admin.ts#Admin`.
- A guard made in place is `guard:<owner>:<file>#<call>`, and an endpoint's `detail` names the call as written, `resourceGuard("memo")` where it read `resourceGuard`; a guard read through a namespace's map reads `srvkit.SSO.Kakao` where it read `Kakao`.
- A guard a lib re-exports under another name, or from akanjs, takes the declaring owner's id (`guard:libs/util:Admin`, `guard::Public`) where it took the re-exporting lib's.
- A guard imported from an unknown package draws no edge.

- **`AkanGraphNode.sources`** in `akanjs/common`: the files besides `at.file` that a node's digest reads, set only with digests. The Change Map uses it to map those files and leaves it out of its answer.
- **The fact reader** in `@akanjs/language`: `GuardFactoryFact.via` is a list and gains `direct`; `GuardCallFact` gains `kind` (`call` or `extends`) and `scope`; a slice's or endpoint's guard made in place is read as its call text.
