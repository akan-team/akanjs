---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The path rules an agent loads with every service, signal, page and `.tsx` file are shorter: the `server`, `style` and `ssr` rules keep only what fails the build or silently changes behaviour and point at the skill that explains the rest (server 7.9 KB to 2.4 KB, style 5.8 KB to 2.5 KB, ssr 3.6 KB to 1.9 KB), and the `akan-page` skill no longer repeats what the `page` rule already says. Nothing was dropped: an endpoint's `errors` option and where an adapter's error keys live are now in the `akan-err` skill, the request-schema check in `transportRule`, and the `cn`, multi-slot and enum-to-class conventions in `cssRule`. `cssRule` and `recipeRule` now say the framework recipe list is in the `style` rule, and the API reference says what `akanjs/dictionary`, `document`, `service`, `store`, `client/native`, `native/desktop` and `test` hold. Run `akan agent install` in a workspace to pick up the new files.
