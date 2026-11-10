# memo Abstract
Memo is the minimal app's end-to-end fixture for a desktop app that carries its server: a note with an optional image
stored through the util lib's blob storage.

## Rules
- minimal has no accounts, so every memo endpoint is anonymous and guarded by `LocalOrEdge`: it answers on a developer's
  server (`local`) and on a desktop app's carried server (`edge`), never in any other operation mode, and never over
  MCP. The memo pages run a memo query in `.guard()`, so a built server (which runs as `cloud`) answers them
  not-found instead of failing the render in the browser; the guard asks the server, not `getEnv()`, because a
  desktop app's client is built as `cloud` while its carried server runs as `edge`. An MCP listing runs that guard
  too: the list page's `showTripNotes` app is listed only where memo answers, at the cost of one insight query per
  listing; the detail page's guard reads `memoId`, so `showTripNote` stays listed and its call decides. The one
  `Public` memo endpoint is `isMemoOpen`, which answers `LocalOrEdge`'s verdict as a boolean, so a screen can leave
  out a link to memo without a refused call: the trips page's `showTrips` load hides its Trip notes link only on
  `false` (a failed call shows it). It is `mcp: false`, yet a `showTrips` call's briefing attaches its answer.
- `imageUrl` is written only by `attachMemoImage`, as a URL relative to the server that stored the image; a page on
  another origin resolves it against the server (`resolveServerUrl`).
- An attached image is a PNG, JPEG, WebP or GIF of at most 5 MB, stored under a name made from that type; the uploaded
  file name is not kept.
- Removal is soft: a removed memo keeps its row with `removedAt` set, and its image stays in storage.
- The public list (`inPublic`) is live: a memo created, renamed or removed reaches every open screen showing the list
  without a refetch.
