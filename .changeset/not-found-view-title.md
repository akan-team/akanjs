---
"akanjs": patch
---

A not-found or error view's own `<title>` and `<meta>` replace the document head, so a 404 page has one title.

- The tags at the top of what a layout's `.notFound()` or `.error()` returns are merged over the layouts' head by tag identity and leave the view's body. Before, React hoisted them beside the head's own, so the document had two titles.
- This holds for an unmatched path, for `router.notFound()` from a page's `.head()` or `.render()`, and for an error a page throws.
- A not-found view raised by a page's render now has the layouts' head, as one raised before any byte already had, not the head of the page that is missing.
- Under a `.loading()` the head is out before the view renders, so its tags stay in the view, as before.
