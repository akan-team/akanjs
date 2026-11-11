---
"akanjs": patch
---

A lazily loaded chunk the server no longer serves now reloads its page once, in Chromium and Firefox.

- **Before:** a chunk loaded through `import()` (`lazy` from `akanjs/webkit`, `React.lazy`, or a dynamic import in a client component) that a deploy had removed failed to fetch, and the page stayed on its error. This happens to a tab left open across a deploy, and during a rolling deploy when the chunk's request reaches a replica of the other build.
- **Now:** when such a failure reaches the React root or rejects an `import()` that nothing catches, the client asks the server for the chunk again with a `HEAD` request. Only a 404 reloads the address the tab shows. A network failure, a blocked request or a 5xx leaves the page as before. The check runs only when all of these hold:
  - the error names a chunk under this origin's `/_akan/client/`. Chromium names it, and so does Firefox from 115. Safari and other WebKit browsers do not, so they keep the old behaviour;
  - the browser is online;
  - no navigation to another page is under way, and none started while the request was out;
  - no other document load is under way;
  - the error is not one the Flight client's chunk loader already handled.
- **Unlike a link failure, this covers the document's own page too,** since a deploy removes the chunks of the build the tab was opened on.
- **At most one reload per chunk per tab,** in the same per-tab list the chunk fallback uses. A chunk that is still missing after the reload shows its error.
- This applies to `akan build` output only.
