---
"@akanjs/devkit": patch
---

fix(dev): a page that quotes `export default function` in a code snippet builds for the CSR dev page

The Fast Refresh rewrite of `export default function Name(` also rewrote the same text inside a template literal or a
block comment, and appended a second `export default` for it. The CSR bundle refused the result with `Multiple
exports with the same name "default"`, so `?csr=true` failed on any page quoting such a component — eight docs pages
in the akan app — while SSR rendered them. Only a declaration the parser reports as an export is rewritten now.
