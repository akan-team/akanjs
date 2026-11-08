---
"@akanjs/vscode": patch
---

The editor extension can now run `akan verify` and the Akan workflows.

- **Akan: Verify this app or library** saves open files and verifies the active file's app or library, or what git reports as changed. What failed is listed in Problems, and editing a file clears its entries.
- **Akan: Run a workflow…**, with **Create a module…** and **Add a field…** as shortcuts, asks for the workflow's inputs and shows the files the plan would change. It applies the plan once you confirm. The app and module start from the active file.

The commands run the workspace's own akan CLI: the root `akan` script in the akanjs repository, or the installed `@akanjs/cli` elsewhere. They need a trusted workspace.
