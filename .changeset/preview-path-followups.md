---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan preview` opens `/openapi.json` and the default `/mcp` as written, as the server mounts them outside `/:lang`; before, they got the default locale and opened a 404 page. A full URL (`http://localhost:<port>/oauth/token`) now opens exactly as written, with no locale and no CSR boot query, so an endpoint mounted outside the API prefix or a custom MCP path can be opened; before, a full URL was taken by its path and given the locale. A page `--changed` finds always gets the locale, even one at a server route's path such as `/mcp`. A screenshot's file name carries the page's query and a short hash of it, and a long path or query is cut with a hash, so `/_akan/studio?view=runtime` and `?view=signals` no longer overwrite one another and a long query no longer fails the page. The `akan-debug` skill, `akan preview --help` and the `akan preview` reference state the same rule.
