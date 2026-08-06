---
"akanjs": minor
---

feat(server): add subRoute hosts at runtime with `AKAN_SUB_ROUTE_HOSTS`

An app resolved a request Host to a basePath through a map fixed at build time — the domains written into
`akan.config.ts` plus the generated `<basePath>-<branch>.<serveDomain>`. A platform that mints its hostnames when
a project is created cannot write either one into the repo, so its subRoute hosts fell through to the root app.

`AKAN_SUB_ROUTE_HOSTS` adds to that map at boot, in the same spirit as `AKAN_PUBLIC_BASE_PATHS`:

```
AKAN_SUB_ROUTE_HOSTS="soft=soft-abc.try.akanjs.com,soft.acme.com;office=office-abc.try.akanjs.com"
```

Hosts are matched lowercased and without a port, exactly as the built-in ones are. The env mapping is a union with
the built one, never a replacement, so a tenant's own domains keep working and removing the env restores the
previous behaviour byte for byte.

A basePath the build does not serve is dropped with a warning rather than honoured — the route tree is a build
output, so accepting one would answer every request under it with a 404 and nothing to explain why. A malformed
entry is skipped the same way: the value is rendered by a deployment platform, and one bad character must not turn
into a boot loop across every pod.

`x-base-path` is now checked against the basePaths the build serves before it is trusted, matching the check
`getBasePathFromPathname` already applied to it. An unrecognised value falls through to host matching instead of
selecting a basePath that resolves to nothing.
