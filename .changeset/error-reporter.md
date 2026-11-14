---
"akanjs": minor
"@akanjs/cli": patch
---

An app hands the errors its users hit to an error tracker of its choice with `option.setErrorReporter`.

- **`option.setErrorReporter((error, context) => …)`** gets each server 5xx, render error, uncaught exception and unhandled rejection as a real `Error` with its `cause` chain. A 4xx never reaches it. `context` is `{ source, traceId, endpoint, routeId, accountId, digest }`: `source` is `server`, `render` or `process`, `traceId` the request id the response named as `x-request-id`, `endpoint` the `<type>:<key>` that answered, and `routeId` the route pattern, never the URL. A thrown value that is no `Error` arrives as one, with the value as its `cause`.
- **Each error is reported once, after the response.** The reporter runs off the request; one that throws or rejects is logged once and changes nothing else. Before a crashed process exits, it waits up to 2 seconds for the reporter.
- **It runs in the server that answers**, the solo server or each replica. A render error in the RSC worker reaches the replica's reporter with its digest, route pattern, request id and account id, and its cause chain to five levels. The gateway loads no `option.ts` and reports nothing.
- New exports: `ErrorReporter`, `ErrorReportContext` and `ErrorReportSource` from `akanjs/signal`.

**Upgrading.** Nothing changes until an app calls the option. An app that forwarded errors through a `Logger.addSink` that parsed error lines can move to `setErrorReporter`, which gets the `Error` itself; keep the sink only for lines that are not errors. A lib may set it; the app's call wins, and `setErrorReporter(null)` clears a lib's reporter.
