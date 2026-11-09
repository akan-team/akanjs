---
"akanjs": patch
---

A navigation that a newer one overtakes before its page commits now cuts its `/__rsc` request once the response headers are in, so the server stops streaming it and the browser stops reading it. Before, it ran to the end and was only kept from committing. The cut waits for the headers because a session refresh may answer with a rotated single-use refresh token in `Set-Cookie`, and a request aborted before it lands leaves the browser holding the spent token. A refresh, a shallow push and a move back or forward overtake it the same way. A page that has already committed is never cut, so the Suspense content it still streams keeps arriving while the next navigation loads.
