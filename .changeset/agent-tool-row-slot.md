---
"akanjs": minor
"@akanjs/cli": patch
---

The row a chat message draws for each tool call is now its own override slot, `AgentToolRow`, so an app can re-skin a tool call without replacing the whole `AgentBubble`.

- A component bound to `AgentToolRow` in `_overrides.tsx` gets `{ className?, name, args?, result?, progress? }`. `result` is absent while the call runs. `progress` is what a running call last reported about itself.
- The slot draws the calls in an assistant message and the results in a tool message. An `askUser` call is still drawn as its question.
- `DefaultToolRow` and `ToolRowProps` are exported from `akanjs/ui`, so a replacement can wrap the default.

The default row is unchanged, so no upgrade step is needed.
