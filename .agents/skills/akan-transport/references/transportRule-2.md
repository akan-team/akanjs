<!-- akan:generated -->

## Calling Another Server

- **A server-side `fetch.clone({ origin })` opens no websocket unless `connect: true`**, and neither does a clone
  of such a clone: it makes one-off calls to another server, and a socket it opened would reconnect forever with
  nobody to close it. It never carries the visitor's session either: a call to another origin sends only the `jwt`
  its caller gave the clone.
- **In `srvkit/`, type a clone by the calls it makes, never as the app's `Fetch`.** `Fetch` types each endpoint by
  what its service returns, so a service that uses that srvkit class closes a type cycle tsc reports as hundreds of
  errors. Declare an `interface` of those calls, load `fetch` lazily (`await import("../lib/sig")`), and cast the
  clone once: `fetch.clone({ origin }) as unknown as PeerCalls`.
- **Retry a call with `retry`, never with a loop of your own.** `fetch.clone({ origin, retry: {} })` (or a call's
  own `{ retry }`) tries again on an unreachable server, a 408/502/503/504, a 429 after its Retry-After and a 409
  `idempotencyInFlight`, backing off with jitter until the call's one deadline runs out. A mutation retries under
  one `Idempotency-Key` it mints, or the `idempotencyKey` you name, and the server runs it once per key, caller and
  arguments (Repeated Mutations above); a signed-out call, one whose handler returns a `Response`, and a call
  through MCP run every time. No other error is retried.
- **A failure another process reported travels as itself.** A server-to-server `fetch.<endpoint>(..., { origin })`
  restores the remote `Err` — the same class, key and `data` — so a hop that rethrows it answers its own caller
  with that error and the dictionary translates it. Never wrap the catch in a `new Error`, and never re-key it as a
  `new Err` of your own: both discard what the endpoint chose to say, and a bare `Error` is generalized to
  `Internal Server Error` on the way out.
- `String(err)` and `${err}` read `Err: <key> {…data}`, the data as one line of JSON with secret-named keys masked,
  so a ``logger.warn(`…: ${String(error)}`)`` keeps the exit code or status the `Err` carried.

## Body Types And Bytes

- `.body(...)` / `.param(...)` args accept `ConstantFieldTypeInput` only: scalars, model refs, or `enumOf(...)`.
  Numbers are `Int` or `Float` — `Number` is rejected (`pkgs/akanjs/signal/endpointInfo.ts`).
- **A model or scalar argument is checked against the request schema on every transport**: a wrong JSON type, a
  value outside its enum or a missing required field answers 400 with `data.name` naming the path
  (`data.items.2.price`); a defaulted field may be left out, an undeclared key is dropped, and a stored model's input
  keeps an absent field absent.
- **`Upload` is valid only inside a mutation flagged for file upload**:
  `mutation([cnst.File], { fileUpload: true }).body("files", [Upload])`, as the `file` module does. It is not a
  model field type. The other body args of such a mutation arrive typed as in a JSON body. A file's `type` on the
  server is what its name implies, not its bytes — check the bytes when the type matters.
- **`Binary` is raw bytes on the wire.** It is `Uint8Array` on both sides — a Node `Buffer` is one, so a server
  handler may pass one straight in — and it accepts base64 in either direction, so the same declaration serves a
  JSON body and a binary frame. A `Binary` return travels as base64 in an HTTP body. It is never a model field
  (`fieldRule`).
- **Never send bytes as `Any`.** `Any` passes a `Buffer` through untouched and `JSON.stringify` then spells it
  `{ type: "Buffer", data: number[] }`, which `JSON.parse` never restores; the result is 3.6x the wire and a shape
  that only breaks at the first byte-offset read. A return declared `Any` that turns out to be bytes fails instead
  of reaching the caller as `{}`, and MCP refuses a `Binary` return for the same reason it refuses `Any`.

## Binary Pubsub

- **`pubsub(Binary)` sends its payload in a websocket binary frame**, skipping the JSON `{ type: "pub" }`
  envelope and the base64 a JSON wire would need. The client's subscribe callback receives a `Uint8Array`.
  Nothing else is declared: the return type is the whole switch, and text and binary frames coexist on one
  socket, so every JSON endpoint is untouched. The optimization applies only when the **whole** return is
  `Binary` — `[Binary]`, or a `Binary` inside a model, falls back to base64.
- **A declared `Binary` room coalesces under backpressure**: while a socket cannot keep up the room keeps only
  its newest frame and drops the rest, which is what a telemetry or video stream wants. Declare
  `pubsub(Binary, { backpressure: "queue" })` when the frames are a sequence a subscriber must see in full, such
  as deltas against a base it already holds; the send buffer then grows with the slowest subscriber. Coalescing
  is keyed by the endpoint, not carried with the frame, so this process, an IPC deliver and a Redis fan-out all
  reach the same answer. Coalesced frames are counted in `pubsubCoalesceCount` on the replica's metrics report.
- **A `pubsub(Any)` that happens to carry bytes is framed too, and warns once.** `Any` passes a `Buffer` through
  untouched, so the transport sees bytes and sends them whole rather than as a number array — an undeclared
  publisher is fixed rather than left corrupt. It is still not the contract: it queues rather than coalescing
  (nobody declared lossy delivery for that room), and a Redis fan-out still JSON-stringifies it. Declare
  `Binary`.
- The federation gateway relays a binary frame unchanged, and Bun IPC carries bytes as bytes, so the only hop
  that needed teaching was the socket itself. A cross-server (Redis) fan-out encodes it as protobuf `bytes`.

## Mutation HTTP Verb

- A `mutation` is `POST`. `{ method: "PATCH" | "PUT" | "DELETE" }` moves it, and one path may carry several verbs
  — a `query` GET and a `mutation` POST on the same custom `path` are mounted side by side. Two endpoints claiming
  the same path **and** verb fail the boot rather than silently shadowing one another.
- Reach for it only when a foreign wire protocol forces the verb (a client you cannot change that sends
  `PATCH /rest/v1/<table>`). Akan's own `fetch.*` client, the OpenAPI document, and the API explorer all follow
  whatever is declared, so nothing needs restating per caller.
