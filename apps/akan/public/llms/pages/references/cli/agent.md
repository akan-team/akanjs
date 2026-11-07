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

Agent CLI

`akan agent install` writes the rule files a coding agent reads before it touches your code: a short `AGENTS.md` for every agent, path rules and skills it loads when a task needs them, and pointers for Claude Code and Cursor. A convention is written once, and every agent reads the same copy.

Words Used on This Page

Term

- agent guide: The workspace's `AGENTS.md`: the short core every coding agent reads first.

- path rule: One area's full contract, such as `page/**`, loaded when a matching file is touched.

- skill: A procedure and its full guidelines, which an agent loads only when a task needs it.

- pointer: A short file that only tells one tool to read `AGENTS.md`, such as `CLAUDE.md`.

- managed block: The part of `AGENTS.md` between the `akan:agent` markers. The command rewrites only this part.

- generated marker: `<!-- akan:generated -->` in a rule or skill file. Delete it to make the file yours.

- scoped guide: `apps/<app>/AGENTS.md` or `libs/<lib>/AGENTS.md`: the UI recipes that scope can import.

What Each Target Writes

Name a target, or leave it out to write everything but the hooks. The guide is refreshed in place; the other files are written whole.

Target

Guide

Rules

Skills

Pointer

Hooks

- Guide · only the block is rewritten, so `--force` is never needed

  - agents-md: Rebuilds the block and the rules and skills it lists, then every app and library guide.

- Generated files · rewritten while they carry the marker

  - rules: Path rules for Claude Code, each with a Cursor rule pointing at it.

  - skills: Skills for Claude Code, and the same skills for Codex and other agents.

- Pointers · an existing one is kept unless you pass `--force`

  - claude: Claude Code imports the guide through `@AGENTS.md`.

  - cursor: An always-on Cursor rule that points at the guide.

- Opt-in · never part of `all`

  - hooks: Claude Code hooks that check every edit, merged into `.claude/settings.json`.

- Default

  - all: Everything except `hooks`.

Writes

Does not

**`--force` replaces the pointers and every generated file whole, marker or not.** Anything you added there is lost, so keep your own instructions in `AGENTS.md`, outside the `akan:agent` markers, or in a rule or skill file of your own.

When to Run It

**A new workspace already has them.** `create-workspace` runs `akan agent install all --force` unless you pass `--agent-install false`.

**After upgrading Akan.** `bun update` leaves these files as they were, so run `akan agent install`. Pointers that already exist are kept.

**When `akan doctor` warns.** `agent-guide-stale` means a release other than the installed one wrote the guide, and `agent-guide-unstamped` means it has no version stamp. `akan agent install` fixes both.

**To add one pointer.** Pass `claude` or `cursor` as the target. Codex and other agents that read `AGENTS.md` by themselves need none.

**To have Claude Code check its own edits.** `akan agent install hooks` refuses an edit to a generated file, lints each edited file, and runs `akan verify` over them before Claude Code stops.

What the Guide Holds

The managed block is rebuilt from the installed Akan release and your workspace. It stays short, since each full contract lives in a path rule or skill. Top to bottom, it holds:

Section

- Workspace: The repo name, and the apps, libraries and packages in it.

- Work loop: Read the abstract, prefer a workflow, sync after a file change, then run `akan verify` once.

- Change scope: Change only what the task needs, and follow the nearest established pattern.

- Looks wrong, is right: Patterns an agent tends to “fix” that are correct here, such as the class order Biome sorts.

- Rules that break the build: One line per lint rule, each naming the path rule with its full contract.

- Code style: TypeScript shape, naming, the language a user reads, and when to comment.

- Where code goes: The folder for each kind of code, and the command that creates it.

- Secrets: Never print or commit a secret; an `AKAN_PUBLIC_*` value reaches the browser.

- Path rules: Which rule file covers which files, and the skills an agent can load.

- Start clean: Present only while samples from `create-workspace` remain, and lists which ones to delete.

- Generated files: Which generated files never to hand-edit, and the commands that regenerate them.

Rules and MCP

Rules and the MCP server are kept apart on purpose. `create-workspace` installs both.

- Rule Files — Standing instructions an agent carries into every session: how code is written here. — akan agent install

- MCP Server — Answers live questions, and in apply mode runs the workflows the rules point at. — akan mcp-install

Related Pages

`--agent-install` writes these files while it creates the workspace.

Registers the Akan MCP server for Cursor, Claude Code and Codex.

doctor checks

What the `agent-guide-*` warnings mean.

Prints the guidelines that the skills carry, one at a time.

`akan agent install [target] [--force]`

Write the agent guide, its path rules, skills and pointers into the workspace. Run it again after upgrading Akan: only the managed block of `AGENTS.md` and the generated files are rewritten, so your own text stays.

- action (String, required): `install`. `hook` is what the installed hooks run, never typed by hand. Left out, the CLI asks.

- target (String, default all, cursor | agents-md | claude | rules | skills | hooks | all): Which files to write. Left out, everything except `hooks`.

- --force (Boolean, default false, -f): Overwrite an existing pointer, and a generated file whose marker you deleted.

- agents-md: Writes `AGENTS.md`, the path rules and the skills, then each app and library guide.

- rules: Writes `.claude/rules/akan/<name>.md`, and a `.cursor/rules/akan-<name>.mdc` pointing at each.

- skills: Writes each skill to `.claude/skills/` and `.agents/skills/`, its guidelines under `references/`.

- cursor: Writes `.cursor/rules/akan.mdc`, an `alwaysApply` rule that points at `AGENTS.md`.

- claude: Writes `CLAUDE.md`: an `@AGENTS.md` import plus the comment rule, restated.

- hooks: Adds its three hooks to `.claude/settings.json`; every other hook there stays.

- before an edit: An edit to a generated file is refused, with the source to edit and the sync to run instead.

- after an edit: The edited file is lint-fixed, and what lint cannot fix goes back to Claude Code.

- before stopping: `akan verify` runs over the session's edits; a failure sends Claude Code back once to fix it.

- existing AGENTS.md: Only the block between the markers is replaced. A file with no markers gets the block appended.

- existing pointer: Kept as it is without `--force`; the other targets still run.

- your own files: A rule or skill file without the generated marker is never removed, and rewritten only by `--force`.

- retired files: A generated rule or skill the installed release no longer ships is removed.

- scoped guides: `akan sync <name>` keeps them current, and `akan lint` fails while one is stale.

- skipped scope: One whose config cannot load yet is skipped; `akan sync <name>` writes it later.

- scoped CLAUDE.md: Each app and library also gets a `CLAUDE.md` pointer, but only when it has none.

- version stamp: The block records the release that wrote it, and `akan doctor` compares it with yours.

- flag position: Put `--force` last: `--force claude` reads `claude` as its value, so `all` runs unforced.

## Code Examples

### agent

```bash
akan agent install
akan agent install agents-md
akan agent install claude
akan agent install hooks
akan agent install all --force
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

