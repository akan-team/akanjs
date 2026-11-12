# memo Abstract
Memo is the minimal app's end-to-end fixture for a desktop app that carries its server: a note with an optional image
stored through the util lib's blob storage.

## Rules
- minimal has no accounts, so every memo endpoint is anonymous and guarded by `LocalOrEdge`: it answers on a developer's
  server (`local`) and on a desktop app's carried server (`edge`), never in any other operation mode, and never over
  MCP. The one `Public` memo endpoint is `isMemoOpen`, which answers `LocalOrEdge`'s verdict as a boolean, so a screen
  can leave memo out without a refused call, which would log an ERROR line. It is `mcp: false`, yet a `showTrips`
  call's briefing attaches its answer.
- The memo pages' `.guard()` answers not-found when `isMemoOpen` is `false`, so a built server (which runs as `cloud`)
  answers them not-found instead of failing the render in the browser; the detail page's guard then reads the memo,
  so a missing id answers not-found too. The guard asks the server, not `getEnv()`, because a desktop app's client is
  built as `cloud` while its carried server runs as `edge`. An MCP listing runs these guards with no arguments: both
  `showTripNotes` and `showTripNote` are listed only where memo is open, at one `isMemoOpen` call each per listing,
  and the detail guard reads `memoId` only after that check, so where memo is open `showTripNote` stays listed and its
  call decides. The trips page's `showTrips` load hides its Trip notes link only on `false`: a call that fails, or
  that has not answered within 3 s, shows it.
- `imageUrl` is written only by `attachMemoImage`, as a URL relative to the server that stored the image; a page on
  another origin resolves it against the server (`resolveServerUrl`).
- An attached image is a PNG, JPEG, WebP or GIF of at most 5 MB, stored under a name made from that type; the uploaded
  file name is not kept.
- Removal is soft: a removed memo keeps its row with `removedAt` set, and its image stays in storage.
- The public list (`inPublic`) is live: a memo created, renamed or removed reaches every open screen showing the list
  without a refetch.
