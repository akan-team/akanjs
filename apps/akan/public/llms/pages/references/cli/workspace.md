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

These commands act on the whole workspace. Create a new one, check what changed, lint or sync every app and library at once, or make a machine-token key.

Command

- create-workspace: Create a new workspace with its first app, agent rules and MCP config.

- verify: Sync, lint, typecheck and build what changed in one run, printing only what failed.

- lint: Format and lint one app, library or package with Biome.

- lint-all: Sync every app and library, then lint every app, library and package.

- sync-all: Run `akan sync` on every library, then on every app.

- machine-keygen: Make the Ed25519 key a server signs machine tokens with.

Words Used On This Page

Term

- workspace root: The repo's top folder, the one holding `package.json`, `tsconfig.json` and an `apps/`, `libs/` or `pkgs/` folder.

- sync: Rescans an app or library and rewrites its generated files. `akan sync <app|lib>` does one.

- Biome: The formatter and linter Akan uses. Its rules live in `biome.json` at the workspace root.

Which One To Run

The upkeep commands differ in scope and in which checks they run.

- What changed

  - verify: You or an agent finished an edit. It checks what git reports as changed.

- One target

  - lint: You changed one app, library or package. A package is linted without a sync.

- Whole workspace

  - lint-all: Before a wide check, where generated files, app code and libraries must agree.

  - sync-all: Generated files look stale, or you changed the shared workspace setup.

Runs it

Skips it

`akan create-workspace <workspaceName> --app <app> [options]`

Create a new workspace and its first app in one go. It runs these steps in order:Write the workspace files into `<dir>/<workspaceName>`, or into `<dir>` itself when the name is `.`, with `--registry` saved to `.npmrc`. It writes nothing when the folder already holds a file it would overwrite, and names those files.Run `bun install`. `--init false` skips it.Install the `util` and `shared` libraries, only with `--libs true`.Create the first app, named by `--app`, with the sample `task` module and pages. `--sample false` leaves them out.Write the agent rules and the MCP config. `--agent-install` and `--mcp-install` turn them off.Make the first git commit, as `Akan.js <noreply@akanjs.com>` when git has no identity. In a folder another git repository tracks, it commits nothing and leaves the files to that repository. If git fails, the workspace still works; commit by hand.It ends by printing the next step: `cd <dir>/<workspaceName> && akan start <app>`.

- workspaceName (String, required): Organization or workspace name, lowercased with spaces as hyphens. `.` creates the workspace in `--dir` itself, named after that folder. Asked for when omitted.

- --app (String, required): Name of the first app, lowercased with spaces as hyphens. Asked for when omitted.

- --dir (String, default .): Parent folder, or the workspace folder itself when the name is `.`. Relative to where you run it unless absolute. Defaults to `local` if `USE_AKANJS_PKGS=true`.

- --libs (Boolean, default false): Also install `shared` and `util`. Leave it off, as recommended, to start from an empty workspace.

- --init (Boolean, default true): Run `bun install` once the files are written.

- --registry (String, default https://registry.npmjs.org): npm registry for the Akan packages, saved to `.npmrc`. `AKAN_NPM_REGISTRY` sets the default.

- --owner (String, default $GITHUB_OWNER): GitHub owner of the repo. When set, `README.md` gets an Open in GitHub Codespaces badge.

- --mcp-install (Boolean, default true): Register the Akan MCP server for Cursor, Claude Code and Codex in their project config files.

- --agent-install (Boolean, default true, -A): Write `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/akan.mdc` for coding agents.

- --sample (Boolean, default true): Generate the sample `task` module, pages and helpers in the first app. `false` starts from an empty app.

- --bun-dependency (String): Put `bun` at this version in `dependencies`, plus `build` and `start` scripts. Passed when Bun is not on `PATH`.

- where to run: Any folder works, because this command creates the workspace root.

- MCP config files: Cursor reads `.cursor/mcp.json`, Claude Code `.mcp.json`, and Codex `.codex/config.toml`.

- framework version: There is no `--tag`. Move a workspace to another release channel with `akan update --tag <tag>`.

- create-akan-workspace: `bunx create-akan-workspace` installs the matching `@akanjs/cli` globally, then runs this command.

`akan verify [targets] [--files <paths>] [--lint-only] [--no-build] [--max <n>] [--format <format>]`

Check a change in one run: sync, lint with fixes, typecheck, a fast build of each changed app, and the SSR check for a `.tsx` change. It prints one line when everything passes and one line per problem otherwise, so it is the one command to run after an edit.

- targets (String): Apps, libraries or packages, comma-separated, checked whole. Left out, what git reports as changed.

- --files (String, -F): Check these files, comma-separated, instead of the git changes.

- --lint-only (Boolean, default false): Lint only, the quick pass between edits: no sync, typecheck, build or SSR check.

- --build (Boolean, default true): Build each changed app once lint and typecheck pass. `--no-build` leaves it out.

- --max (Number, default 20): How many problem lines to print. `0` prints every one.

- --format (String, default text, text | json): `json` prints the whole result as one JSON line.

- output: One `verify ok` line on a pass; on a failure, `file:line:col CODE message` per problem.

- fixed N files: Lint rewrote those files on disk, so read them again before the next edit.

- repeated problems: The same code and message in several places prints once, with `(×N: …)` listing where.

- warnings: Print after the errors and never fail the run, the SSR check's included.

- akan.comment.added: A warning per code comment added since the last commit, so each one gets a second look. `--lint-only` skips it.

- build: Skipped while lint or typecheck reports an error.

- exit code: `0` passes, `1` fails, and `2` means a target is not in the workspace.

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

`akan machine-keygen <out>`

Write a new Ed25519 private key for machine tokens to `<out>` and print its public key. The server that issues tokens takes the private key as `AKAN_MACHINE_PRIVATE_KEY`; one that only verifies them takes `AKAN_MACHINE_PUBLIC_KEY`.

- out (String, required): File the private key is written to, with mode 600. An existing file is refused, never overwritten.

Rules Every Command Shares

**Run from the workspace root.** Every command here except `create-workspace` runs from the folder holding `package.json`, `tsconfig.json` and an `apps/`, `libs/` or `pkgs/` folder.

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
akan create-workspace . --app shop --dir app --sample false
akan create-workspace acme --app shop --libs true
```

### verify

```bash
akan verify
akan verify myapp
akan verify --lint-only
akan verify myapp,util --no-build
akan verify --max 0
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

### machine-keygen

```bash
akan machine-keygen ~/keys/akan-machine.pem
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

