# Code CLI

- Source: /references/cli/code
- Mirror: /llms/pages/references/cli/code.md
- Section: references
- Category: references
- Priority: P0

## Headings

- Code CLI (#code-cli)
- Profiles (#code-profiles)

## Content

Code CLI

Coding Tools

Reads, edits and runs commands in the workspace, and fetches and searches the web. The profile decides which are on.

Akan Tools

Context inspection, workflows, repair and validation: the same set `akan mcp` gives an editor's agent.

Akan Skills

Playbooks for the scaffolding chain, the store surface and the validation loop, read when a task needs one. Add your own in `~/.akan/code/skills` or `.akan/code/skills`.

Project Rules

The workspace's `AGENTS.md` sits in the context window, so the agent follows the conventions from the first turn.

Your terminal

An agent of its own that already carries the tools and rules above.

Your editor

A server that lets an editor's agent reach this workspace's tools.

Writes the rule files an editor's agent reads.

Serves akan wire frames over stdio for another process to drive.

Full-screen session

`--interactive`, or no prompt and no `--json` on a terminal

A chat you keep talking to. A prompt you pass becomes its first message.

One run

Any other call with a prompt

Runs the prompt to the end and prints each event. With `--json`, one JSON line per event.

Runs the Akan coding agent. Pass a prompt for one run, or leave it off to open the full-screen session.

What the agent should do. Left off on a terminal, the full-screen session opens.

Narrows the agent to one app, rooted at `apps/<app>`. Without it, the whole repo is in scope.

Picks what the agent may do: its tools, approvals and session storage. See Profiles below.

`<provider>/<id>`. Default: `deepseek/deepseek-flash`; without its key, the first available.

Prints one event per line as JSON. The full-screen session then opens only with `--interactive`.

Prints the model's reasoning alongside its output.

Serves the agent over stdio as akan wire frames for another process. Wins over every other mode.

Reopens a stored session by id in the full-screen session. Only `local` and `web` save sessions.

Opens the full-screen session even when a prompt is given, and sends that prompt first.

API key

Set `<PROVIDER>_API_KEY` in the workspace `.env` or your shell, e.g. `DEEPSEEK_API_KEY`.

resume id

When a full-screen session with a conversation closes, it prints `akan code --resume <id>`.

session files

Stored under `.akan/code/sessions` in the workspace. An id that is not there is an error.

denied paths

Every profile refuses `.env`, `.env.*`, `secrets/`, `*.pem` and `*.key`, whatever its allowlist.

Write & run

Web

Asks first

Saved

Waits for your answer (await)

The default. Everything is on, and nothing asks for approval.

A reviewer: only `read`, `ls`, `grep` and `find`, no `AGENTS.md`, sessions in memory.

Ends the turn and picks it up later (suspend)

An isolated container with nobody watching it: everything but MCP is on.

The reach of `local`, but every file write waits for your approval.

Architecture · Agentic

The agent that runs inside a rendered page instead of a terminal.

`akan agent install`, which writes the rule files an editor's agent reads.

The MCP server that hands this workspace's tools to an editor's agent.

What The Agent Brings

Not akan mcp, Not akan agent install

Command

Agent runs in

What it is

Three Ways To Run

One command runs in three modes, and the arguments pick one — there is no subcommand. They are checked in this order:

Mode

When

What you get

Profiles

Profile

On

Off

Related Pages

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

