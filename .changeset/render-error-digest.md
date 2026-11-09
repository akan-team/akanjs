---
"akanjs": patch
---

In production, an error thrown while a page renders no longer reaches the browser as its message. The RSC worker returned the message as the error's digest, and React writes the digest into the Flight payload that the HTML inlines and that client navigations fetch, so a database driver's message, a file path or a value read from a record was on the page. Under `NODE_ENV=production` the digest is now a random 8-character id, and the worker's `[rsc] render failed` log line carries the same `digest=<id>` beside the full error, so the id a page shows finds its log line.

Development keeps the message as the digest. Redirects and not-found answers keep their digests and behave as before, and a layout's `.error()` view still gets `AKAN_RENDER_ERROR`. A typed `Err` thrown after the page has started streaming now gets an id as well, rather than its dictionary key; nothing in the framework read the key from the digest.
