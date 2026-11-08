---
"@akanjs/language": patch
---

`@akanjs/language` now ships `akan-language-server`, an LSP server over stdio that answers definition, hover and references for the names Akan.js derives (`fetch.initMemoInPublic`, `st.do.setNameOnMemo`, `this.memoService.listByName`). It is for editors without the Akan extension, such as Neovim and Helix: run it next to TypeScript's server and the editor merges the answers. The README has both configurations.

- It indexes the folder holding `apps/` or `libs/` at or above the editor's root, so an editor rooted at `apps/<app>` still sees every lib.
- Open buffers win over the disk. A file changed on disk is reread when the client supports watched-file registration.
- It runs on Node or Bun and loads the `typescript` installed next to it.
