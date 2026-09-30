---
"akanjs": minor
---

`AKAN_LISTEN_HOST` binds the server to one address instead of every interface, and `AKAN_ALLOWED_HOSTS`
(comma-separated `host:port`) refuses any request, socket upgrade and preflight included, whose `Host` header it
does not list, with 403. A page on a name that re-resolves to 127.0.0.1 (DNS rebinding) is same-origin with a
loopback server, and `CrossSiteGuard` reads `Origin` equal to `Host` as same-site; only the `Host` header, never
`x-forwarded-host`, still names that page's domain. Both apply to a solo server and to the gateway; a server behind
the gateway skips the check, since the Host it sees is the gateway's hop.

Both are meant for a server only its own computer calls, as the server a desktop app carries is. A server that renders
pages calls itself at `localhost:<PORT>` (SSR and its RSC worker), so a list that names only the public host refuses
those calls with 403: put `localhost:<PORT>` in `AKAN_ALLOWED_HOSTS` too, and keep `AKAN_LISTEN_HOST` on an address
that `localhost` reaches.

A CSR bundle reads `PUBLIC_AKAN_SERVER_URL` from the native shell's launch env (`__AKAN_NATIVE__.env`) ahead of the
built-in `AKAN_PUBLIC_SERVER_URL`, for a server whose port is known only when the app starts.
