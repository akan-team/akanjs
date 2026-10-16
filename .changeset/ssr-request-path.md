---
"akanjs": patch
---

A server-rendered page request does less work before it renders: about 16% more requests a second for a cached page of `apps/minimal` (26.7k to 30.8k on one machine, p99 3.7ms to 3.2ms).

- The route-seed index is matched against patterns split once per index, not once per entry per request; a dev rebuild's new index compiles a new matcher. `RouteSeedIndexStore.match` / `matchPrefix` answer as before.
- A production server answers an extensionless path (a page) from the list of `public/` files it found at boot instead of a `stat` per request. A path with an extension is still checked on disk, so a file written to `public/` at runtime is still served.
- `parseAkanI18nEnv()` keeps its last answer while `AKAN_PUBLIC_DEFAULT_LOCALE` and `AKAN_PUBLIC_LOCALES` read the same, and the config it returns is frozen.
- `TrustedProxy.isTrusted` keeps its verdict per peer address (up to 1024), cleared by `configure` and `reset`.
