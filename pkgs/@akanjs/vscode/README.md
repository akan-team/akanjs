# Akan.js for VS Code and Cursor

Akan.js builds many names from one source key: the slice key `inPublic` on `memo` becomes `fetch.initMemoInPublic`,
`memoListInPublic` and `st.do.refreshMemoInPublic`; a field `name` becomes `st.do.setNameOnMemo`; a query key `byName`
becomes `listByName` and `queryByName`. TypeScript keeps no declaration for such names, so go-to-definition finds
nothing. This extension adds the missing answers next to TypeScript's own (the bundled TypeScript or `tsgo`).

- **Go to definition** on a derived name opens the slice key, Filter query key, constant field, store state key,
  socket endpoint key or model class behind it. `srv.memo`, `sig.memo`, `db.memo` and `this.memoService` also open
  `MemoService`, `MemoSlice` and `MemoModel` instead of only the generated barrel.
- **Hover** names the source (`slice inPublic · guards: Public · live`) with a link to it.
- **Find references** on a source key lists every derived use.
- **CodeLens** above each slice, query, field, store state and socket endpoint shows how many places use it.

- **Rename** (F2) on a slice key or Filter query key renames it together with every name derived from it. F2
  anywhere else, a constant field included, stays TypeScript's rename.
- **Akan: Verify this app or library** saves open files and runs `akan verify` on the app or library of the
  active file, or on what git reports as changed, and lists what failed in Problems. Editing a file clears its entries.
- **Akan: Run a workflow…** (also **Create a module…** and **Add a field…**) asks for the workflow's inputs, shows
  the files its plan would change, and applies it once you confirm. The app and module start from the active file.
- **Akan: Open Akan Studio** opens the running `akan start`'s ERD beside the editor, or the active module's path
  from component to model. Clicking a name opens its source in the editor.
- **Akan: Open the Change Map** opens Studio on what changed since HEAD forked from the default branch, uncommitted
  work included, with each model, signal, method and component marked added, removed or changed.
  These commands run the workspace's akan CLI, so they need a trusted workspace.

The index is built from syntax alone, so it never waits for the type checker. In a trusted workspace the extension
uses the workspace's own `@akanjs/language` when one is installed, so its rules match the framework version.
