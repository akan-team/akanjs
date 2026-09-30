# memo Abstract
Memo is the minimal app's end-to-end fixture for a desktop app that carries its server: a note with an optional image
stored through the util lib's blob storage.

## Rules
- minimal has no accounts, so every memo endpoint is anonymous and guarded by `LocalOrEdge`: it answers on a developer's
  server (`local`) and on a desktop app's carried server (`edge`), never in any other operation mode, and never over
  MCP.
- `imageUrl` is written only by `attachMemoImage`, as a URL relative to the server that stored the image; a page on
  another origin resolves it against the server (`resolveServerUrl`).
- An attached image is a PNG, JPEG, WebP or GIF of at most 5 MB, stored under a name made from that type; the uploaded
  file name is not kept.
- Removal is soft: a removed memo keeps its row with `removedAt` set, and its image stays in storage.
