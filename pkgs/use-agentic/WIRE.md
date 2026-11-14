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
- A `toolResults` entry whose call threw may carry `code` beside `error`: a dictionary `Err`'s key
  (`<module>.error.<key>`), else the thrown error's own `code` (an `AkanError`'s). It is a bounded token, never
  prose, and never on a `taint: "source"` tool's result. **Send it to the model with `error`**, so the model can tell
  a refusal it can fix from one it cannot by more than the wording. A client that sends no `code` sends what it
  always did.
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

### A tool result's files

A `toolResults` entry may carry `attachments` of the same shape — a picture the call looked at, which its `result`
cannot hold: that reaches the model as JSON text, so a URL in it is read as letters and base64 as a wall of them.

```jsonc
{ "role": "tool", "toolResults": [{ "id": "c3", "name": "viewImage", "result": "Attached card.jpg: 782×962, sent as 782×962 JPEG.",
  "attachments": [{ "name": "card.jpg", "mimeType": "image/jpeg", "data": "/9j/4AAQ…" }] }] }
```

The same rules apply, and a provider format with no place for a file inside a tool result is still no reason to
drop one. Hand it to the model in the nearest place it reads — a chat-completions `tool` message carries text alone,
so the pictures follow the turn's tool messages in one user message, each named after the call that returned it —
and replace what it cannot read with a note **in the attachment's place**, as a `text` attachment of the same name:
a tool message has no text of its own for a note to join.

The client sends a tool's file as bytes only in the latest turn. One returned before the user's last message arrives
as such a note, telling the model to call the tool again, since a picture costs a thousand tokens or more on every
turn it rides.

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
`error` field in a JSON body becomes that event's message verbatim, else the message is
`Agent turn failed: <status>`. A message that is a code rather than a sentence may be accompanied by a flat `data`
object of strings and numbers — the values whoever resolves the code interpolates into its text; a host that does
not know the code shows the message as it stands.

The event also carries `code`, read from a JSON body whether or not it has a message: the dictionary key
(`<module>.error.<key>`) in the body's `error`, `message` or `code`, else its `code` when that is one camelCase
token, else the status's name (`unauthorized`, `forbidden`, `tooManyRequests`, `internalError`, or `http<status>`
for a status with no name). A 401 or 403 takes no dictionary key: it is its `code` token, else its status's name. A
body's `code` shaped otherwise, such as a proxy's `ECONNRESET`, is dropped rather than passed on, and a body that is
not JSON, such as a proxy's HTML page, leaves the status's name. A 5xx is no exception: its token is taken too, and
on the akan server it comes from the failed error's own JSON when that carries one, which can be a third-party
library's rather than the server's own. The bound is what keeps prose out of it.

A server names a failure inside the stream by this same rule, applied to the body it would have answered with, so a
host sees one code whether the failure came before or after the stream opened. The akan server does, with two
exceptions. In detailed mode (development, or `AKAN_ERROR_DETAIL=1`) a generalized JSON answer's `error` is the raw
message, which reads as a key over JSON when it is one. And an app's own forwarded `AkanError` 401 or 403 whose
JSON carries a code is named by that code over JSON but by its status in the stream; none of the framework's own
errors is such a refusal. The code is what a host branches on, since the message may reach it already translated.
The session keeps it on the failed assistant message as `errorCode`, which is never sent back.

**A refusal because the prompt no longer fits the window carries `"overflow": { "limit": 128000 }`** (`limit` only
when the refusal named it). With `requested` beside it, both are in the refusal's own unit — a byte cap included —
and the session scales its own estimate of the refused prompt by their ratio; `limit` alone is a window in tokens. It
is the one refusal a session can answer by itself: it summarizes the transcript and asks again, once, and remembers
the window for the rest of the conversation. Flag nothing else with it — a rate
limit flagged as overflow compacts a conversation that fit.

## Streaming

The same endpoint may answer `text/event-stream` instead when the request's `accept` names it: one `RunnerEvent`
(`types.ts`) JSON object per SSE `data:` line, ending with the `done` event. A failure after the stream opened
travels as one `error` event — the status line is already gone by then. `usage` and `limits` ride the `done` event
and `overflow` and `code` the `error` event, in the same shapes and bounds as above, `code` named by the rule above.
`httpRunner` sends `accept: text/event-stream, application/json` and branches on the response's content type, so a
server that never streams keeps answering the single JSON object above unchanged.
