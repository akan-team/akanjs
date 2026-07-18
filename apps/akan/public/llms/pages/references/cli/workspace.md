# Workspace

- Source: /references/cli/workspace
- Mirror: /llms/pages/references/cli/workspace.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Workspace CLI (#workspace-cli)

## Content

Workspace

Create a new Akan.js workspace and optionally bootstrap the first application in the same step. The command normalizes names to lowercase kebab-case and uses the selected update tag, install-lib choice, and initialization flag to prepare the repository.

Run lint and formatting for a selected app, library, or package target. `--fix` defaults to true, so the command applies formatter/linter fixes unless the option is explicitly disabled.

Run lint and formatting across the workspace instead of a single selected target. Use it before broader verification when generated surfaces, app code, and shared libraries should be checked together.

Refresh dependency and configuration surfaces for every app and library in the workspace. Use it when generated configuration looks stale or after changes that affect shared workspace setup.

Workspace CLI

Workspace commands create a new Akan.js workspace and keep the whole repository synchronized. Use them when you are starting a project, fixing generated surfaces, or applying lint across apps and libraries.

The commands below come from `workspace.command.ts`: `create-workspace`, `lint`, `lint-all`, and `sync-all`.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

