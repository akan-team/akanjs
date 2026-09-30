# Workspace

- Source: /references/cli/workspace
- Mirror: /llms/pages/references/cli/workspace.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Workspace CLI (#workspace-cli)
- Rules Every Command Shares (#workspace-rules)

## Content

Workspace

Create a new workspace with its first app, agent rules and MCP config.

Format and lint one app, library or package with Biome.

Sync every app and library, then lint every app, library and package.

Run `akan sync` on every library, then on every app.

workspace root

The repo's top folder, the one holding `package.json`, `tsconfig.json` and `.env`.

Rescans an app or library and rewrites its generated files. `akan sync <app|lib>` does one.

The formatter and linter Akan uses. Its rules live in `biome.json` at the workspace root.

One target

You changed one app, library or package. A package is linted without a sync.

Whole workspace

Before a wide check, where generated files, app code and libraries must agree.

Generated files look stale, or you changed the shared workspace setup.

Write the formatter and lint fixes. With `--fix false` it only reports.

How many diagnostics Biome prints before it truncates. `0` removes the limit.

`akan create-workspace <workspaceName> --app <app> [options]`

Organization or workspace name, lowercased with spaces as hyphens. Asked for when omitted.

Name of the first app, lowercased with spaces as hyphens. Asked for when omitted.

Parent folder, relative to where you run it. Defaults to `local` if `USE_AKANJS_PKGS=true`.

Also install `shared` and `util`. Leave it off, as recommended, to start from an empty workspace.

Run `bun install` once the files are written.

npm registry for the Akan packages, saved to `.npmrc`. `AKAN_NPM_REGISTRY` sets the default.

GitHub owner of the repo. When set, `README.md` gets an Open in GitHub Codespaces badge.

Register the Akan MCP server for Cursor, Claude Code and Codex in their project config files.

Write `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/akan.mdc` for coding agents.

where to run

Any folder works, because this command creates the workspace root.

MCP config files

Cursor reads `.cursor/mcp.json`, Claude Code `.mcp.json`, and Codex `.codex/config.toml`.

framework version

There is no `--tag`. Move a workspace to another release channel with `akan update --tag <tag>`.

`bunx create-akan-workspace` installs the matching `@akanjs/cli` globally, then runs this command.

`akan lint <app|lib|pkg> [--fix <boolean>] [--max-diagnostics <n>]`

Format and lint one app, library or package with Biome. Fixes are written by default, and an app or library is synced first. After Biome come the three checks under Notes.

App, library or package name. Picked from a list when omitted.

theme contrast

Fails when a color pair in `page/styles.css` misses the WCAG contrast threshold.

recipes

Fails when a recipe in `ui/Recipe` has no variant or flag to choose.

agent index

Fails when the recipe index in an app's or library's `AGENTS.md` is stale. `akan sync` fixes it.

`akan lint-all [--fix <boolean>] [--max-diagnostics <n>]`

Sync every app and library, then lint every app, library and package. Each one gets the same checks as `lint`. Run it before a wide check where generated files, app code and shared libraries must agree.

`akan sync-all`

Run `akan sync` on every library, then on every app. Use it when generated files look stale, or after a change to the shared workspace setup.

Workspace CLI

These commands act on the whole workspace. Create a new one, and lint or sync every app and library at once.

Command

Words Used On This Page

Term

Which One To Run

The three upkeep commands differ in scope and in whether they lint after the sync.

Runs it

Skips it

Rules Every Command Shares

Related Pages

CLI Commands

How to read a signature, and the options every command takes.

Syncs one app or library, the step these commands repeat for all of them.

Refreshes the agent rules that `create-workspace` wrote.

Moves the workspace to another framework version or release channel.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

