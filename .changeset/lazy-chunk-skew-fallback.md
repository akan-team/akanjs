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
- **At most one reload per error per tab,** whichever page it shows up on, in the same per-tab list the chunk fallback uses.
- **An `import()` of your own that always fails to link** (a bare specifier missing from the import map, or a CDN module that lacks a name it is asked for) therefore costs one reload per distinct error per tab, the first time it happens on a page a client navigation rendered. After that it shows as it did before.
- This applies to `akan build` output only. There, React's own reporting is kept: a caught error is still logged, and an uncaught one is still reported, through a window `error` event where the browser has no `reportError`. `akan start` passes nothing new to the root.
