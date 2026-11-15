---
"@akanjs/cli": patch
"@akanjs/devkit": patch
"akanjs": minor
---

`akan code` on the `local` profile can be told to stop asking about a command for the rest of the session, and one option turns asking off for a run.

- **A third answer.** The prompt before a shell command is now `approve? run: <command>  [y/n/a]`. `a` runs the command and stops asking about it until the session ends. What is remembered is the program, and the sub-command too for `git`, `bun`, `bunx`, `npm`, `npx`, `pnpm`, `yarn`, `akan`, `docker`, `kubectl`, `helm`, `gh`, `cargo` and `go`: allowing `git status` leaves `git diff` asked about, and allowing `bun test` leaves `bun x` asked about. A line of several commands (`&&`, `;`, `|`, `$(…)`, a subshell) runs unasked only once every command in it is allowed. `/allowed` lists what the session has allowed and `/allowed clear` forgets it. Nothing is written to disk, so a resumed, forked or reloaded session asks again.
- **Still asked every time**, with a prompt that offers only `[y/n]`: a networking command (`curl`, `wget`, `nc`, `ssh`, `scp`, `rsync`, …), `git push`, `rm`, a command that runs another (`sudo`, `env`, `timeout`, `xargs`, `sh`, `bash`, `eval`, `find -exec`, …), a line that writes a file with `>` or `>>`, and a line that cannot be split into its commands with confidence (a loop or `if`, backticks, a here-document, a program named by a variable).
- **`--no-ask`.** `akan code --no-ask` runs the session without asking before a shell command or a network request: the same as `--no-ask-commands --no-ask-network`. It prints one line at start saying so. It changes nothing else: secret files stay refused, this repo's MCP servers and extensions still wait for their own approval (`--trust-workspace`), the agent's own questions are still asked, and the `pod`, `review` and `web` profiles behave as before.

A program that drives `akan code --rpc` sees `remember: string[]` on an `approval` request when the session answer is offered, sends `{ "type": "approve", "approvalId": …, "approved": true, "remember": "session" }` to give it, and reads the names on `approval_resolved.remembered`. A host that sends only `approved` keeps working as before.

**Upgrading.** No step is needed: the three wire fields in `akanjs/common` (`CodeAgentApprovalRequest.remember`, the `approve` command's `remember`, `approval_resolved.remembered`) and `CodeTranscriptPart`'s `remembered` are optional additions.
