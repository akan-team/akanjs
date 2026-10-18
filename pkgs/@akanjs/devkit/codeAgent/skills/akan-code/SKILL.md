---
name: akan-code
description: "Answer a question about `akan code` itself — how to add or remove an MCP server, sign one in, switch model, fork or resume a session, what the slash commands and keys are, and where its files live. Read this before telling anyone how to use this tool."
---

# akan code — the manual

This is the tool the user is talking to right now. When they ask how to do something *with it* — rather than
with their code — answer from here, and quote the exact gesture: the slash command to type, or the file to
edit. Do not guess a command; everything this tool offers is listed below.

You cannot type a slash command yourself. They are the host's, not yours — say which one to type. You *can*
edit the files named below, which is the useful half of most of these answers: write the change, then say
which command makes it take effect.

## MCP servers

Declared in **`~/.akan/code/mcp.json`**, which every repo reads, or in this repo's **`.akan/code/mcp.json`**,
which wins a name both declare — in the same `mcpServers` shape Claude, Cursor and VS Code already write, so a
block can be pasted across rather than translated. VS Code's `servers` spelling is read too, and
whichever key the file already uses is the one a write goes back into.

```jsonc
{
  "mcpServers": {
    "github":   { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] },
    "linear":   { "url": "https://mcp.linear.app/sse" },
    "internal": { "url": "https://…/mcp", "headers": { "x-api-key": "…" } },
    "old":      { "command": "x", "disabled": true }
  }
}
```

A `url` is an http server; anything else is a command with its argv. `env` passes variables to a stdio
server, `headers` goes on every http request (a server behind a static token needs nothing else), and
`disabled: true` keeps an entry without connecting it.

From the prompt:

```
/mcp                      what is declared, what connected, and how many tools each gave
/mcp <name>               the tools that one server published
/mcp add <name> <command> [args…]
/mcp add <name> <https://…>
/mcp add --local <name> … this repo's file only, not ~/.akan/code/mcp.json
/mcp remove <name>        this repo's file first, else ~/.akan/code/mcp.json
/mcp remove --local <name>
/mcp login <name>         OAuth, in the browser
/mcp logout <name>        forget the token, leaving the server declared
/mcp reload               reopen this session so the file takes effect
```

**A server added now is not reachable until the session reloads.** The tool allowlist is fixed when the
session is created, so `add`, `remove`, `login` and `logout` all reload by themselves — a session that has
said nothing yet has nothing on disk to reopen, and says so. If you edit `mcp.json` yourself, tell the user to
run `/mcp reload`.

`/mcp remove` on a name both files declare takes this repo's entry and leaves the home file's in force; its
notice says so, and running it again removes that one too.

Sign-in is discovered, not configured: the server's `401` names its resource metadata, that names the
authorization server, and most hosted servers register a client on demand — so a url is usually the whole
entry. For a provider that issues client ids by hand, add `"oauth": { "clientId": "…", "scope": "…" }`.
Tokens are stored per server in `~/.akan/code/mcpAuth.json` at mode 0600, never in the repo, and refreshed
silently — at connect when one has expired, and mid-session when a server refuses one, after which the call is
retried once. When a refresh cannot fix it, `/mcp` shows `sign-in needed` and that server's tools answer with
`/mcp login <name>` until the user signs in; the sign-in reloads the session, which brings the server back.

## Sessions

Stored under `.akan/code/sessions` — project history, so a second checkout of the same repo has its own.

- `←` at the start of the prompt lists past sessions; enter reopens the chosen one.
- `akan code --resume <id>` (`-R`) reopens one from the shell.
- `/fork [name]` continues the conversation twice: the copy takes over here, and the notice names the command
  that reopens the original.
- `/name <text>` names this one, which is what the session list is read by.
- `/peers` lists other `akan code` sessions running in this workspace; `/msg <peer> <text>` hands one a
  message.
- `/clear` wipes the screen and keeps the conversation; `/compact [notes]` shortens what the model carries.
- `/autocompact <percent>` compacts on its own once the window is that full, in steps of 10 (`/autocompact 60`);
  `100` is the default, which waits until 32k remain for the reply. `akan code --compact-at 60` (`-c`) starts
  with it, and a share under the 20k every compaction keeps is refused.

## Model, effort, keys

- `/model <provider>/<id>`, e.g. `/model deepseek/deepseek-v4-pro`. `/effort <level>` for how hard it thinks.
- A provider is authorized by **`<PROVIDER>_API_KEY`** — `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`. The
  workspace's own `.env` is read as well as the environment, and a key found there is used for the run and
  never copied anywhere.
- Credentials and the model catalogue live in `~/.akan/code/` (`auth.json`, `models.json`). **`AKAN_CODE_HOME`
  moves the whole directory** — for a container with no home, or a checkout that wants its own.

## What the agent reads, and how to change it

- Every `AGENTS.md` / `CLAUDE.md` from the workspace root down to the working directory, `.cursorrules`, and
  any `.cursor/rules/*.mdc` that applies unconditionally (`alwaysApply: true`, or no frontmatter at all).
  Edit those to change how this agent behaves in this repo — they are the files the editor beside it reads.
- Skills: drop a `<name>/SKILL.md` into `.akan/code/skills`. Extensions: `.akan/code/extensions`. Neither is
  read from a home directory, so a session behaves the same in two checkouts.

## Keys

```
enter send · shift+enter newline · ↑↓ move (history at the edges) · ←→ move
esc interrupt · pgup/pgdn scroll · ^c quit · tab completes a slash command
@ completes a file in this repo · wheel scrolls the transcript (hold shift to select text instead)
cmd+v attaches an image from the clipboard · ^v does too, without the terminal in the way
```

Most terminals send the same byte for enter and shift+enter, so the key only arrives where the terminal can
say which was pressed. In VS Code, bind it with `workbench.action.terminal.sendSequence` and a `text` of
`"\\\u001b\r"`; iTerm2 calls the same thing "Send Text". Either spelling of that sequence works here, and
the backslash a shell would read as a line continuation never reaches the prompt.

## Starting it

```
akan code                       open the session
akan code "<prompt>"            run one turn and print the answer
akan code -i "<prompt>"         open the session with the prompt already sent
--app <name>                    narrow the agent to one app
--profile local|pod|review|web  what it may do (default local)
--model <provider>/<id>         --thinking, --json, --rpc, --resume <id>
--compact-at <percent>          compact once the window is this full (10, 20, … 100)
```

`review` reads and never writes, loads no project context files, and keeps no session on disk. `pod` has
nobody in front of it: it cannot ask a question. MCP is off in both.

## The rest of the commands

`/help` prints all of this list · `/tools` what this session can call · `/agents` what a sub-agent may be and
what one may spend · `/thinking` shows or folds the reasoning · `/abort` stops the running turn · `/quit`.
