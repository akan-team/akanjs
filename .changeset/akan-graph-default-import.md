---
"@akanjs/language": patch
---

The Akan Graph reads a lib module that imports a package's default export and exports it by name (`import Stripe from "stripe-sdk"; export { Stripe }`, or `export { PayClient as Pay }`) as that package's re-export, the same as `export { default as Stripe } from "stripe-sdk"`. Along the plug's import chain, with or without the generated barrel, the plug is `adaptor:stripe-sdk:Stripe` (or `adaptor:pay-sdk:Pay`), where it was the unlocated `adaptor:<lib>:<Name>`. Beside an `export *` that also supplies the name, the module's own re-export wins, as a named package re-export does. A namespace import (`import * as sdk from "mollie-sdk"; export { sdk }`) and a default import of a relative or lib module are still the module's own export, and guards are unchanged.
