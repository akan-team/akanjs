# The turn wire

`httpRunner` speaks this contract. Any backend that answers it can drive an `AgentSession` — the session, the
tools, and the loop stay in the client; the server serves exactly one stateless model turn per request.

## Request

`POST <url>` with `content-type: application/json`:

```jsonc
{
  "messages": [
    { "role": "user", "text": "Trim the intro scene" },
    { "role": "assistant", "text": "", "toolCalls": [{ "id": "c1", "name": "setSceneSeconds", "args": { "seconds": 4 } }] },
    { "role": "tool", "toolResults": [{ "id": "c1", "name": "setSceneSeconds", "changes": [{ "name": "totalSeconds", "value": 39 }] }] }
  ],
  "tools": [
    {
      "name": "setSceneSeconds",
      "description": "Change this scene's length in seconds",
      "parameters": { "type": "object", "properties": { "seconds": { "type": "number" } }, "required": ["seconds"], "additionalProperties": false },
      "needsConfirm": false
    }
  ],
  "context": [{ "kind": "screen", "scopes": [{ "path": "scene-s1", "label": "Intro", "kind": "scene" }] }],
  "instructions": "You are editing a video project."   // optional
}
```

- `messages` is the whole transcript in `ChatMessage` shape (`types.ts`). The server maps it to its provider's
  format and maps the answer back; it never executes a tool — `tools` is a schema catalogue, not an offer.
- A message flagged `"summary": true` stands in for the earlier messages a client-side compaction replaced. It is
  history, not something the user said, so a backend that can frame it as one — a system message — should.
- **Every `toolCalls` entry is answered by a `toolResults` entry of the same `id`, and every result answers a call
  the request carries.** The client holds that invariant (`Transcript.sanitize`) because provider dialects refuse
  a transcript that breaks it; a backend can map calls to results by id without checking for holes. A call the
  client stopped before running arrives answered with an `error`, not missing.
- A message may carry `error` — a turn that failed, recorded where every other failure is recorded. No provider
  format has a field for it, so **fold it into the text you send**: an assistant turn that reaches the model
  saying nothing is one the model repeats.
- `context` blocks are host vocabulary. The server forwards them to the model as data, framed as data.
- Everything is JSON-serializable by contract; a tool whose `result` is not is the tool's bug.

## Attachments

A message may carry files in `attachments` (`MessageAttachment`, `types.ts`) — one of `data` (base64 bytes), `url`,
or `text` (already-extracted content), plus `name` and `mimeType`, and an optional `ref`:

```jsonc
{ "role": "user", "text": "What does this chart say?",
  "attachments": [{ "name": "q3.png", "mimeType": "image/png", "data": "iVBORw0KG…" }] }
```

They are content, not instructions, and the server frames them the way it frames `context`. **A backend must not
silently drop one its model cannot read** — a file the model never saw is a file it invents an answer about. Replace
it with a note in the message text saying which file was not read and why, so the model can say so and ask for
another form. `text` is readable by every provider by definition, which is what makes an extracted PDF work against
a text-only model.

`ref` is the host's own handle on the file — a file id, a storage key — opaque to everything in between. A backend
carries it and never reads it; it is not shown to the model, and a tool the host published is what spends it.
Without one, a host that stores its uploads has to identify a file by name and size, which collides for two crops
of one export.

Nothing here is stored: the wire carries the bytes for exactly one turn's request.

## Response

`200` with a single JSON object:

```jsonc
{
  "text": "Trimmed. Anything else?",                                  // optional
  "toolCalls": [{ "id": "c2", "name": "renderProject", "args": {} }], // optional
  "stop": "end",                                                      // "end" | "toolUse"; defaults from toolCalls
  "usage": { "input": 18230, "output": 41 },                          // optional
  "limits": { "window": 128000, "output": 8192 }                      // optional
}
```

`usage` is what the provider counted for this turn — `input` the whole prompt, cached part included. `limits` is
what the backend knows about its model: `window` the context window, `output` the answer ceiling it requests. Send
each only when it is known; a guessed window is worse than none. With them the session compacts before the prompt
outgrows the window, measured by the provider's own count rather than by a character estimate; without them it
falls back to its transcript ceiling alone.

Any non-2xx status is surfaced to the session as one error event and ends the turn; a string `message` or
`error` field in a JSON body becomes that event's message verbatim, and any other body is not interpreted. A
message that is a code rather than a sentence may be accompanied by a flat `data` object of strings and numbers —
the values whoever resolves the code interpolates into its text; a host that does not know the code shows the
message as it stands.

**A refusal because the prompt no longer fits the window carries `"overflow": { "limit": 128000 }`** (`limit` only
when the provider named it). It is the one refusal a session can answer by itself: it summarizes the transcript and
asks again, once, and remembers the window for the rest of the conversation. Flag nothing else with it — a rate
limit flagged as overflow compacts a conversation that fit.

## Streaming

The same endpoint may answer `text/event-stream` instead when the request's `accept` names it: one `RunnerEvent`
(`types.ts`) JSON object per SSE `data:` line, ending with the `done` event. A failure after the stream opened
travels as one `error` event — the status line is already gone by then. `usage` and `limits` ride the `done` event
and `overflow` the `error` event, in the same shapes as above. `httpRunner` sends
`accept: text/event-stream, application/json` and branches on the response's content type, so a server that never
streams keeps answering the single JSON object above unchanged.
