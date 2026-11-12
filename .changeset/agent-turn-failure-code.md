---
"akanjs": minor
"use-agentic": patch
---

A failed agent turn now names a code a host can branch on, beside the message it already sent, which is unchanged. No upgrade step is needed: the fields are new.

- The relay's `error` event and `AgentTurnStream.failure` carry `code`, named the way a failed MCP tool call is: by the body the relay would have answered with before its stream opened, so a failure, a 5xx included, reads the same code either side of it. That is the dictionary key in the body, else its code token, else the status's name. The token is an `AkanError`'s own code when its JSON carries it, as a generalized answer always does, or the code a third-party error's own JSON carries. A 401 or 403 takes no key, and a guard's is named by its status alone. `SignalFailure.codeOf(error, status)` holds that rule, and a failed MCP tool call is now named through it too.
- `use-agentic`'s `RunnerEvent` error gains an optional `code`. `httpRunner` reads it from a stream's error event and keeps it only when it is a dictionary key or one camelCase token. A failure answered before the stream opens is named by its JSON body's bounded code, whether or not the body carries a message, else by its status. A 401 or 403 takes no dictionary key there either, so a refusal or a 5xx reads the code a streamed `error` event names for it. WIRE.md states that rule, and the two cases where the akan server still names a failure differently.
- The in-page chat keeps the key as `code` after translating the message. The session records it on the failed assistant message as `ChatMessage.errorCode`, which a host reads and the transcript never sends back.
