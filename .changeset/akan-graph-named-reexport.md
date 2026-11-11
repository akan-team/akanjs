---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

The Akan Graph takes a lib's named re-export of a package class only along the chain it walks from the plug's import path, the same chain its `export *` walk follows. The forms it reads are `export { Stripe } from "stripe-sdk"`, `export { default as PayPal } from "paypal-sdk"` and `import { TossClient } from "toss-sdk"; export { TossClient as Toss }`. A plug `Stripe` imported from `@libs/shared/srvkit` follows that folder's index and the modules the index exports. It also follows a relative named re-export (`export { Wise } from "./vendors/wise"`) and an `export *` into another folder or lib (`export * from "../common/square"`, `export * from "@libs/util/srvkit"`). A re-export the chain does not reach no longer claims the plug. Examples are `libs/shared/webkit/stray.ts`, a file in a subfolder whose committed index does not export it, and `srvkit/stripe.helper.ts`, which the generated barrel skips.

A facet folder (`ui`, `webkit`, `srvkit`, `common`, `plugin`) with no index on disk is read as the barrel `akan sync` writes. The generated barrels are gitignored, so this is every facet in a Change Map. As a result, a plug gets the same id in the graph view and in the Change Map, with or without `akan sync`. The folder scans that stood in for a missing barrel are gone. The barrel rule (which files and folders, the naming rule, and Biome's sort order) now lives in `akanjs/common` as `facetBarrelOf`, `facetBarrelNamesOf`, `compareExportNames` and `barrelFacetDirs`. The facet index template, the dev server's index sync and the graph all share it, and `akan sync` writes the same bytes as before.

A package `export *` on the chain is refused only for a name that a module along the chain declares. A declaration elsewhere in the imported lib no longer blocks it. Two re-exports that name the same package through different paths (`"stripe-sdk"`, `"stripe-sdk/server"`) are one adaptor. Guards still find a re-export anywhere in the lib, as before.

Ids that change for a saved graph or a Change Map base:

- A plug whose name the lib re-exports from a package only off the import's chain is the unlocated `adaptor:<lib>:<Name>`, where it was `adaptor:<that package>:<Name>`.
- A plug reached through a relative named re-export, or through an `export *` into another lib, is `adaptor:<package>:<Name>` where it could be the unlocated `adaptor:<lib>:<Name>`.
- A plug whose name two modules along the chain re-export from different packages is the unlocated `adaptor:<lib>:<Name>`, as TypeScript drops a name two `export *` share, where it was the first file's package.
- A plug a chain's sole package `export *` reaches is `adaptor:<package>:<Name>` even when the lib declares `<Name>` off the chain, where it was the unlocated `adaptor:<lib>:<Name>`.
- An owner can have several same-name adaptors. With no index in the import's facet folder, a plug of one of them follows the generated barrel. It used to take the first adaptor under the folder. Through an import path that is neither a module nor a facet folder, the plug is the unlocated `adaptor:<owner>:<Name>`, where it was the first adaptor.
