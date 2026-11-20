---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

feat(akanjs): `.loading(…, { atPress: true })` shows a page's fallback from the press on a move between its own paths

A move from `/chat/a` to `/chat/b` keeps the page being left on screen until the server has rendered every layout
above the page again, so under a layout that awaits the press looks dead, though a document load of the same URL
shows the fallback. A page can now opt in:

```tsx
export default page()
  .param("channelId", String)
  .loading(() => <ChannelSkeleton />, { atPress: true })
  .render(({ channelId }) => <Channel id={channelId} />);
```

Once such a navigation has waited 150 ms on the server, the page's `.loading()` replaces the page under the layouts
that stay, and the answer replaces it in turn. `{ atPress: { delayMs: 0 } }` sets the wait. Nothing is shown for a
page the browser already holds (the client cache, a prefetch that has arrived), for Back and Forward, for a move
that changes only the query or the locale, or for a path another page takes (`/chat/new` beside
`/chat/[channelId]`). A navigation that fails or is overtaken gets the page back with its state.

The fallback shown is the one the server drew for the path being left, so one that draws from its arguments would
show the old values. Only `page()` takes the option; a layout refuses it at definition.

**Upgrading.** Nothing to change: a `.loading()` without the option behaves as before.
