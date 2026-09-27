---
"akanjs": minor
---

A page a native shell serves reaches its API, and keeps its session, without the cookies it no longer has.

The shell serves the page from `app://localhost` (iOS, macOS, Linux) or `https://app.localhost` (Android, Windows),
which is cross-origin to the API and names neither its host nor its port, and WKWebView keeps no cookies for it.

- `CrossSiteGuard` admits those two origins instead of `capacitor://localhost`, `ionic://localhost` and
  `http://localhost`, and every signal route answers `OPTIONS` for an allowlisted origin with the verbs it serves,
  so a bearer header or a JSON body preflights without an ingress in front. Never with
  `access-control-allow-credentials`: the `SameSite=None` cookie would let an allowed origin ride a browser session.
- `AKAN_PUBLIC_SERVER_URL` (http or https) names a CSR bundle's server — host, port and protocol, the websocket
  URL following it. A cloud CSR bundle without it calls its cloud host on 443; SSR tabs and servers ignore it.
- A CSR client's session is the bearer token `fetch` sends: `getAuthToken()` reads it before the cookie jar and
  `setAuth()` no longer copies it into a cookie. An `app://` page keeps its other cookies (theme,
  `prepareUserId`, …) in a `localStorage` jar. The `CapacitorCookies` mirror is gone.
- `libs/shared`: a CSR client keeps each scope's refresh token (user, admin) in storage and sends it in the body,
  which the server already accepted; sign-in, activation and refresh keep the rotated token, sign-out drops it, and one
  refresh per scope runs at a time, since a second use of a rotated token reads as theft and ends every session.

**Breaking for a Capacitor build still in the field:** its `capacitor://localhost` origin is refused.
