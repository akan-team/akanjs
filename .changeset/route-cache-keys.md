---
"akanjs": minor
---

The route caches key a page on the locale it resolved to, not on the `Accept-Language` it was asked in.

- The RSC and HTML result caches keyed every page on the request's raw `Accept-Language` as well as on the locale the locale proxy resolved from its path, so each set of browser languages kept its own copy of a page that renders the same for all of them. Only the resolved locale is in the key now, and visitors who ask for one locale's page in different languages share its entry. A page that reads the header with `headers()` is still rendered for each request and never stored.

**Upgrading.** Nothing changes for a page that reads `Accept-Language` with `headers()`. One that reads it through `untrackedHeaders()` or `headers({ trackDynamic: false })`, which skip the tracking that keeps a render out of the caches, now gets another language's stored copy: read it with `headers()` instead.
