---
"akanjs": patch
"@akanjs/devkit": patch
---

Narrowed vendor entries hold up during a rolling deploy and on very large builds.

- **A route chunk that fails to load during a rolling deploy now loads its page as a document.** A document from the new build can get a page from a replica the deploy has not reached yet, and that page's chunks can import a name the document's narrowed vendor entries lack. Before, the page broke, and React's Flight client kept the failed load, so retrying in the tab failed the same way. Now, if the navigation has not committed, the tab loads its target as a document, which brings a matching import map. If the page is already on screen, the tab reloads it only when the error is a module link or resolve error and the browser is online; a network, ad-blocker or evaluation error leaves the page in place. Only chunks named by the latest page navigation's response count: the document's own chunks, an overtaken navigation's and a replaced response's never trigger it. Each chunk triggers at most one document load per tab, so a chunk that always fails shows its error instead of reloading in a loop. This applies to `akan build` output only.
- **`akan build` fails when the vendor scan cannot find a route's client entry**, and names the entry. Before, a build that wrote its route bundles somewhere the scan did not look narrowed every vendor entry to nothing. The build passed, and pages threw in the browser.
- **The vendor scan no longer overflows the stack on large minified chunks.** A function body of about 20,000 statements, which a minifier folds into one comma chain, used to fail `akan build` with `Maximum call stack size exceeded`.
