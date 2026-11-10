---
"akanjs": patch
---

A lazily loaded chunk that fails to link during a rolling deploy now reloads its page as a document.

- **Before:** the chunk fallback covered only the chunks the Flight client loads. A chunk loaded through `import()` (`lazy` from `akanjs/webkit`, `React.lazy`, or a dynamic import in a client component) on a page from another build could fail to link against the document's import map. With no error boundary above it, the page went blank; with one, it showed that boundary's fallback. Nothing loaded the page again.
- **Now:** when a module link or resolve error reaches the React root (caught by an error boundary or not) or rejects an `import()` that nothing catches, the tab reloads the address it shows. It does so only when all of these hold:
  - the page on screen was rendered from a client navigation's or refresh's response, not by the document itself;
  - no navigation to another page is under way;
  - the browser is online;
  - no other document load is under way;
  - the error is not one the Flight client's chunk loader already handled.
- **At most one reload per page and error per tab**, in the same per-tab list the chunk fallback uses.
- This applies to `akan build` output only. There, React's own reporting is kept: a caught error is still logged, and an uncaught one is still reported. `akan start` passes nothing new to the root.
