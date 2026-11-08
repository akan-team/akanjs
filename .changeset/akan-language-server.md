---
"@akanjs/language": patch
---

`@akanjs/language` now ships `akan-language-server`, an LSP server over stdio that answers definition, hover and references for the names Akan.js derives (`fetch.initMemoInPublic`, `st.do.setNameOnMemo`, `this.memoService.listByName`). It is for editors without the Akan extension, such as Neovim and Helix: run it next to TypeScript's server and the editor merges the answers. The README has both configurations; add the package to the workspace so `bunx --no-install akan-language-server` runs that copy.

- It indexes the nearest folder at or above the editor's root whose `apps/*` or `libs/*` holds an `akan.config.ts`, so an editor rooted at `apps/<app>` still sees every lib.
- Open buffers win over the disk, and messages are handled in order, so a request is answered against the buffer it was sent with. A file changed on disk is reread when the client supports watched-file registration, watched from the indexed root when the client supports relative patterns.
- It runs on Node or Bun and loads the `typescript` installed next to it.
