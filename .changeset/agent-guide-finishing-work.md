---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The agent guide tells a coding agent to finish the task and to write a final message a reader can follow.

- `AGENTS.md`'s managed block gains two sections. **Finishing Work**: carry the task to `verify ok`, treat a failing check or a stale generated file as an obstacle to work through (never by silencing the check), ask only when the work cannot go on, and confirm before a push, a deploy or a write to a shared database. **Reporting**: lead with the outcome, name every changed file, give each check's result line, and say what was left undone.
- A new workspace's `AGENTS.md` asks the agent to finish the task with a small marked workaround while a framework issue is drafted.
- The `akan-scaffold` skill builds the request without a supporting entity nobody asked for and says why one may be needed, instead of stopping to ask.
- `akan code` closes a turn that changed files with those files and what `akan_verify` said.
