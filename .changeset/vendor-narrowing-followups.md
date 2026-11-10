---
"akanjs": patch
"@akanjs/devkit": patch
---

Narrowed vendor entries hold up during a rolling deploy and on very large builds.

- **A navigation whose route chunk fails to load now loads its target as a document.** During a rolling deploy, a document from the new build can get a page from a replica the deploy has not reached yet. That page's chunks can import a name the document's narrowed vendor entries lack. Before, the page broke, and React's Flight client kept the failed load, so retrying in the tab failed the same way. Now the tab loads the page it was headed for as a document, which brings a matching import map. This applies to `akan build` output only. A chunk the document loaded before its first navigation never triggers it, so a page cannot reload in a loop.
- **`akan build` fails when the vendor scan cannot find a route's client entry**, and names the entry. Before, a build that wrote its route bundles somewhere the scan did not look narrowed every vendor entry to nothing. The build passed, and pages threw in the browser.
- **The vendor scan no longer overflows the stack on large minified chunks.** A function body of about 20,000 statements, which a minifier folds into one comma chain, used to fail `akan build` with `Maximum call stack size exceeded`.
