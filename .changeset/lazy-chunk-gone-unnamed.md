---
"akanjs": patch
---

A lazily loaded chunk the server no longer serves now reloads its page once in Safari and other WebKit browsers too, and in Chromium when the chunk the error names is served but one it imports is gone.

- **Before:** the reload needed the error to name the gone chunk. WebKit's `Importing a module script failed.` names none. Chromium names the `import()` target, so a target a rolling deploy still served, with a chunk it imports gone, answered the probe with 200. Either way the page stayed on its error.
- **Now:** in those two cases the client sends the same `HEAD` request for the chunks under `/_akan/client/` whose fetch the page's Resource Timing recorded as failed: an empty body, and a status outside 2xx where the browser reports one. A 404 for any of them reloads the page once.
  - Only WebKit's exact message counts. Its syntax, link, MIME-type and evaluation errors are worded differently, and still leave the page alone.
  - Each error asks about at most the four latest failed fetches, all at once, and a failed fetch is asked about once per document.
  - Every condition and bound of the existing reload still holds: online, `akan build` output, no navigation or document load under way, nothing moved while the requests were out, not on the path a reload loaded, and one claim per chunk in the per-tab list.
- Firefox names the module that failed to fetch, so it was already covered.
