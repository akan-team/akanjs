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

`akan code` runs an AI coding agent in your terminal that already knows this workspace. Ask it to add a field and run the validation loop, with no editor, no MCP client setup, and no explaining the module conventions first.

Put a model key in the workspace `.env`, e.g. `DEEPSEEK_API_KEY` for the default model.

Run `akan code` to start a session, or `akan code "<prompt>"` for one run.

What The Agent Brings

- Coding Tools — read · write · edit · ls · grep · find · bash — Reads, edits and runs commands in the workspace, and fetches and searches the web. The profile decides which are on.

- Akan Tools — plan_workflow · apply_workflow · run_validation — Context inspection, workflows, repair and validation: the same set `akan mcp` gives an editor's agent.

- Akan Skills — akan-module · akan-store · akan-validate · … — Playbooks for the scaffolding chain, the store surface and the validation loop, read when a task needs one. Add your own in `~/.akan/code/skills` or `.akan/code/skills`.

- Project Rules — AGENTS.md — The workspace's `AGENTS.md` sits in the context window, so the agent follows the conventions from the first turn.

Not akan mcp, Not akan agent install

Command

Agent runs in

What it is

- akan code — Your terminal — An agent of its own that already carries the tools and rules above.

- akan mcp — Your editor — A server that lets an editor's agent reach this workspace's tools.

- akan agent install — Your editor — Writes the rule files an editor's agent reads.

Three Ways To Run

One command runs in three modes, and the arguments pick one — there is no subcommand. They are checked in this order:

Mode

When

What you get

- RPC — `--rpc` — Serves akan wire frames over stdio for another process to drive.

- Full-screen session — `--interactive`, or no prompt and no `--json` on a terminal — A chat you keep talking to. A prompt you pass becomes its first message.

- One run — Any other call with a prompt — Runs the prompt to the end and prints each event. With `--json`, one JSON line per event.

**Without a terminal, or with `--json`, a missing prompt is an error.** In a pipe or a CI step, always pass one: `akan code "add a comment module"`.

**One run is the shape for scripts.** It exits when the prompt is done, and `--json` makes its output machine-readable.

`akan code [prompt] [--app <app>] [--profile <local|pod|review|web>] [--model <provider/id>] [--json <boolean>] [--thinking <boolean>] [--rpc <boolean>] [--resume <id>] [--interactive <boolean>]`

Runs the Akan coding agent. Pass a prompt for one run, or leave it off to open the full-screen session.

- prompt (String): What the agent should do. Left off on a terminal, the full-screen session opens.

- --app (String, nullable · flag: -a): Narrows the agent to one app, rooted at `apps/<app>`. Without it, the whole repo is in scope.

- --profile (String, default local, local | pod | review | web · flag: -p): Picks what the agent may do: its tools, approvals and session storage. See Profiles below.

- --model (String, nullable · flag: -m): `<provider>/<id>`. Default: `deepseek/deepseek-flash`; without its key, the first available.

- --json (Boolean, default false, flag: -j): Prints one event per line as JSON. The full-screen session then opens only with `--interactive`.

- --thinking (Boolean, default false, flag: -t): Prints the model's reasoning alongside its output.

- --rpc (Boolean, default false, flag: -r): Serves the agent over stdio as akan wire frames for another process. Wins over every other mode.

- --resume (String, nullable · flag: -R): Reopens a stored session by id in the full-screen session. Only `local` and `web` save sessions.

- --interactive (Boolean, default false, flag: -i): Opens the full-screen session even when a prompt is given, and sends that prompt first.

- API key: Set `<PROVIDER>_API_KEY` in the workspace `.env` or your shell, e.g. `DEEPSEEK_API_KEY`.

- resume id: When a full-screen session with a conversation closes, it prints `akan code --resume <id>`.

- session files: Stored under `.akan/code/sessions` in the workspace. An id that is not there is an error.

- denied paths: Every profile refuses `.env`, `.env.*`, `secrets/`, `*.pem` and `*.key`, whatever its allowlist.

Profiles

A profile bundles what the agent may do into one value, picked with `--profile`. It decides which tools exist, whether writes wait for approval, where sessions are kept, and how much of the project sits in the window.

Profile

Write & run

Web

MCP

Asks first

Saved

- Waits for your answer (await)

  - local: The default. Everything is on, and nothing asks for approval.

  - review: A reviewer: only `read`, `ls`, `grep` and `find`, no `AGENTS.md`, sessions in memory.

- Ends the turn and picks it up later (suspend)

  - pod: An isolated container with nobody watching it: everything but MCP is on.

  - web: The reach of `local`, but every file write waits for your approval.

On

Off

**await or suspend.** `await` holds the turn open until you answer. `suspend` ends the turn and reopens one with your answer, so it survives a process restart.

**Every profile carries the Akan tools and skills.** `review` gets only the Akan tools that change nothing.

**`web` asks before `write` and `edit` only.** `bash` never waits for approval.

**MCP servers come from two files.** `~/.akan/code/mcp.json` is yours and `.akan/code/mcp.json` is the checkout's; on a shared name the workspace entry wins.

**`--app` is a real boundary.** It moves the profile's root to `apps/<app>`, and file tools refuse any path outside it. That holds better than a prompt politely asking the agent to stay there.

**The deny list is not a sandbox for bash.** A command that names `.env` is refused, but a shell can still reach any path. The real boundary is the container the `pod` profile runs in.

Related Pages

- Architecture · Agentic — The agent that runs inside a rendered page instead of a terminal.

- Agent CLI — `akan agent install`, which writes the rule files an editor's agent reads.

- akan mcp — The MCP server that hands this workspace's tools to an editor's agent.

## Code Examples

### code

```bash
akan code
akan code "add a comment module to koyo"
akan code --app koyo
akan code "review the order flow" --profile review
akan code "add a topping field" --model deepseek/deepseek-flash --thinking true
akan code --resume <session-id>
akan code "summarize the diff" --json true
akan code --rpc true
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

