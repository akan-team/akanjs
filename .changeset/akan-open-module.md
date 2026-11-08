---
"akanjs": patch
"@akanjs/language": patch
"@akanjs/vscode": patch
---

**Akan: Open the module side by side** in the VS Code / Cursor extension lays one module out as an editor grid: its constant, dictionary, document, service, signal and store files, in that order, two to a column.

- It takes the active file's module, a service module (`lib/_<name>/`) or scalar (`lib/__scalar/<name>/`) included, or asks you to pick one. Generated `lib/__lib/` folders are never offered.
- In the Studio panel, a pinned node with a module also offers **Open module**, which does the same and keeps Studio in a column of its own to the right. A browser tab does not show the button.
- The Studio panel now keeps its page while hidden or moved, so the pinned node and the module you navigated to survive a tab switch.
- The Akan Graph files a component or enum under `lib/_<service>/` in the `<service>` module, as it already did the service's methods and actions.
- The panel's handshake lists the messages the extension accepts (`open`, `workflow`, `module`), and Studio shows a panel button only for what is listed.
