# memo Abstract
Memo is the minimal app's end-to-end fixture for a desktop app that carries its server: a note with an optional image
stored through the util lib's blob storage.

## Rules
- minimal has no accounts, so every memo endpoint is anonymous and guarded by `LocalOrEdge`: it answers on a developer's
  server (`local`) and on a desktop app's carried server (`edge`), never in any other operation mode, and never over
  MCP. The one `Public` memo endpoint is `isMemoOpen`, which answers `LocalOrEdge`'s verdict as a boolean, so a screen
  can leave memo out without a refused call, which would log an ERROR line. It is `mcp: false`, yet a `showTrips`
  call's briefing attaches its answer.
- The memo pages' `.guard()` answers not-found when `isMemoOpen` is `false`, as on a built server (`cloud`), and the
  detail guard then reads the memo, so a missing id answers not-found too. It asks the server, not `getEnv()`: a
  desktop app's client is built as `cloud` while its carried server runs as `edge`. An MCP listing runs the guards with
  no arguments, so both memo apps are listed only where memo is open; the detail guard reads `memoId` after the check,
  so there `showTripNote` stays listed and its call decides.
- The trips page shows its Trip notes link unless `isMemoOpen` answers `false`; a call that fails or takes over 3 s
  shows it. It asks without the visitor's session or address, so `/trips` can stay in the route result cache, a
  fallback render included, until the entry expires. Every render's call then shares the server's own address, so
  `isMemoOpen` takes no rate limit.
- `imageUrl` is written only by `attachMemoImage`, as a URL relative to the server that stored the image; a page on
  another origin resolves it against the server (`resolveServerUrl`).
- An attached image is a PNG, JPEG, WebP or GIF of at most 5 MB, stored under a name made from that type; the uploaded
  file name is not kept.
- Removal is soft: a removed memo keeps its row with `removedAt` set, and its image stays in storage.
- The public list (`inPublic`) is live: a memo created, renamed or removed reaches every open screen showing the list
  without a refetch.
