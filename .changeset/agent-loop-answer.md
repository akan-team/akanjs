---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`agentService.loop` takes the answer to a parked call as its own argument, `answer`, and accepts it only for the call the run parked on.

- `answer: { id, result }` or `{ id, error }` answers the call a run ended `awaiting` on with `client` or `question`: the first call of the last batch that nothing answered, and only when it is a client tool's or `askUser`'s. A page's `AgentClientTools.run(call)` result can be passed as it is.
- The run names the result after the call, whatever name was sent, hands it to `onMessage`, emits it as a `toolResult` event and runs the calls the batch has left.
- An endpoint tool's call is answered only by running it. An `answer` that names one, a call the run has not reached, or a call already answered ends the run with an `error` event whose `error` is `agent.error.answerRefused`, before anything runs. A resume without the `answer` carries on.
- Only `askUser`'s answer is exempt from the untrusted rule. A client tool's answer always taints the run.
- A run that ended `awaiting` with `connect`, on an `openToolkit` call for a remote the account has no connection to, is resumed in one of two ways. Once the user connected, resume with the stored messages and no `answer`: the run opens the remote itself. When the user declines, resume with `answer: { id, error }` for that call, which replaces appending `{ id, name: "openToolkit", error }` to the messages. The `error` only says that the user refused: the run stores a sentence of its own that names the remote, with the code `remoteDeclined`, as that call's result, and keeps none of the text sent. That sentence taints neither the run nor a later resume. A decline is accepted only for an `openToolkit` call that names a remote and is the first call of the last batch that nothing answered. An `answer` with a `result` for an `openToolkit` call is refused as `agent.error.answerRefused`: whether a connection exists is the server's to see.
- A stored result is read as the answer to the call its id names, under that call's name: a result stored under the name `askUser` no longer skips `untrusted` unless the call it answers is `askUser`'s.
- `messages` holds only the app's own user messages and what `onMessage` handed over. Never take `messages` from a request: store what `onMessage` hands out and pass from the client only `answer`, as a tool message a client wrote reads exactly like one the run stored.
- Pass `answer` only after an `awaiting` event with `client` or `question` named that call. `approve` is not asked about an answered call, as nothing runs on the server, so an answer given for a call `approve` deferred, or for one a run died before parking on, is stored as it stands.

**Upgrading.** An app built on a 3.2.0 release candidate that appends a tool message to `messages` before resuming must pass the answer instead:

```ts
// before
this.agentService.loop({ ...request, messages: [...stored, { role: "tool", toolResults: [{ id, name, result }] }] });
// after
this.agentService.loop({ ...request, messages: stored, answer: { id, result } });
```

The run stores the answer through `onMessage`, so do not store it yourself. An appended result is still read as a stored one, but nothing checks which call it answers: remove the append. Code that expects no `toolResult` event before the first model call of a resume now receives one for the answer.
