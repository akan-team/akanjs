---
"akanjs": patch
---

A lazily loaded chunk the server no longer serves now reloads its page once.

- **Before:** a chunk loaded through `import()` (`lazy` from `akanjs/webkit`, `React.lazy`, or a dynamic import in a client component) that a deploy had removed failed to fetch, and the page stayed on its error. This happens to a tab left open across a deploy, and during a rolling deploy when the chunk's request reaches a replica of the other build.
- **Now:** when such a failure reaches the React root or rejects an `import()` that nothing catches, the client asks the server for the chunk again with a `HEAD` request. Only a 404 reloads the address the tab shows. A network failure, a blocked request or a 5xx leaves the page as before. The check runs only when all of these hold:
  - the error is a fetch failure the client can tie to a chunk under this origin's `/_akan/client/` (see below);
  - the browser is online;
  - the tab is not on the path a reload loaded, whether the reload was this fallback's, the chunk fallback's, the user's or `Reconnect`'s. A refresh or a shallow update keeps the tab on that path; after a page navigation to another path, the check runs again;
  - no navigation to another page is under way, and no other document load either;
  - the error is not one the Flight client's chunk loader already handled.
- **Which chunk is asked about:**
  - the one the error names. Chromium names the `import()` target. Firefox names one from 115 on: the target in 115, the module that failed to fetch in current versions;
  - otherwise, the chunks whose fetch the page's Resource Timing recorded as failed. This covers two cases:
    - Safari and every iOS browser: WebKit's `Importing a module script failed.` names no chunk;
    - the chunk Chromium names is not gone, but a chunk it imports is, as when a rolling deploy splits requests across builds.
  - A failed fetch has an empty body and a status outside 2xx. WebKit reports no status, so there it also needs a `responseStart`, which a memory or disk cache hit does not set.
  - Each error asks about at most the four latest, all at once. A recorded failure that answers anything but 404 is not asked about again. One that answers 404 stays listed, since its reload can be skipped and WebKit does not fetch a module that failed again.
  - Only WebKit's exact message counts. Its syntax, link, MIME-type and evaluation errors are worded differently and still leave the page alone.
- **The reload is skipped if anything happened while the request was out:**
  - any client navigation, including a shallow update, a refresh (the token-refresh timer's too) or a back or forward move;
  - a `beforeunload` or `pagehide`, which a document load the router never sees fires (a plain link, a form post, `location.assign`).
- **Unlike a link failure, this covers the document's own page too,** since a deploy removes the chunks of the build the tab was opened on.
- **At most one reload per chain of loads.** The reloaded document never reloads from here while it stays on that path, so chunks that keep answering 404 there show their error after one reload, however many there are and whether or not the tab's storage holds. A further reload needs a page navigation to another path. Each chunk is also recorded in the per-tab list the chunk fallback uses.
- This applies to `akan build` output only.
