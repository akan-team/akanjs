---
"akanjs": minor
---

A request's id follows it through every process and call it starts, so one search finds all of it.

- A page view is one id in the gateway, the replica and the RSC worker: the render message carries the request's `traceparent`, and the worker's `page:` trace and log records take it.
- A `fetch` call a server makes, while rendering or inside an endpoint, sends `traceparent` to this app's own server and to the server a `clone({ origin })` or a `FetchPolicy.origin` names. No other header is added, and calls made through `RemoteFetch` send none.
- Every frame of a websocket runs under the id of its handshake, each as a span of its own, and a refused frame names that id as `traceId`.
- A queued job runs as a trace of its own and names the call that enqueued it as `link` on its request line. The id travels as `traceLink` in the job's options (`AkanJobOptions.traceLink`), which the framework sets.

**Upgrading.** Nothing to change. A server that receives another akan server's calls adopts their `traceparent` only when the caller's address is in `AKAN_TRUSTED_PROXIES`; otherwise it keeps it as `link`.
