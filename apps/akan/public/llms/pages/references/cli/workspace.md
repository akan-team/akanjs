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

Workspace CLI

These commands act on the whole workspace. Create a new one, and lint or sync every app and library at once.

Command

- create-workspace: Create a new workspace with its first app, agent rules and MCP config.

- lint: Format and lint one app, library or package with Biome.

- lint-all: Sync every app and library, then lint every app, library and package.

- sync-all: Run `akan sync` on every library, then on every app.

Words Used On This Page

Term

- workspace root: The repo's top folder, the one holding `package.json`, `tsconfig.json` and `.env`.

- sync: Rescans an app or library and rewrites its generated files. `akan sync <app|lib>` does one.

- Biome: The formatter and linter Akan uses. Its rules live in `biome.json` at the workspace root.

Which One To Run

The three upkeep commands differ in scope and in whether they lint after the sync.

- One target

  - lint: You changed one app, library or package. A package is linted without a sync.

- Whole workspace

  - lint-all: Before a wide check, where generated files, app code and libraries must agree.

  - sync-all: Generated files look stale, or you changed the shared workspace setup.

Runs it

Skips it

`akan create-workspace <workspaceName> --app <app> [options]`

Create a new workspace and its first app in one go. It runs these steps in order:Write the workspace files into `<dir>/<workspaceName>`, with `--registry` saved to `.npmrc`.Run `bun install`. `--init false` skips it.Install the `util` and `shared` libraries, only with `--libs true`.Create the first app, named by `--app`.Write the agent rules and the MCP config. `--agent-install` and `--mcp-install` turn them off.Make the first git commit. If git fails, the workspace still works; commit by hand.It ends by printing the next step: `cd <dir>/<workspaceName> && akan start <app>`.

- workspaceName (String, required): Organization or workspace name, lowercased with spaces as hyphens. Asked for when omitted.

- --app (String, required): Name of the first app, lowercased with spaces as hyphens. Asked for when omitted.

- --dir (String, default .): Parent folder, relative to where you run it. Defaults to `local` if `USE_AKANJS_PKGS=true`.

- --libs (Boolean, default false): Also install `shared` and `util`. Leave it off, as recommended, to start from an empty workspace.

- --init (Boolean, default true): Run `bun install` once the files are written.

- --registry (String, default https://registry.npmjs.org): npm registry for the Akan packages, saved to `.npmrc`. `AKAN_NPM_REGISTRY` sets the default.

- --owner (String, default $GITHUB_OWNER): GitHub owner of the repo. When set, `README.md` gets an Open in GitHub Codespaces badge.

- --mcp-install (Boolean, default true): Register the Akan MCP server for Cursor, Claude Code and Codex in their project config files.

- --agent-install (Boolean, default true, -A): Write `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/akan.mdc` for coding agents.

- where to run: Any folder works, because this command creates the workspace root.

- MCP config files: Cursor reads `.cursor/mcp.json`, Claude Code `.mcp.json`, and Codex `.codex/config.toml`.

- framework version: There is no `--tag`. Move a workspace to another release channel with `akan update --tag <tag>`.

- create-akan-workspace: `bunx create-akan-workspace` installs the matching `@akanjs/cli` globally, then runs this command.

`akan lint <app|lib|pkg> [--fix <boolean>] [--max-diagnostics <n>]`

Format and lint one app, library or package with Biome. Fixes are written by default, and an app or library is synced first. After Biome come the three checks under Notes.

- app|lib|pkg (String, required): App, library or package name. Picked from a list when omitted.

- --fix (Boolean, default true): Write the formatter and lint fixes. With `--fix false` it only reports.

- --max-diagnostics (Number, default 200): How many diagnostics Biome prints before it truncates. `0` removes the limit.

- theme contrast: Fails when a color pair in `page/styles.css` misses the WCAG contrast threshold.

- recipes: Fails when a recipe in `ui/Recipe` has no variant or flag to choose.

- agent index: Fails when the recipe index in an app's or library's `AGENTS.md` is stale. `akan sync` fixes it.

`akan lint-all [--fix <boolean>] [--max-diagnostics <n>]`

Sync every app and library, then lint every app, library and package. Each one gets the same checks as `lint`. Run it before a wide check where generated files, app code and shared libraries must agree.

- --fix (Boolean, default true): Write the formatter and lint fixes. With `--fix false` it only reports.

- --max-diagnostics (Number, default 200): How many diagnostics Biome prints before it truncates. `0` removes the limit.

`akan sync-all`

Run `akan sync` on every library, then on every app. Use it when generated files look stale, or after a change to the shared workspace setup.

Rules Every Command Shares

**Run from the workspace root.** Every command here except `create-workspace` runs from the folder holding `package.json`, `tsconfig.json` and `.env`.

**Boolean options.** `--fix` on its own means true. To turn an option off, give the value: `--fix false`.

**Short flags.** Each option also answers to its first letter (`-f` for `--fix`) unless its row shows another letter, such as `-A`.

**Verbose output.** `-v` shows the output of each process the command runs, which a spinner normally hides.

Related Pages

CLI Commands

How to read a signature, and the options every command takes.

Syncs one app or library, the step these commands repeat for all of them.

Refreshes the agent rules that `create-workspace` wrote.

Moves the workspace to another framework version or release channel.

## Code Examples

### create-workspace

```bash
akan create-workspace acme --app shop
akan create-workspace acme --app shop --dir projects --init false
akan create-workspace acme --app shop --libs true
```

### lint

```bash
akan lint myapp
akan lint util --fix false
akan lint myapp --max-diagnostics 0
```

### lint-all

```bash
akan lint-all
akan lint-all --fix false
akan lint-all --max-diagnostics 0
```

### sync-all

```bash
akan sync-all
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

