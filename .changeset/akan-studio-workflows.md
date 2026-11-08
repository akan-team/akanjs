---
"akanjs": patch
"@akanjs/vscode": patch
---

Akan Studio starts workflows from the diagram.

- **Clicking a node** in Studio lists the workflows it can start, aimed at its app and module:
  - a model: add a field, an enum field, a mutation or a slice, or create a UI surface;
  - a scalar: add a field or an enum field;
  - a slice key or a Filter query key: rename it;
  - with nothing pinned: a new module in the app.
- **In a browser,** a button copies the `akan workflow plan` command, with the inputs Studio cannot know left as placeholders.
- **In the VS Code / Cursor panel,** a button runs the workflow the way **Akan: Run a workflow…** does. The extension asks for the remaining inputs, shows the plan's files and waits for a confirm, then reloads Studio on the page you were on.
  - It accepts only these seven workflows, and only `app`, `module`, `slice` and `query` preset to plain identifiers.
  - Studio itself never writes: the dev server gained no write endpoint.
