---
"akanjs": minor
"@akanjs/cli": patch
---

A route guard gets a second argument, `{ path }`: the requested in-app path with its search, in the form `router.push` takes, on the server and in CSR (`undefined` while MCP lists a screen). `signedIn({ path })` from `@libs/shared/webkit` adds `?redirect=<path>` to the sign-in URL, and `signedIn("/login")` still works. Use `path` to build a redirect target only. It must never decide admission: CSR asks a guard again only when the route or an argument it declared changes.
