---
"@akanjs/cli": minor
"@akanjs/devkit": minor
"akanjs": minor
---

`akan code` on the default `local` profile now asks before it runs a shell command, as it already did before reaching an unlisted host. File reads, writes and edits are not asked about.

**Upgrading.** An interactive `akan code` session shows `approve? run: <command>  [y/n/a]` before each shell command; `a` answers yes and stops asking about that command until the session ends. Pass `--no-ask-commands` to run them unasked as before, or `--no-ask` to stop the network questions as well. A one-shot `akan code "<prompt>"` and a sub-agent have nobody to ask, so their commands run as before. A program that drives `akan code --rpc` on the `local` profile receives an `approval` event for each command and answers it with `approve`, as it does for the `web` profile's writes; `codeAgentPresets.local(root).approval` is now `"commands"`.
