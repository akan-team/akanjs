---
"@akanjs/language": patch
---

The Akan Graph takes a lib's named re-export of a package class (`export { Stripe } from "stripe-sdk"`, `export { default as PayPal } from "paypal-sdk"`, or `import { TossClient } from "toss-sdk"; export { TossClient as Toss }`) only along the chain it walks from the plug's import path. That is the rule its `export *` walk already follows. For a plug `Stripe` imported from `@libs/shared/srvkit`, the graph follows that folder's index and the modules the index exports. A re-export elsewhere in the lib, such as `libs/shared/webkit/stray.ts`, or in a file under the folder that the index does not export, no longer claims the plug.

An import path with no module covers every generated, gitignored index in a Change Map. For those, the graph takes the re-exports in the files under the folder, so a plug gets the same id with or without `akan sync`. Guards still find a re-export anywhere in the lib, as before.

Ids that change for a saved graph or a Change Map base:

- A plug whose name a lib re-exports from a package only off the import's chain is now the unlocated `adaptor:<lib>:<Name>`. It was `adaptor:<that package>:<Name>`.
- Some plugs have two modules along the chain re-exporting the name from different packages, or, with no index, two files under the folder doing so. That name is now the unlocated `adaptor:<lib>:<Name>`, because TypeScript drops a name that two `export *` share. It was the first file's package.
