---
"akanjs": minor
---

`agentService.loop` loads tools as a run needs them, so an app can give it many more tools without each one riding every round. Each option is off by default, and a run without them lists exactly what it listed before.

- `search: { limit?, keywords?, rank? }` lists `findTools({ query, limit? })`, which the run answers itself. It ranks the tools of closed toolkits the run may see and has not listed, by name, description and `keywords` (per tool, in the words people ask in; a word with a particle or an ending still matches its stem), returns `{ tools: [{ name, description }] }`, and lists those tools from the next round on, after the tools already listed, so a prompt cache's prefix holds. `rank(query, candidates)` replaces the built-in ranking. Like `openToolkit`, it never reaches `approve`, counts as no tool call and taints nothing. A resume lists again what stored calls and a compaction summary (`foundTools`) found, and a compaction drops a found tool the kept messages neither found nor called.
- `listed: string[]` names toolkits and tools listed from the first round on. They stay listed through compactions and `toolBudget`; a name the run may not see lists nothing.
- `AgentLoopToolkit.instructions` comes back in `openToolkit`'s result as `{ opened, tools, instructions }`, or is added to the instructions when `listed` opens the toolkit, so per-toolkit guidance can leave the always-on instructions.
- `toolBudget` caps the characters of tool definitions that opened toolkits and `findTools` keep listed. Past it, the least recently called or loaded tools come off the list before the next round, never one the last round loaded or called, and a toolkit left with none closes. A call to an unlisted tool is refused with how to list it again.
- `AgentLoopToolkit.asked: true` sends the toolkit's `openToolkit` to `approve` as a `needsConfirm` write, so an unattended run can park as `awaiting` before it opens; without `approve` it is refused. Until it is open, `findTools` neither finds its tools nor lists one a stored result or summary names, unless a toolkit not asked also holds it.

Upgrading: nothing is required. `findTools` becomes a reserved name when `search` is set, so a request whose `allow` names a tool by it is refused. A store that keeps compaction summaries field by field should keep `foundTools` beside `toolkits`.
