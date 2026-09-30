---
"akanjs": minor
---

The app's websocket refuses a page from another site

A socket has no CORS, so a page on any site could open `/api/ws` on a server it reached — a desktop app's loopback
server through the user's own browser — and read every room it may subscribe to, riding the `SameSite=None` auth
cookie where there is one. The upgrade now runs `CrossSiteGuard`'s origin check, the one mutations and the dev HMR
socket already pass: a same-site page, the native shells (`app://localhost`, `https://app.localhost`), an origin in
`allowedOrigins` and a caller that sends no `Origin` connect as before, and any other origin is refused with 403.
`option.setCrossSite({ enabled: false })` turns it off with the rest of the gate.

**Breaking for a web client on another site that only read and subscribed:** its socket is refused until its origin is
in `allowedOrigins`, as its mutations already needed.
