---
name: akan-transport
description: "Guard and tune endpoints on the wire: writing a Can<Verb><Model> guard, deadlines, cache, idempotency, rate limits, server-to-server calls, body types, bytes and HTTP verbs."
---

<!-- akan:generated -->

# Akan transport

## Guards

- Every custom `query` / `mutation` / `pubsub` / `message` names its own `guards: [...]`; every `slice()` takes an
  explicit guard map with `root: Admin`. `Public` belongs on a slice `get:`, and on a mutation only for an act that
  must work signed out (sign-up, sign-in, token refresh, an OAuth route), which also declares a `rateLimit`.
- A resource guard is a `Can<Verb><Model>` class in the model library's `srvkit/guards.ts` that fails closed:
  no resource named, or a load that throws, is `false` (after a `logger.warn`). Admin bypass goes first.
- Every guard declares `static scope`: `"account"` reads only the caller (`SignedIn`, `Admin`, roles), and
  `"resource"` needs the call's arguments (every `Can<Verb><Model>`). Keep `static name = "User";` with a comment.
- Guards read `context.get<T>("account")`, serve HTTP and websocket alike, and stay side-effect free. The acting
  user comes from `.with(Self)` / `.with(CurrentUserId)` / `.with(Me)`, the address from `.with(Ip)` — never a
  client-supplied id. The service re-checks ownership: two independent gates.

## Endpoint options

- `{ timeout: <ms> }` is the deadline on both ends; undeclared, the client quits at 30 s and the handler is not
  cancelled.
- `{ cache }` only on a `query` with no internal argument, capped at one day; `invalidate(endpoint, args?)` drops
  it early through a plugged `EndpointCacheControl`.
- `{ rateLimit: { calls, windowMs?, by? } }` per endpoint, `option.setRateLimit` per app, `plug(RateLimit)` for a
  business key.
- A mutation repeated under one `Idempotency-Key` header runs once and replays its first answer.
- A browser send that changes nothing read back (typing status, a cursor move) passes `{ keepsReads: true }`, so it
  neither ends in-flight query sharing nor drops prefetched pages.
- `{ method: "PATCH" | "PUT" | "DELETE" }` moves a mutation off `POST` — only when a foreign protocol forces it.
- `errors: { 409: ["ticket.error.locked"] }` names the errors an endpoint throws on purpose.

## Bodies and other servers

- `.body()` / `.param()` take scalars, model refs or `enumOf(...)`; `Int` / `Float`, never `Number`; bytes are
  `Binary`, never `Any`; `Upload` only in a `fileUpload: true` mutation.
- Server to server, `fetch.clone({ origin })` opens no socket without `connect: true`, retries through `retry`,
  and rethrows a remote `Err` as it is — never wrap or re-key it.

Full detail: `get_guideline` with `transportRule`, or `mcpRule` for what a guard's scope does to an MCP listing.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-transport/references/transportRule-1.md` — Guards And Transports · Writing A Guard · Request Deadlines · Cached Answers · Repeated Mutations · …
- `.agents/skills/akan-transport/references/transportRule-2.md` — Mutation HTTP Verb
