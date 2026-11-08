---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"@akanjs/vscode": patch
---

Akan Studio draws the Change Map.

- **The Changes view** (`/_akan/studio?view=changes`) draws what changed since HEAD forked from the default branch, or since `since=<rev>`, uncommitted work included.
  - Components, store actions, signals, service methods, queries, models, scalars, enums and guards are laid out in flow order and outlined as added, removed or changed. The fields that changed are listed inside their model.
  - The unchanged nodes a change calls, or is called by, are drawn dimmed. The changed files no node covers are listed under the diagram.
  - Only this app's and the libraries' nodes are drawn. `module=` scopes the map to one module.
  - A revision git does not know is shown as a message on the page.
- **`akan studio <app> --view changes [--since <rev>]`** prints its URL.
- **Akan: Open the Change Map** in the VS Code / Cursor extension opens it beside the editor.
