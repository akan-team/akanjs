---
"akanjs": minor
---

Every request has one id: `x-request-id` on its response, `traceId` in the body of a failed call and on every log record written while it is answered.

- A request that arrives with a W3C `traceparent`, or else an `x-request-id` that is a UUID or 32 hex digits, keeps that id when it comes from a trusted proxy (`AKAN_TRUSTED_PROXIES`, the rule the forwarded address headers already follow). From any other caller the server mints its own id and keeps the caller's as `link` on the request line. An id of any other shape is not kept at all.
- The gateway settles the id once and hands it to the replica, so both write the same `traceId`. It no longer forwards a caller's `x-request-id` as it came.
- `SignalFailure.answer(error, extra)` builds the response `SignalContext.try` answers with, for a transport that catches a failure itself.

**Upgrading.** A trace id is now 32 lower-case hex digits (`0af7651916cd43dd8448eb211c80319c`) in place of `mdx3k2a1-4f9z0q`; a log query, a dashboard or a test that matched the old shape needs the new one. `akan logs --trace <id>` and `.trace <id>` take it unchanged. A client that sent its own `x-request-id` and read it back from logs now finds it under `link`, unless it reaches the server through a proxy listed in `AKAN_TRUSTED_PROXIES`. A proxy you trust should set or overwrite `traceparent` and `x-request-id` itself, as it does `x-forwarded-for`. `AKAN_BENCH_SKIP_REQUEST_ID` is gone.
