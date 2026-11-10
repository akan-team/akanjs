---
"akanjs": minor
"use-agentic": patch
---

A failed agent turn now names a code a host can branch on, beside the message it already sent, which is unchanged. No upgrade step is needed: the fields are new.

- The relay's `error` event and `AgentTurnStream.failure` carry `code`, named the way a failed MCP tool call is. That is the `Err`'s dictionary key, else an `AkanError`'s own code, else the status's name. A guard's 401 or 403 is named by its status alone, and a 5xx never takes a duck-typed body's code. `SignalFailure.codeOf(error, status)` holds that rule, and a failed MCP tool call is now named through it too.
- `use-agentic`'s `RunnerEvent` error gains an optional `code`. `httpRunner` reads it from a stream's error event and keeps it only when it is a dictionary key or one camelCase token. A failure answered before the stream opens, a guard's refusal among them, is named by its body's bounded code, else by its status.
- The in-page chat keeps the key as `code` after translating the message. The session records it on the failed assistant message as `ChatMessage.errorCode`, which a host reads and the transcript never sends back.
