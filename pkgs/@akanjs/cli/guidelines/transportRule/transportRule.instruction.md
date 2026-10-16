# Transport Rule — Guards, Sockets, Deadlines, Rate Limits, Server-To-Server Calls, Bytes, HTTP Verbs

How a call reaches a signal: what a guard may read on either transport, how a websocket carries its credential
and its per-connection state, how long a call may take and what it may cache or count, how one server calls
another, which body types and bytes cross the wire, when a pubsub payload leaves JSON for a binary frame, and which
HTTP verb a mutation is mounted under. `conventions` carries the invariants — this is the full contract behind them.

## Guards And Transports

- Guards run on both HTTP and websocket calls. Read the caller with `context.get<T>("account")` (`pkgs/akanjs/signal/signalContext.ts`) instead of branching on `getHttpContext()` / `getWebSocketContext()`.
- Slice-level `guards` only reach the generated query/mutation endpoints. A `pubsub`/`message` endpoint is unguarded unless it declares its own `guards` in its signal option.
- **Every endpoint that declares no guards is named in a boot `warn`**, since it answers anyone over HTTP and
  WebSocket — a named slice's `init()`, a root slice, a `pubsub`/`message`/`query`/`mutation`. Write
  `guards: [Public]` to keep one open on purpose.
- **A generated verb is taken off HTTP with `guards: { cru: false }`** (or `get`/`create`/`update`/`remove:
  false`), and a verb whose guards resolve to none is not mounted at all. `mcp: { cru: false }` does **not** do
  this: it keeps the verbs off the agent shelf while HTTP serves them to whoever passes their guards.
- A pubsub room is authorized once, at subscribe. When a socket's credential changes the framework re-runs each room's guards and unsubscribes the ones that now fail (`SignalResolver.revalidateWsRooms`), so guards must stay side-effect free and safe to re-run. Each re-check runs on a fresh `SignalContext`, so a guard that memoizes per context answers anew.
- **Arguments are parsed after the `"account"` guards** (`SignalContext.init` reads the body, `exec` parses): the order is middlewares → `account` guards → parse → `resource` guards → internal arguments → handler, whatever order `guards: [...]` lists them in. A caller an account guard refuses never reaches a scalar parser, which is what keeps a slow parser from being a pre-auth denial of service. A guard or middleware that reads `context.args` / `getArg()` earlier still gets the value, parsed on first read — a mismarked account guard keeps working. One visible consequence: an unauthenticated call with a malformed argument answers 401/403 instead of 400.
- A websocket carries its credential in the handshake snapshot on `ws.data` (`AppWsData`); clients that hold the token in memory send it with `fetch.setJwt(...)`, which forwards an auth frame over the socket.
- **Never read the caller's IP off the socket or the request peer — take `.with(Ip)`.** Whenever a federation
  gateway is in front, `ws.remoteAddress` and the child's own peer are the *gateway* (`127.0.0.1`) for every
  caller and for the whole life of every socket. `Ip` reads what a proxy recorded (`x-real-ip`, then the first
  `x-forwarded-for` entry) and falls back to the peer only when nothing proxied the call — which is the answer
  for a solo process behind an ingress that sets neither; `context.getClientIp()` is the same answer inside a
  guard or middleware. It arrives unwrapped from
  its `::ffff:` IPv4-mapped form, so it can address a `udp4` socket as well as identify a caller, and it is
  `null` rather than a placeholder when genuinely unknown — a loopback-looking address for an unknown caller
  is the failure this replaced. The gateway also forwards the client port (`x-forwarded-port`, read with
  `context.getClientPort()`) along with host and protocol.
- **A device or another server proves itself with a machine token.** `MachineToken.issue({ kind, id, version },
  { expiresAt? })` in `akanjs/server` signs an EdDSA JWT (`typ: akan-machine+jwt`, `aud: <app>/<environment>`) with
  `AKAN_MACHINE_PRIVATE_KEY`; it never expires unless asked. `akan machine-keygen <file>` writes that key to a file
  and prints only the public one. A server with either key (`AKAN_MACHINE_PRIVATE_KEY` or
  `AKAN_MACHINE_PUBLIC_KEY`) verifies the bearer of every call — HTTP, and the
  websocket's auth frame — after every lib middleware, and sets `account.machine = { kind, id, version }` from a
  verified token; it takes off a `machine` any other middleware or a session's claims put there, so a staff token
  can never pass for one, and a session middleware already reads the EdDSA token as anonymous. `.with(Machine)` hands
  the identity (401 without one; `{ nullable: true }` takes `null`), and a pubsub room's guards see it on subscribe
  and on every credential change. Revocation is the app's: a guard compares `machine.version` with the record's
  `tokenVersion`, which a removal or a reinstall bumps. An endpoint taking `.with(Machine)` on a server with no key
  is an error at boot. The calling side is `fetch.clone({ origin, jwt: token, connect: true })`.
- **Every socket carries a `socketId`, and only the framework mints one.** `AppWsData` assigns it at the handshake, and a `message` / `pubsub` handler reads it off the `Ws` internal arg — `.with(Ws)` hands `{ ws, socketId, subscribe, on, off }`. Never mint your own from `ws.data`: the room bookkeeping keys on the framework's id, and a second one fails to match it silently. It identifies a **connection**, not a caller — a reconnect gets a new id and the federation gateway's own socket is a different one — so per-user state keys on the account, never on this.

- **A socket that dropped comes back on a backoff, and asks for what it missed.** The client waits 1 s doubling to
  30 s, cut at random so a deploy's dropped clients return apart; `fetch.clone({ ws: { reconnect: { min, max, jitter,
  maxAttempts } | false, headers, tls, onStateChange, onRevoked, onError } })` (or `fetch.instance.configureWs(…)`)
  tunes it, and a server-side client sends `headers` and its token with the upgrade. A server numbers the JSON frames
  each room delivers (`seq`); a client drops a repeat, and a hole — a frame dropped under backpressure — calls the
  room's `onResync`. A resubscribe names its last frame (`since`): a server that saw every publish (a solo process)
  replays what followed it ahead of the ack, and otherwise answers a gap, which calls `onResync` as before. Binary
  rooms are not numbered.
- **A cleanup registered with `ws.on("disconnect" | "unsubscribe", fn)` is scoped to the call that registered it.**
  From a `pubsub` subscribe it belongs to that room — `unsubscribe` runs when the client leaves it or a credential
  change revokes it, `disconnect` when the socket closes while still subscribed — so a room already left runs
  neither again, and cleanup that must happen either way registers for both. From a `message` handler it belongs to
  the socket and runs at close. A handler that throws is logged and never blocks the rest of the teardown.
- **A subscribe the client leaves before it finishes joins nothing.** When an `unsubscribe` for the room, or the
  socket's close, arrives while the subscribe is still running, the subscribe answers `subscribe: false` and runs its
  `unsubscribe` cleanup (and its `disconnect` one when the socket closed) instead of joining the room.

## Writing A Guard

- **Resource guards are `Can<Verb><Model>` classes in `srvkit/guards.ts`** that `implements Guard` with an
  `async canPass(context)`. They **fail closed**: no resource named ⇒ `false`; a load that throws ⇒ `logger.warn`
  then `false`. Admin bypass goes first.
- **Keep `static name = "User";` on guard classes.** `fetch` serializes guard names and the API explorer filters
  on them; it looks like dead code, and deleting it breaks the UI. Comment it so the next reader knows.
- **Every guard class declares `static scope: GuardScope`, required with no default.** `"account"` means the
  verdict reads the caller and nothing about the call, so it can be evaluated with no arguments — which is what
  lets an MCP listing hide what this caller certainly cannot use. `"resource"` means it needs the call's arguments
  (`context.getArg()`) and fails closed without them, so it is never evaluated for a listing: the entry stays
  visible and is stopped at call time. Getting it wrong is not a type error, so the marker is mandatory rather than
  defaulted — `SignedIn` / `Admin` / role checks are `"account"`, and every `Can<Verb><Model>` is `"resource"`.
  What a mismarked guard does to a listing, and `static agents = false` on `Person`: `mcpRule`.
- **Guards ship with the library that owns the model** and are imported by its own signals through the package
  path, so a mounting app inherits authorization and cannot forget it.
- The acting user arrives via `.with(Self)` / `.with(CurrentUserId)` / `.with(Me)`; never trust a client-supplied
  id. Services re-check ownership even when a guard already gated the call — two independent gates.
- `srvkit/guards.ts` earns real comments: explain what would leak without each guard.

## Request Deadlines

- **`{ timeout: <ms> }` in an endpoint's signal option is the whole configuration surface**, and it reaches both
  ends of the call. Server side, the `Timeout` middleware races the handler against it and answers
  `base.error.gatewayTimeout` (504) once it is spent. Client side, `FetchSerializer` ships the value on the
  serialized endpoint and `fetch.<endpoint>()` uses it as that call's deadline — every retry of the call and every
  wait between them included — so the browser does not abandon a call the server is still allowed to be working on.
- **The middleware is registered by default and has no default of its own.** An endpoint that declares no
  `timeout` is passed straight through — a default here would put a deadline on every endpoint in the app that
  nobody asked for, which is why the middleware used to be opt-in and, being opt-in, made the declared value
  dead. It clears its timer in a `finally`: the race's loser is a pending timer per call otherwise, and with a
  five-minute budget that is a five-minute hold on the event loop for a call that answered in a millisecond.
- **Without a declaration the client's own default applies — 30 seconds** (`DEFAULT_TIMEOUT_MS`,
  `fetch/client/httpClient.ts`), and the server imposes nothing. Nothing else bounds a request: `Bun.serve` runs
  with `idleTimeout: 0`, so a long call is only ever ended by one of these two. An endpoint whose real work runs
  longer — provisioning, a firmware flow, an external orchestration — therefore has to declare one, or it dies
  mid-flight with a transport error that does not say whether the server ever received it.
- **Precedence is caller, then endpoint, then client default.** `fetch.x(…, { timeout: 5_000 })` overrides what
  the endpoint declared; `{ timeout: false }` waits as long as the runtime will. An app moves its own default
  with `fetch.instance.setTimeout(ms)` — `lib/useClient.ts` is generated, so the `timeout` option on
  `FetchClient.build` belongs to the template that writes it, not to app code.
- **A file upload is never bounded**, on any of those paths: a large body on a slow uplink is a request that is
  working, and the request body is the only thing the client can tell that from.
- **The deadline answers the caller; it does not undo the call.** `Promise.race` cannot cancel `next()`, so a
  handler that timed out keeps running and keeps writing. Reach for a `timeout` to bound what a *caller* waits
  for, not to bound an effect — an operation that must not half-happen needs its own idempotency or compensation.
- The failure is the same `base.error.gatewayTimeout` key whichever side gave up, so the user reads one sentence
  in their own language either way. What differs is the status code — 504 from the server's middleware, 408 from
  the client's own abort — and nothing downstream branches on that.

## Cached Answers

- **`{ cache: <ms> }` in an endpoint's signal option is the whole cache surface.** The lookup is a step of every
  call and stands aside unless an endpoint declares one.
- **Only a `query` that takes no internal argument may carry one.** The handler's inputs are its declared
  arguments plus its internal ones, so an endpoint with none of the latter answers the same thing to everyone who
  may read it — which is the only answer a shared entry can hold. An endpoint that takes `.with(Self)` answers
  per caller, and one entry would be one caller's answer handed to the next; that endpoint and every `mutation`
  are named once in the log and left uncached rather than silently ignored.
- **The guards run before every hit.** The lookup sits after the guards and the internal arguments, inside the
  call, so every middleware — the account resolution a lib registers among them — has already run and a hit
  reaches only a caller the guards admitted. It used to be a middleware ahead of the lib's, and a guard reading
  the account refused a signed-in caller on every hit. Shared is not public.
- **The entry is the handler's result, not the response.** The lookup wraps the handler only, so `resolveReturn`
  still runs per call on the cached value — field masking, `hidden`/`secret` stripping and relation resolution are
  never cached, and a relation still costs its own load. The cache saves the handler, not the serialization.
- **A hit hands `resolveReturn` an instance of the declared return model**, rebuilt from an entry that keeps its
  `Map`s, bytes and dates, so a `resolveField` reads the same methods and `Dayjs` values on a hit as on a miss. It is
  the declared model, not the service's document: a method only the document has is not there on a hit, and a return
  declared as a `Light` model shows `resolveField` its light fields only. The entry still holds `hidden` and `secret`
  values for its TTL, as the handler returned them.
- **A cache backend that is down does not take the endpoint down.** A failed read is warned and the call runs
  uncached; a failed write is warned and dropped.
- A call runs the cross-site check and an `ip` rate limit, then the body read, then the default middleware chain
  `Logging → Timeout → <lib middlewares>`, and inside it an `account` rate limit → account guards → argument
  parse → resource guards → internal arguments → cache → handler: a hung cache backend is bounded by the same
  deadline as the handler it stands in for. **`Retry` was removed** — an automatic re-run of an endpoint
  whose failure it cannot classify replays whatever the first attempt already did.

## Repeated Mutations

- **A mutation sent again under the same `Idempotency-Key` header runs once.** The key is checked after the
  resource guards and the internal arguments, and it is scoped to the endpoint, the caller and a digest of the
  arguments, so one caller's key never hands another caller its answer. A repeat while the first run is still going
  answers 409 `base.error.idempotencyInFlight`.
- **A repeat answers the first response as it was sent** — resolved, masked and serialized — for 24 hours. What
  is kept is that wire form, never the handler's result, so no `hidden` or `secret` field reaches the cache.
- A handler that throws frees the key, so a repeat runs it again. A failure after the handler returned is kept and
  replayed instead, for the same 24 hours and a transient one (a relation read during a database blip) included:
  the handler's writes stand, so running it again would repeat them.
- **Only an HTTP call is deduplicated.** A signed-out call, one whose handler returns a `Response` (whose headers,
  such as a session's `Set-Cookie`, cannot be replayed), a websocket call, and a call through MCP all run every
  time.

## Rate Limits

- **`{ rateLimit: { calls, windowMs?, by? } }` in an endpoint's signal option** counts calls per caller per window
  (`windowMs` 60 000 unless named). `by: "ip"` (the default) is checked in `SignalContext.init`, after the
  cross-site check and before the body is read, so a refused flood costs no parse at all. `by: "account"` is
  checked after the middlewares and before the guards, keyed by `accountKey(account)`; a caller it names nothing
  for — an anonymous one — is counted by address. Leaving a pubsub room is never counted.
- **The answer is 429 `base.error.tooManyRequests` with `data: { seconds }`** and a `Retry-After` header; a WS
  call gets the same payload as its error frame, and the HTTP client restores a proxy's own 429 — a page, or JSON
  naming no error key of ours — under the same key (seconds from its `Retry-After`, `0` included, else 60). The first
  refusal per endpoint per process is warned once; later ones log at `debug`, so a flood does not become a log flood.
- **Keys and addresses.** The address is `context.getClientIp()` — the trusted-proxy answer, never a raw header
  from an untrusted peer. Callers whose address is unknown share one `unknown` budget (fail closed), and the first
  such call is warned about, since it usually means the proxy in front records no `X-Real-IP`/`X-Forwarded-For`
  or is not trusted (`AKAN_TRUSTED_PROXIES`). A page's server-side fetches carry the visitor's address: the page
  renderer hands the RSC worker the address it resolved as `x-real-ip`, and the server-side fetch client forwards
  it on same-origin calls.
- **Counters live in the cache** (`CacheAdaptor.incr`, epoch-aligned windows), so replicas draw on one budget; a
  cache that fails falls back to counting per process, warned once. The MCP endpoint's own limiter is the same
  `RateLimiter` under its own topic, and keys an anonymous MCP caller by the same trusted address.
- **App and lib configuration** is `option.setRateLimit(...)` in `lib/option.ts`, merged in mount order with the
  app last: `budget` is the default for every endpoint that declares none (unset leaves those unlimited),
  `endpoints` overrides one by key — a lib's declared budget included — or exempts it with `false`, `accountKey`
  names who `by: "account"` counts (default: `account.id ?? sub ?? sid`; a lib whose accounts carry `self`/`me`
  should name `self.id ?? me.id`, or each session counts apart), and `enabled: false` (or `setRateLimit(false)`)
  turns budgets off for a deployment rate-limited at its edge. `rateLimit: false` on an endpoint exempts it from
  the app's `budget` only.
- **`AKAN_RATE_LIMIT`**: `off` turns every budget off whatever the code says; `on` turns them on in a `local`
  environment, where they are otherwise off; `<calls>[/<seconds>]` is the default budget wherever the code names
  none. Tests run in the `testing` environment, where budgets apply.
- **A business key is a service's own count**: `rateLimit: plug(RateLimit)` then
  ``await this.rateLimit.consume(`otp:${phone}`, { calls: 5, windowMs: 3_600_000 })``, which answers
  `{ ok: true } | { ok: false, retryAfterMs }` and is never switched off — throw the module's own `Err` with the
  wait when it refuses.

## Calling Another Server

- **A server-side `fetch.clone({ origin })` opens no websocket unless `connect: true`**, and neither does a clone
  of such a clone: it makes one-off calls to another server, and a socket it opened would reconnect forever with
  nobody to close it. It never carries the visitor's session either: a call to another origin sends only the `jwt`
  its caller gave the clone.
- **Retry a call with `retry`, never with a loop of your own.** `fetch.clone({ origin, retry: {} })` (or a call's
  own `{ retry }`) tries again on an unreachable server, a 502/503/504 and a 429 after its Retry-After, backing off
  with jitter until the call's one deadline runs out. A mutation retries under one `Idempotency-Key` it mints, or
  the `idempotencyKey` you name, and the server runs it once per key, caller and arguments (Repeated Mutations
  above); a signed-out call, one whose handler returns a `Response`, and a call through MCP run every time. A 4xx
  is never retried.
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

