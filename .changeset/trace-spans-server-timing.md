---
"akanjs": minor
---

A trace's spans say where they ran and when, database calls are spans of their own, and a developer can read a call's timing from the response.

- `SpanRecord` gains `id`, `parentId`, `startMs` and optional `attrs` beside `name` and `durationMs`. The call's own span is `total`, with the trace's `spanId` as its id and its caller's span as its parent; it is recorded even when the call ran past the 64-span limit.
- Under `AKAN_TRACE=1` every database call is a span named `db:<model>.<op>` with `attrs: { model, op }`, where `op` is the store operation (`find`, `count`, `updateMany`, ...). No statement and no value is recorded. The metrics document lists them per endpoint with the other spans.
- A signal's HTTP response carries `Server-Timing` in a local runtime, and anywhere else only for a request whose `x-akan-debug` matches `AKAN_LOG_DEBUG_HEADER`. Such a request also records its spans for that one call, without `AKAN_TRACE`, so the header reads `total;dur=12.4, guards;dur=0.3, handler;dur=11.2, db;desc="memo.find";dur=9.8`.

**Upgrading.** Code that builds a `SpanRecord` itself, or compares `trace.spans` with `toEqual`, needs the new fields; reading `name` and `durationMs` is unchanged. `trace.endpoints[].spans` in `/_akan/app/metrics` gains one `db:<model>.<op>` entry per model and operation an endpoint used while `AKAN_TRACE=1`.
