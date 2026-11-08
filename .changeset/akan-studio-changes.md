---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"@akanjs/vscode": patch
---

Akan Studio draws the Change Map.

- **The Changes view** (`/_akan/studio?view=changes`) draws what changed since HEAD forked from the default branch, or since `since=<rev>`, uncommitted work included.
  - Components, store actions, signals, service methods, queries, models, scalars, enums and guards are laid out in flow order and outlined as added, removed or changed. The fields that changed are listed inside their model.
  - The unchanged nodes a change calls, or is called by, are drawn dimmed. The changed files no node covers are listed under the diagram, each marked added, removed or changed.
  - Only this app's and the libraries' nodes are drawn. `module=` scopes the map to one module.
  - A revision git does not know is shown as a message on the page. The `since` you picked stays when you switch views.
  - The dev builder keeps the last map until the next save, so reloading the page does not read the workspace again.
- **`akan studio <app> --view changes [--since <rev>]`** prints its URL. `--since` without `--view changes` is an error.
- **Akan: Open the Change Map** in the VS Code / Cursor extension opens it beside the editor. The extension offers to start the app only when no dev server answers, not on any other `akan studio` failure.
