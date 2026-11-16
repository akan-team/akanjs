---
"akanjs": minor
---

Every request has one id: `x-request-id` on its response, `traceId` in the body of a failed call and on every log record written while it is answered.

- The server mints the id. A request that arrives with a W3C `traceparent`, or else an `x-request-id` that is a UUID or 32 hex digits, keeps that id as `link` on every record it writes and on its request line; an id of any other shape is not kept at all. `akan logs --trace <id>` matches `link` as well as `traceId` and reads the id the way an inbound one is read, so a caller finds its request by the id it sent.
- The gateway settles the id once and hands it to the replica over its unix socket, so both write the same `traceId`. It no longer forwards a caller's `x-request-id` as it came.
- `AKAN_TRACE_ADOPT=trusted-proxies` lets a proxy choose the id: a peer `AKAN_TRUSTED_PROXIES` names by address, by CIDR or with `private`. Loopback and the private ranges count only when the list spells them, and `*` does not. Turn it on only when that proxy overwrites or strips `traceparent` and `x-request-id` on every request.
- `SignalFailure.answer(error, extra)` builds the response `SignalContext.try` answers with, for a transport that catches a failure itself. The OpenAPI error schema lists `traceId`.

**Upgrading.** A trace id is now 32 lower-case hex digits (`0af7651916cd43dd8448eb211c80319c`) in place of `mdx3k2a1-4f9z0q`; a log query, a dashboard or a test that matched the old shape needs the new one. With no setting, the id on a response is always the server's own. A client that sent its own `x-request-id` and read it back from logs now finds it as `link`, stored in lower case without dashes (`0AF76519-16CD-43DD-8448-EB211C80319C` becomes `0af7651916cd43dd8448eb211c80319c`); `akan logs --trace` and `.trace` accept it as it was sent. A proxy in front that should choose the id needs `AKAN_TRACE_ADOPT=trusted-proxies` and its address in `AKAN_TRUSTED_PROXIES`. `AKAN_BENCH_SKIP_REQUEST_ID` is gone.
