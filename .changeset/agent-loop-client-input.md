---
"akanjs": minor
"@akanjs/cli": patch
---

`agentService.loop` bounds what a page sends into a run through `clientTools` and `answer`.

- **Tool definitions.** A run takes at most 128 client tools and 200,000 characters of their definitions, about twenty times what a screen lends today. Past either, the run ends with an `error` event whose `error` is `agent.error.clientToolsRefused` (status 413), with `data.limit` `"tools"` or `"chars"`, `data.max` and `data.sent`.
- **Writes.** A client tool counts as a write whatever `readOnly` it was sent with: `approve` sees `tool.readOnly: false`, and a run with no `approve` refuses it once tainted. Which client tools may run after a read is the app's to say, in `approve`, by name.
- **Answers.** Every part of an `answer` is bounded where it enters the transcript. Its `result`, its `error`, its `changes` taken as one value and a text attachment are each clipped at 20,000 characters, as a tool's result is. Its `code` is kept only when it is a failure code: a dictionary key or a camelCase token. Of its `attachments` the first four that carry `data` or `text` are kept, never a `url`, each with a `name` and a `mimeType` of at most 255 characters and under the 4 MiB ceiling a tool's file has.
- **Size caps.** A run that lists `clientTools` meets the relay's default size caps (`AgentRelayPolicy.defaultLimits`) on each of its turns, and ends with `agent.error.requestRefused` past them. `AgentTurnContext.loop` gains `client: true` on those turns, so a policy of the app's own can tell them apart. A run with no `clientTools` still skips the caps.

**Upgrading.** An app built on a 3.2.0 release candidate changes nothing unless it relied on one of these:

- A page that marked a tool `readOnly: true` in what it sent, to keep it callable after a read in a run with no `approve`: pass `approve` and allow that tool by name.
- A request policy set with `option.setAgentRequestPolicy` that returns loop rounds untouched keeps doing so; to cap the rounds of a run with client tools, return `AgentRelayPolicy.capped(request)` when `context.loop?.client` is set.
- An answer that carried a file by `url`: send its bytes as `data`, or have an endpoint tool return it.
