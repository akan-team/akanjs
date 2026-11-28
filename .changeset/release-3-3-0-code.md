---
"@akanjs/code": minor
---

The `akan code` agent ships as `@akanjs/code`, so a workspace that never runs `akan code` installs no LLM provider SDKs.

- `akan code` stays a CLI command. It loads `@akanjs/code` from the workspace, then from the CLI's own install, and only at exactly the CLI's version; when it is missing it names the command to run (`bun add -d @akanjs/code@<version>`), and offers to run it in a terminal. `akan update` pins it with the other Akan packages.
- `@akanjs/code` is the SDK entry the `@akanjs/cli/code` subpath was, and `@akanjs/code/host` the light entry `akan code` loads first. The engine exports leave `@akanjs/devkit/codeAgent`, which keeps the shipped skills and `akanCodePaths`.
- On the `local` profile a session asks before it runs a shell command: `approve? run: <command>  [y/n/a]`, where `a` stops asking about that command until the session ends (`/allowed` lists them, `/allowed clear` forgets them). A networking command, one that sends something out of the machine, `rm` and a line that cannot be split into its commands are asked about every time. `--no-ask-commands` runs commands unasked, and `--no-ask` drops the network questions too.
- A program that drives `akan code --rpc` receives an `approval` event for each command, with `remember: string[]` when the session answer is offered, and answers `{ "type": "approve", "approvalId": …, "approved": true, "remember": "session" }`.
