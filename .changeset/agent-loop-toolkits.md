---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`agentService.loop` takes `toolkits`, so a run over a large catalogue no longer sends every tool definition every round.

- **Shape.** `toolkits: { calendar: { description: "Read and edit the org calendar", tools: ["eventListInOrg", "updateEvent"] } }` groups names of `allow`. A tool in no toolkit is the core and is listed every round. `allow` still caps every toolkit.
- **Opening.** With toolkits set, the run lists one more tool, `openToolkit({ name })`. Its description names each toolkit that has a tool the account may see, with its `description`. The call is answered inside the loop with `{ opened, tools }`, and those tools are listed from the next round on. It never reaches `approve` or `untrusted`, and it does not count toward `budget.toolCalls`.
- **Refusals.** A call to a tool whose toolkit is closed is answered with an error that names the toolkit to open, with code `toolkitClosed`. An unknown toolkit name gets code `unknownToolkit`. A tool outside `allow` is still an unknown tool.
- **Resume and compaction.** A resumed run reopens every toolkit a stored `openToolkit` call opened without an error. A compaction summary now carries `toolkits`, which is new and optional on `AgentWireMessage`. Store messages whole, as you already do for `tainted`.
- **Validation.** A malformed `toolkits`, or an `allow` that names a tool `openToolkit` while toolkits are set, is an `error` before any model call.

`toolkits` is optional and changes nothing for a run without it, so no upgrade step is needed.
