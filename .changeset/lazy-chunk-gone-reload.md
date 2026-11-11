---
"akanjs": patch
---

A lazily loaded chunk the server no longer serves now reloads its page once, in Chromium and Firefox.

- **Before:** a chunk loaded through `import()` (`lazy` from `akanjs/webkit`, `React.lazy`, or a dynamic import in a client component) that a deploy had removed failed to fetch, and the page stayed on its error. This happens to a tab left open across a deploy, and during a rolling deploy when the chunk's request reaches a replica of the other build.
- **Now:** when such a failure reaches the React root or rejects an `import()` that nothing catches, the client asks the server for the chunk again with a `HEAD` request. Only a 404 reloads the address the tab shows. A network failure, a blocked request or a 5xx leaves the page as before. The check runs only when all of these hold:
  - the error names a chunk under this origin's `/_akan/client/`. Chromium names it, and so does Firefox from 115. Safari and other WebKit browsers do not, so they keep the old behaviour;
  - the browser is online;
  - the document was not itself loaded by a reload, whether this fallback's or the user's;
  - no navigation to another page is under way, and no other document load either;
  - the error is not one the Flight client's chunk loader already handled.
- **The reload is skipped if anything happened while the request was out:**
  - any client navigation, including a shallow update, a refresh (the token-refresh timer's too) or a back or forward move;
  - a `beforeunload` or `pagehide`, which a document load the router never sees fires (a plain link, a form post, `location.assign`).
- **Unlike a link failure, this covers the document's own page too,** since a deploy removes the chunks of the build the tab was opened on.
- **At most one reload per chain of loads.** The reloaded document never reloads from here, so chunks that keep answering 404 show their error after one reload, however many there are and whether or not the tab's storage holds. Each chunk is also recorded in the per-tab list the chunk fallback uses.
- This applies to `akan build` output only.
