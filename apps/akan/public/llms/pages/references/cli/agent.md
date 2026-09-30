# Agent

- Source: /references/cli/agent
- Mirror: /llms/pages/references/cli/agent.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Agent CLI (#agent-cli)

## Content

Agent

agent guide

The workspace's `AGENTS.md`, the one file holding the conventions every coding agent follows.

pointer

A short file that only tells one tool to read `AGENTS.md`, such as `CLAUDE.md`.

managed block

The part of `AGENTS.md` between the `akan:agent` markers. The command rewrites only this part.

scoped guide

`apps/<app>/AGENTS.md` or `libs/<lib>/AGENTS.md`: the UI recipes that scope can import.

Guide · only the block is rewritten, so `--force` is never needed

Rebuilds the managed block, then writes every app and library guide.

Pointers · written whole, so an existing file needs `--force`

Claude Code imports the guide through `@AGENTS.md`.

An always-on Cursor rule that points at the guide.

Default

All three, in the order `cursor`, `agents-md`, `claude`.

Workspace

The repo name, and the apps, libraries and packages in it.

Conventions

The coding rules, including the lint rules that break the build.

Onboarding

The workspace layout, everyday commands, where each kind of code goes, and common pitfalls.

Start clean

Present only while samples from `create-workspace` remain, and lists which ones to delete.

Module abstracts

Read a module's `*.abstract.md` first, and update it when the module's behavior changes.

Generated files

Which generated files never to hand-edit, and the commands that regenerate them.

Recipes

The `akanjs/ui` recipes. App and library recipes are in the scoped guides.

MCP workflow policy

Prefer an Akan workflow to a direct edit, run through MCP or the CLI.

Validation

The `sync`, `lint`, `typecheck`, `test`, `build`, `doctor` and `quality` commands.

Framework guide

Where each kind of code belongs, the module flow, and how to theme and re-skin the UI.

Before you finish

A checklist before handing work back: lint, typecheck, sync, SSR share, comments and abstracts.

Rule Files

Standing instructions an agent carries into every session: how code is written here.

MCP Server

Answers live questions, and in apply mode runs the workflows the rules point at.

`akan agent install [target] [--force]`

Write the agent guide and its pointers into the workspace. Run it again after upgrading Akan: only the managed block of `AGENTS.md` is rewritten, so your own text stays.

Always `install`, the only action. Left out, the CLI asks for it; any other value is an error.

Which file to write. Left out, it writes all three.

Overwrite an existing `CLAUDE.md` or `.cursor/rules/akan.mdc`. `AGENTS.md` never needs it.

Writes `AGENTS.md`, then each `apps/<app>/AGENTS.md` and `libs/<lib>/AGENTS.md`.

Writes `.cursor/rules/akan.mdc`, an `alwaysApply` rule that points at `AGENTS.md`.

Writes `CLAUDE.md`: an `@AGENTS.md` import plus the comment rule, restated.

existing AGENTS.md

Only the block between the markers is replaced. A file with no markers gets the block appended.

existing pointer

Without `--force`, the command stops there with an error and skips the files after it.

scoped guides

`akan sync <name>` keeps them current, and `akan lint` fails while one is stale.

skipped scope

One whose config cannot load yet is skipped; `akan sync <name>` writes it later.

scoped CLAUDE.md

Each app and library also gets a `CLAUDE.md` pointer, but only when it has none.

staleness

`bun update` never rewrites the block; `akan agent install agents-md` refreshes it.

version stamp

The block records the release that wrote it, and `akan doctor` compares it with yours.

flag position

Put `--force` last: `--force claude` reads `claude` as its value, so all three run unforced.

Agent CLI

Words Used on This Page

Term

What Each Target Writes

Name a target, or leave it out to write all three. The guide is refreshed in place; a pointer is written whole.

Target

Writes

Does not

When to Run It

What the Guide Holds

The managed block is rebuilt from the installed Akan release and your workspace. Top to bottom, it holds:

Section

Rules and MCP

Related Pages

`--agent-install` writes these files while it creates the workspace.

Registers the Akan MCP server for Cursor, Claude Code and Codex.

doctor checks

What `agent-guide-stale` and `agent-guide-unstamped` mean.

Prints the deeper guides that `AGENTS.md` points to.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

