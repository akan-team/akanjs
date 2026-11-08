---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/vscode": patch
---

Akan Studio now opens from the CLI and inside the editor.

- **`akan studio <app>`** prints the Studio URL of the app's running `akan start`. `--module`, `--view erd|signals` and `--editor vscode|cursor` pick what it shows, `--open` opens it in the browser, and `--format json` prints `{ url }`. It exits 1 when no dev server answers.
- **Akan: Open Akan Studio** in the VS Code / Cursor extension opens Studio in a panel beside the editor: the ERD, or the active module's signals when the active file sits in one. Clicking a name opens its source in the editor. When no dev server answers, it offers to start one in a terminal.
- **Framing:** Studio pages now allow `vscode-webview:` and `vscode-file:` frame ancestors in place of `X-Frame-Options: SAMEORIGIN`. A web page can't have either scheme, so it still can't frame Studio. Source clicks reach the panel only after it introduces itself from a `vscode-webview:` origin, and the extension opens only files inside the workspace.
