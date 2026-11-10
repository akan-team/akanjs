---
"akanjs": patch
"@akanjs/devkit": patch
---

Partial RSC commit can now patch a real page, and patch it cleanly. It stays off by default behind `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, and only pages that set `.config({ rscPatchHeadSafe: true })` take part.

- **A plain `.head()` is its own head snapshot.** A `.head()` of plain `title`, `meta` and `link` tags is read into the snapshot a patch carries, so a page needs no hand-written snapshot to be patched. A head with anything else, such as a script or a component, still gets a full render.
- **React renders the head.** The route head is rendered through a client component that a patch updates. Swapping `<head>` nodes behind React's back left a stale or broken head after the next full navigation or a back navigation.
- **The layouts a patch keeps follow the new page.** `usePathCtx()` under an SSR page gives the patched page's path, pathname and query, so a menu's active item and a pager move with the page. A full commit after a patch goes straight to the new page's head, path and body. It no longer shows the last full page for a frame first.
- **A patch is refused when the kept layouts would be wrong.** A patch now falls back to a full render when a route param differs (`/en` to `/ko`), when the frame config differs (for example a different `transition`), or when the page navigated from has no patchable head.
- **The SSR runtime manifest keeps every client export of the segment outlet module.** Before, it kept only one export per module.
- **The apps/akan docs subpages** opt in with `rscPatchHeadSafe: true`.
