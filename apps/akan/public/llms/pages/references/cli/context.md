# Context

- Source: /references/cli/context
- Mirror: /llms/pages/references/cli/context.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Context CLI (#context-cli)
- What doctor Checks (#doctor-checks)
- MCP Tools And Resources (#mcp-tools)

## Content

Context

`akan context [--format <format>] [--app <app>] [--module <module>]`

Prints the workspace structure in a form an agent can read. Use it when an external coding agent, CI job or IDE extension needs a summary of the workspace.

- --format (String, default markdown, markdown | json): Output format: `json` for tools, `markdown` for people or a chat prompt.

- --app (String, nullable): Lists only this app. Every library and package still appears.

- --module (String, nullable): Lists only modules of this name and puts each `*.abstract.md` body before its file list.

- What it prints: Apps, libraries and packages, each module's files, generated-file patterns, validation commands.

- Abstract scope: Without `--module`, an abstract shows only its path and headings; `--module` adds the body.

- Privacy: It never prints `.env` values or secrets.

`akan doctor [--format <format>] [--strict <boolean>] [--ios <boolean>]`

Reports where the workspace drifts from Akan conventions, such as stray files or missing module abstracts. Run it before and after an agent's change; `--format json` gives a machine-readable result.

- --format (String, default text, text | json): Output format. Use `json` for agent validation loops and CI.

- --strict (Boolean, default false): Turns recommended conventions into errors; today that is a missing module abstract.

- --ios (Boolean, default false): Checks only the native config instead, for a placeholder bundle id Apple has likely claimed.

- Status: `failed` when any diagnostic is an error, `passed` otherwise.

- Also printed: Generated-file freshness, a repair command per problem, and the validation commands.

- Boolean options: `--strict` alone means `--strict true`.

`akan mcp [--mode <readonly|plan|apply>]`

Starts the Akan MCP server over stdio. An MCP-aware coding agent asks it for workspace and module context, guidelines, command explanations and diagnostics. `--mode` decides how far the agent may go, and the default is the narrowest.

- --mode (String, default readonly, readonly | plan | apply): `readonly` only reads; `plan` may also write a plan file; `apply` may also edit source.

- plan mode: Adds `list_workflows`, `explain_workflow` and `plan_workflow`, which write only a plan file.

- apply mode: Adds `apply_workflow`, `run_validation` and the repair tools, so it edits source.

- Workflow policy: `AGENTS.md` tells agents to plan with `--mode plan`, apply with `--mode apply`, prefer workflows.

- Module context: `get_module_context` returns the module abstract first, then the module's file list.

- Where to run: Start it from the workspace root; the server reads the workspace from its current folder.

`akan mcp-install [target] [--force <boolean>] [--mode <readonly|plan|apply>]`

Registers the Akan MCP server in the project config of Cursor, Claude Code and Codex. Other servers in those files are kept; only the `akan` entry is written.

- target (String, default all, cursor | claude | codex | all): Which tool to register. Leave it off to register all three.

- --force (Boolean, default false): Replaces an `akan` entry that differs. Without it the command stops with an error.

- --mode (String, default apply, readonly | plan | apply): The mode the editor starts `akan mcp` in. The default here is `apply`, not `readonly`.

- Cursor: Writes `.cursor/mcp.json`. The entry moves into the opened workspace folder first.

- Claude Code: Writes `.mcp.json`. The entry moves into `$CLAUDE_PROJECT_DIR` first.

- Codex: Writes `.codex/config.toml`. Start Codex from the workspace root, since the entry does not move.

- New workspaces: `akan create-workspace` runs this for all three with `--force`, so it starts in `apply` mode.

`akan mcp-call <tool> [--mode <readonly|plan|apply>] [--args <json>] [--format json]`

Calls one Akan MCP tool from the terminal and prints its JSON result. It runs the same code as the server without the stdio protocol, so it shows exactly what an agent would get.

- tool (String, required): The tool name, such as `list_apps` or `plan_workflow`.

- --mode (String, default readonly, readonly | plan | apply): The mode to call in. A tool that the mode does not carry fails.

- --args (String, nullable): The tool's arguments as one JSON object. Wrap it in single quotes in the shell.

- --format (String, default json, json): Output format. `json` is the only one.

- Real calls: Nothing is simulated: `plan_workflow` writes a plan file and `apply_workflow` edits source.

error

warning

Context CLI

These commands hand the workspace to coding agents, CI jobs and IDE tools. Run each one from the workspace root.

Command

- context: Prints the workspace structure, down to each module, in a form an agent can read.

- doctor: Reports where the workspace breaks Akan conventions, with a repair command for each problem.

- mcp: Starts the Akan MCP server, so an editor's agent can ask for the same information itself.

- mcp-install: Registers that server in the project config of Cursor, Claude Code and Codex.

- mcp-call: Calls one MCP tool from the terminal and prints what an agent would get.

Words Used On This Page

Term

- *.abstract.md: A short note beside each module: what it owns and the rules its code cannot show.

- MCP: Model Context Protocol, the standard way a coding agent calls tools outside itself.

- stdio: Standard input and output. The editor starts the server as a child process; no port is opened.

- mode: How far the MCP server may go: `readonly` reads, `plan` writes plan files, `apply` edits source.

- workflow plan: A JSON file under `.akan/workflows/plans/` that describes a change before anything is edited.

Which One To Run

`context` hands the workspace over once; `mcp` lets the agent keep asking. `--mode` on `mcp` decides what that agent may change.

When you want to

Run

- Hand an agent the whole workspace at the start of a task. — akan context --format json

- Hand it one module, with the module's abstract. — akan context --module user

- Check conventions before and after an agent's change. — akan doctor --strict --format json

- Let the editor's agent ask for context whenever it needs it. — akan mcp-install

- See exactly what one MCP tool returns. — akan mcp-call list_apps

What doctor Checks

Each diagnostic carries a code, a level and the file it points at. Most also carry the command that fixes it, such as `akan repair module-shape`.

Code

Level

Meaning

- `app-root-unknown-entry` — error — An app root holds a file or folder that the app layout does not allow.

- `lib-root-unknown-entry` — error — The same check for a library root.

- `module-shape-invalid` — error — A module lacks a required file, such as its `*.signal.ts`.

- `module-abstract-missing` — warning (error with `--strict`) — A module has no `*.abstract.md`.

- `dictionary-label-missing` — warning — A field in `*.constant.ts` has no label in the module's dictionary.

- `agent-guide-stale` — warning — `AGENTS.md` was written by an older framework release than the one installed.

- `agent-guide-unstamped` — warning — `AGENTS.md` carries no version stamp, so its age is unknown.

- `recipe-index-stale` — error — A recipe list in an `AGENTS.md` misses a recipe or names one that is gone.

- `recipe-inline-duplicate` — warning — An inline `className` repeats a recipe's look instead of using the recipe.

- `mobile-appid-placeholder` — warning (`--ios` only) — A native target still uses a placeholder bundle id.

**doctor never fails the process.** It exits with code 0 even when the status is `failed`, so a CI gate must read `status` from `--format json`.

MCP Tools And Resources

The tools `akan mcp` offers grow with `--mode`. A wider mode keeps every tool of the narrower one.

Tool

- Read the workspace

  - inspect_akan_context: Typed, read-only context lookup. Agents are told to read with this first.

  - get_workspace_summary: The same summary `akan context --format json` prints.

  - list_apps: The apps, each with its modules.

  - list_modules: Every module across apps and libraries.

  - get_module_context: One module with its abstract body. Pass `app` when two apps share the module name.

  - get_guideline: One Akan guideline by name, the same text as `akan guideline show`.

  - explain_command: A short explanation of one `akan` command.

  - doctor_workspace: The `akan doctor` result. Given a plan or changed files, it separates old problems from new.

  - get_validation_contract: The validation commands, the report formats and the tool list of each mode.

- Plan a change

  - list_workflows: The workflows that exist.

  - explain_workflow: One workflow's inputs, predicted changes and checks.

  - plan_workflow: Writes a plan file and returns its `planPath` for `apply_workflow`.

- Apply and repair

  - apply_workflow: Carries out a stored plan and names what to validate next.

  - run_validation: Runs the validation commands for a plan or an apply report.

  - repair_generated: Refreshes generated files, like `akan repair generated`.

  - repair_imports: Organizes imports, like `akan repair imports`.

  - repair_module_shape: Reports what a module is missing, like `akan repair module-shape`.

Offered in this mode

Not offered

Resources

Besides tools, the server offers read-only documents that an agent opens by URI, in every mode.

- akan://docs/framework: The Akan framework guide.

- akan://workspace/summary: The workspace summary, as JSON.

- akan://workspace/apps: The apps, as JSON.

- akan://workspace/modules: Every module, as JSON.

- akan://guidelines/<name>: One guideline. There is one entry per guideline.

- akan://workspace/modules/<module>/abstract: One module's abstract text. It can be read by URI but is not listed.

Related Pages

- Plan, Apply, Validate — The loop the `plan` and `apply` tools run, and the CLI command behind each tool.

- akan agent — Writes and refreshes `AGENTS.md`, the fix for a stale agent guide.

- model.abstract.md — What goes in a module abstract, the file `context` and `doctor` look for.

- Your App's MCP Server — The `/mcp` endpoint your app serves to its users' agents, a different server from `akan mcp`.

## Code Examples

### context

```bash
akan context
akan context --format json
akan context --app akan
akan context --module user
```

### doctor

```bash
akan doctor
akan doctor --format json
akan doctor --format json --strict true
akan doctor --ios
```

### mcp

```bash
akan mcp
akan mcp --mode plan
akan mcp --mode apply
```

### mcp-install

```bash
akan mcp-install
akan mcp-install claude
akan mcp-install cursor --mode plan --force
```

### mcp-call

```bash
akan mcp-call list_apps
akan mcp-call get_module_context --args '{"module":"user"}'
akan mcp-call plan_workflow --mode plan --args '{"workflow":"add-field","inputs":{"app":"demo"}}'
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

