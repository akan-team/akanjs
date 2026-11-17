---
name: akan-transport
description: "Guard and tune endpoints on the wire: writing a Can<Verb><Model> guard, deadlines, cache, idempotency, rate limits, server-to-server calls, body types, bytes and HTTP verbs."
---

<!-- akan:generated -->

# Akan transport

## Guards

- Which guards each endpoint and slice names, `Public`, `static scope`, `static name`, the acting user and the
  service's second check are the `auth` rule, loaded with every `signal.ts` and `srvkit/` file.
- A resource guard is a `Can<Verb><Model>` class in the model library's `srvkit/guards.ts` that fails closed:
  no resource named, or a load that throws, is `false` (after a `logger.warn`). Admin bypass goes first.

## Endpoint options

- `{ timeout: <ms> }` is the deadline on both ends.
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

- `.body()` / `.param()` take scalars, model refs or `enumOf(...)`; the types they refuse are the `server` rule.
- Server to server, `fetch.clone({ origin })` opens no socket without `connect: true` and retries through `retry`.

Full detail: `get_guideline` with `transportRule`, or `mcpRule` for what a guard's scope does to an MCP listing.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-transport/references/transportRule-1.md` — Guards And Transports · Writing A Guard · Request Deadlines · Cached Answers · Repeated Mutations · …
- `.agents/skills/akan-transport/references/transportRule-2.md` — Body Types And Bytes · Binary Pubsub · Mutation HTTP Verb
