---
"akanjs": patch
"@akanjs/devkit": patch
---

Partial RSC commit can now patch a real page, and it patches cleanly. It is still off by default behind `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`. With the flag on:

- **Which pages render their head through `AkanRouteHead`.** Every page whose head is plain `title`, `meta` and `link` tags now renders it through a client component instead of plain head tags. That way any page can be the one a patch starts from. Patches still only land on pages that set `.config({ rscPatchHeadSafe: true })`.
- **A plain `.head()` is its own head snapshot.** A page no longer needs a hand-written snapshot. A head with anything else, such as a script or a component, keeps the full render.
- **React renders the head.** The old patch swapped `<head>` nodes behind React's back. That left a stale or broken head after the next full navigation or a back navigation.
- **A patch carries only the page's part of the head.** The layouts' part stays on the client, under the layouts the patch keeps. The page's part travels in the `X-Akan-Rsc-Patch-Head-Snapshot` header, which is now capped at 2 KB encoded, down from 12 KB. A larger page head renders whole, and the server logs that once per route.
  - The cap leaves room under nginx's default 4 KB `proxy_buffer_size`, but it doesn't guarantee a fit: router state, trace headers and `Set-Cookie` share that buffer.
  - The docs pages' part is about 1.1 KB, against about 5.7 KB for their whole head.
- **The layouts a patch keeps follow the new page.** `usePathCtx()` under an SSR page gives the patched page's path, pathname and query, so a menu's active item and a pager move with it.
- **A full commit after a patch goes straight to the new page's head, path and body.** It no longer shows the last full page for a frame first.
- **A patch falls back to a full render when the kept layouts would be wrong:**
  - another route group's layout sits at the same URL prefix (`(guest)/account/login` to `(member)/account/settings`);
  - the layouts' head would be different for the target, for example a layout `.head()` that reads a search arg. The client sends a key of the layouts head it shows, and the server compares it with the target's;
  - a route param differs (`/en` to `/ko`);
  - a frame setting differs, such as `transition`;
  - the page navigated from has no patchable head;
  - its frame cannot be resolved.
- **A client built without the flag no longer asks for patches it cannot apply.** Before, a server running with the flag answered such a client with patches, and every sibling navigation made a second request.
- **`@akanjs/devkit`: the SSR runtime manifest keeps every client export of the segment outlet module.** Before, it kept only one.
