---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`agentService.loop` can now ask the member a question and wait for the answer between runs, the way the in-page chat's `askUser` does.

- `ask: true` lists `askUser({ question, choices?, multiple? })`, with the in-page chat's own description and parameters.
- A call ends the run as `awaiting`, with `question: true` on the event. Calls written before it in the same batch have already run; calls written after it wait for the resume.
- Put the question to the member over your own transport. Append `{ id, name: "askUser", result }`, or an `error` when they dismiss it, and resume. A resume without the answer parks the call again. A resume without `ask` answers it as an unknown tool.
- `askUser` never reaches `approve` and counts as no tool call. `untrusted` never sees the answer, which is the member's own input.
- A call with no question is answered with an error and the run goes on.
- With `ask: true`, a `clientTools` entry named `askUser` is dropped, and an `allow` naming `askUser` is refused as an invalid argument.

The option is new and off by default, so no upgrade step is needed.
