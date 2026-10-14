---
"akanjs": patch
---

Fetch client fixes:

- **Multipart arguments.** Beside a file upload, every argument but a lone `String` or `ID` is sent as JSON, so a string bound for `Any` arrives as that string, where one that read as JSON (`42`, `true`) was parsed into another type.
- **A gateway's own error.** A JSON 408, 429, 502, 503 or 504 that names no akan error key, such as a proxy's `{"message": …}`, shows the translated transport error and is retried like the gateway's HTML page.
- **`Retry-After: 0`** on a proxy's own 429 means retry now (`seconds: 0`), not in 60 seconds.
- **A refused websocket URL** is logged and retried on the reconnect backoff, instead of leaving the client in `connecting`.
- **A clone of a foreign clone.** On the server, a clone of a clone that already points at another origin opens no websocket unless `connect: true` is passed, as a clone given that origin never did.
- **A clone keeps its parent's default timeout**, as it keeps the parent's websocket options and retry policy.
- **`destroy()`** sets `connected` to `false` at once.

Upgrade note: deploy client and server together. A server older than this release does not parse a multipart argument back from JSON, so a quoted string reaches it.

Upgrade note: a server-side clone of a clone pointing at another origin no longer connects a websocket by itself; pass `connect: true` where one is needed.
