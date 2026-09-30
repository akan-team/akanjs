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

Prints the workspace structure, down to each module, in a form an agent can read.

Reports where the workspace breaks Akan conventions, with a repair command for each problem.

Starts the Akan MCP server, so an editor's agent can ask for the same information itself.

Registers that server in the project config of Cursor, Claude Code and Codex.

Calls one MCP tool from the terminal and prints what an agent would get.

A short note beside each module: what it owns and the rules its code cannot show.

Model Context Protocol, the standard way a coding agent calls tools outside itself.

Standard input and output. The editor starts the server as a child process; no port is opened.

How far the MCP server may go: `readonly` reads, `plan` writes plan files, `apply` edits source.

A JSON file under `.akan/workflows/plans/` that describes a change before anything is edited.

Hand an agent the whole workspace at the start of a task.

Hand it one module, with the module's abstract.

Check conventions before and after an agent's change.

Let the editor's agent ask for context whenever it needs it.

See exactly what one MCP tool returns.

`akan context [--format <format>] [--app <app>] [--module <module>]`

Prints the workspace structure in a form an agent can read. Use it when an external coding agent, CI job or IDE extension needs a summary of the workspace.

Output format: `json` for tools, `markdown` for people or a chat prompt.

Lists only this app. Every library and package still appears.

Lists only modules of this name and puts each `*.abstract.md` body before its file list.

What it prints

Apps, libraries and packages, each module's files, generated-file patterns, validation commands.

Abstract scope

Without `--module`, an abstract shows only its path and headings; `--module` adds the body.

Privacy

It never prints `.env` values or secrets.

`akan doctor [--format <format>] [--strict <boolean>] [--ios <boolean>]`

Reports where the workspace drifts from Akan conventions, such as stray files or missing module abstracts. Run it before and after an agent's change; `--format json` gives a machine-readable result.

Output format. Use `json` for agent validation loops and CI.

Turns recommended conventions into errors; today that is a missing module abstract.

Checks only the mobile config instead, for a placeholder bundle id Apple has likely claimed.

Status

`failed` when any diagnostic is an error, `passed` otherwise.

Also printed

Generated-file freshness, a repair command per problem, and the validation commands.

Boolean options

`--strict` alone means `--strict true`.

`akan mcp [--mode <readonly|plan|apply>]`

Starts the Akan MCP server over stdio. An MCP-aware coding agent asks it for workspace and module context, guidelines, command explanations and diagnostics. `--mode` decides how far the agent may go, and the default is the narrowest.

`readonly` only reads; `plan` may also write a plan file; `apply` may also edit source.

plan mode

Adds `list_workflows`, `explain_workflow` and `plan_workflow`, which write only a plan file.

apply mode

Adds `apply_workflow`, `run_validation` and the repair tools, so it edits source.

Workflow policy

`AGENTS.md` tells agents to plan with `--mode plan`, apply with `--mode apply`, prefer workflows.

Module context

`get_module_context` returns the module abstract first, then the module's file list.

Where to run

Start it from the workspace root; the server reads the workspace from its current folder.

`akan mcp-install [target] [--force <boolean>] [--mode <readonly|plan|apply>]`

Registers the Akan MCP server in the project config of Cursor, Claude Code and Codex. Other servers in those files are kept; only the `akan` entry is written.

Which tool to register. Leave it off to register all three.

Replaces an `akan` entry that differs. Without it the command stops with an error.

The mode the editor starts `akan mcp` in. The default here is `apply`, not `readonly`.

Writes `.cursor/mcp.json`. The entry moves into the opened workspace folder first.

Writes `.mcp.json`. The entry moves into `$CLAUDE_PROJECT_DIR` first.

Writes `.codex/config.toml`. Start Codex from the workspace root, since the entry does not move.

New workspaces

`akan create-workspace` runs this for all three with `--force`, so it starts in `apply` mode.

`akan mcp-call <tool> [--mode <readonly|plan|apply>] [--args <json>] [--format json]`

Calls one Akan MCP tool from the terminal and prints its JSON result. It runs the same code as the server without the stdio protocol, so it shows exactly what an agent would get.

The tool name, such as `list_apps` or `plan_workflow`.

The mode to call in. A tool that the mode does not carry fails.

The tool's arguments as one JSON object. Wrap it in single quotes in the shell.

Output format. `json` is the only one.

Real calls

Nothing is simulated: `plan_workflow` writes a plan file and `apply_workflow` edits source.

error

warning

An app root holds a file or folder that the app layout does not allow.

The same check for a library root.

A module lacks a required file, such as its `*.signal.ts`.

warning (error with `--strict`)

A module has no `*.abstract.md`.

A field in `*.constant.ts` has no label in the module's dictionary.

`AGENTS.md` was written by an older framework release than the one installed.

`AGENTS.md` carries no version stamp, so its age is unknown.

A recipe list in an `AGENTS.md` misses a recipe or names one that is gone.

An inline `className` repeats a recipe's look instead of using the recipe.

warning (`--ios` only)

A mobile target still uses a placeholder bundle id.

Read the workspace

Typed, read-only context lookup. Agents are told to read with this first.

The same summary `akan context --format json` prints.

The apps, each with its modules.

Every module across apps and libraries.

One module with its abstract body. Pass `app` when two apps share the module name.

One Akan guideline by name, the same text as `akan guideline show`.

A short explanation of one `akan` command.

The `akan doctor` result. Given a plan or changed files, it separates old problems from new.

The validation commands, the report formats and the tool list of each mode.

Plan a change

The workflows that exist.

One workflow's inputs, predicted changes and checks.

Writes a plan file and returns its `planPath` for `apply_workflow`.

Apply and repair

Carries out a stored plan and names what to validate next.

Runs the validation commands for a plan or an apply report.

Refreshes generated files, like `akan repair generated`.

Organizes imports, like `akan repair imports`.

Reports what a module is missing, like `akan repair module-shape`.

The Akan framework guide.

The workspace summary, as JSON.

The apps, as JSON.

Every module, as JSON.

One guideline. There is one entry per guideline.

One module's abstract text. It can be read by URI but is not listed.

Plan, Apply, Validate

The loop the `plan` and `apply` tools run, and the CLI command behind each tool.

Writes and refreshes `AGENTS.md`, the fix for a stale agent guide.

What goes in a module abstract, the file `context` and `doctor` look for.

Your App's MCP Server

The `/mcp` endpoint your app serves to its users' agents, a different server from `akan mcp`.

Context CLI

These commands hand the workspace to coding agents, CI jobs and IDE tools. Run each one from the workspace root.

Command

Words Used On This Page

Term

Which One To Run

`context` hands the workspace over once; `mcp` lets the agent keep asking. `--mode` on `mcp` decides what that agent may change.

When you want to

Run

What doctor Checks

Each diagnostic carries a code, a level and the file it points at. Most also carry the command that fixes it, such as `akan repair module-shape`.

Code

Level

Meaning

MCP Tools And Resources

The tools `akan mcp` offers grow with `--mode`. A wider mode keeps every tool of the narrower one.

Tool

Offered in this mode

Not offered

Resources

Besides tools, the server offers read-only documents that an agent opens by URI, in every mode.

Related Pages

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

