---
"@akanjs/cli": patch
---

The `conventions` guideline (`akan guideline show conventions`, MCP `get_guideline`) now says that a `<Link>` handed an absolute URL (any scheme, any case) or a `//host` path passes it through as an external link, that only an app path gets the locale and basePath, and that `Href.isExternal(href)` from `akanjs/client` is the same test.
