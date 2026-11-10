---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

The skill examples now use one neutral domain, books from a public read-only API: a `BookApi` adapter in `srvkit/`, a `lib/_openlibrary/` service with a `book` query, `fetch.book(id)` and `/books/[id]` pages. This covers the `akan-service` external-API recipe, the `akan-page` API summary, the `akanApi` import block, the `config` rule's `localePrefix` example and the README's as-needed path. The recipes teach the same steps as before.
