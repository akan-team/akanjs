---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

The Akan Graph keys each guard by the app or lib that declares it, `guard:libs/shared:Admin`, and follows the import that names it there, so `Admin as AdminGuard` reaches `Admin`, `srvkit.Admin` reaches the lib's class, and two libs' `Admin` stay two nodes. A guard read out of an object map, `SSO.Kakao`, resolves through the imports of the file that declares the map. A name a lib only re-exports reaches the class it re-exports. A guard a factory makes is a guard too, whether the factory sits in the same file, wraps another factory there, or is imported from another lib. A guard node carries its source location, `doc` (the comment above its declaration that says what it checks) and, in `detail`, its `scope` (`account` or `resource`). A factory-made guard takes the factory's scope, and takes its doc when no guard of that factory has its own. With digests, an edit to a guard or to the factory that makes it marks the guard changed in the Change Map. Every guard a workspace declares is a node, referenced or not. `Public` and `None` come from `akanjs`, carry no location and say what they do. Studio shows a node's `doc` in its tooltip.

Ids and details that change for a saved graph or a Change Map base:

- A guard id names its owner: `guard:Admin` is now `guard:libs/shared:Admin`, and the framework's `guard:Public` is `guard::Public`.
- An endpoint's `detail` names a guard as written: `srvkit.Admin` and `SSO.Kakao` where it read `Admin` and `Kakao`.
- A slice map entry that lists several guards, `cru: [Owner, None]`, now reads `cru Owner` and `cru None` in `detail`, and links each of them, where it read `cru ?` and linked none.

- **`FileFacts.imports`, `guards`, `guardFactories` and `guardCalls`** in `@akanjs/language`: the reader records each class that implements `Guard` (under any name it is imported as), each factory that returns one or calls such a factory in the same file, and each const that a factory makes, a local one or an imported one. `AkanIndex.setFile` reads them from every non-test `srvkit/` file and every other non-test file that names `Guard` and `canPass`.
- **`AkanGraphNode.doc`** in `akanjs/common`: an optional one-paragraph description.
