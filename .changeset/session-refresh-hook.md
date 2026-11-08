---
"akanjs": patch
---

A session whose access token expired can be renewed on the server before a page renders, and a websocket no longer outlives the credential it opened with.

- **`option.setSessionRefresh(fn)`** runs before a page load or an RSC navigation renders.
  - `fn` gets the request as the browser sent it and returns the `Set-Cookie` values to answer it with, or none.
  - The render reads the cookies those values set, so a page guard, an `unauthorize:` redirect and every server fetch see the renewed session.
  - Every response to that request carries the values, a redirect, a not-found or an error included, as `Cache-Control: private, no-store`.
  - Concurrent requests with the same cookies share one call. A request that arrives with them in the next 10 seconds gets the same answer, so a single-use refresh token is not presented twice.
  - A throwing `fn` is logged, and the page renders with the cookies the browser sent. The app's call wins over its libs'; `null` clears a lib's.
  - It does not run for API endpoints, assets or a CSR shell.
- **A websocket closes at its credential's expiry.**
  - The server reads `exp` off the bearer token, or else the session cookie, at the handshake and at each `__auth` frame.
  - At that time the server closes the socket with code `4401` (`websocketCredentialContract.expiredCode`).
  - Nothing is closed for a socket with no credential, one without `exp`, or one already expired, which the account middleware treats as anonymous.
- **`WsClient` reconnects at once on that close,** with no backoff and no counted attempt.
  - It first awaits `onCredentialExpired`, set through `configure`, for up to `WsClient.renewTimeoutMs` (10 s). Renew the session cookie there, or call `setJwt`.
  - The new handshake then carries the current credential, and every room is resubscribed under it.
