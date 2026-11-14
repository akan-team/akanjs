---
"akanjs": minor
---

A failed call is now logged at a level that says how bad it was: a failure under 500 is `warn`, so it no longer looks like a crash, and a 5xx is one `error` record that carries the error's type and stack in its attributes. A crashed RSC worker now shows at `warn` instead of being hidden at `verbose`. This is minor because alerts and `--level error` filters see fewer lines. `SignalFailure.statusOf` and `SignalFailure.logAttrs` are new statics behind this.

**Upgrading.** These lines changed level or merged:

- `Error <type>-<key> / <ms>ms: …` from the `Logging` middleware, for an undeclared failure under 500: `warn` (was `error`). A declared error, a 429 and a by-id read that missed its own id stay `debug`. A 5xx no longer writes this line.
- `Error <type>-<key>: …` from the endpoint's logger is still `error`, and is now the only line a 5xx writes when `AKAN_LOG_CANONICAL` is off. It now also covers an `Exception` with a 5xx status, which used to get only the middleware line. Its message is the error's first line; `status`, `type`, `code` and `stack` are in its attributes instead of the message.
- `error <endpoint>` from `AKAN_LOG_CANONICAL`: `error` for a 5xx (was `warn`), with `type` and `stack`, and then the endpoint's line above is not written, so a 5xx is one record. Under 500 it stays `warn`. Its `status` is now the status HTTP answers, so an error that is not an `AkanError` reports 500 even if it sets its own `statusCode`.
- `[rsc] worker crashed, restarting in <n>ms (attempt <n>)`: `warn` (was `verbose`).
- The request line of a page (`<outcome> page:<route>`): a `redirect()` is now `ok page:<route>` at `info` with its 3xx status (was `error` at `warn` with status 500), and a `notFound()` is `warn` with status 404 (was 500). A page that crashes before its stream starts writes an `error` request line with `type` and `stack`, and then `render[<id>] failed url=…` is not written. Under 500 it stays `warn`.
- The request line of an internal job (cron, interval, timeout, init, destroy): a failure is `error` with `type` and `stack` (was `warn`). The `Schedule … error: …` line is still written too, so under `AKAN_LOG_CANONICAL` a failing job writes two `error` records. The Scheduler cannot tell whether a failure came from the traced job or from its own lease step, so it never skips its line.
- A call past its `timeout` answers 504 and is one `error` record like any 5xx. Its stack is the `Timeout` middleware's, not the handler's.
- A client that leaves mid-call writes no failure line: an agent turn answers 499 without throwing, so its request line is `ok` at `info`. A handler that throws because its abort signal fired is a 500 and is `error`, as before.

With `AKAN_LOG_CANONICAL` off, `render[<id>] failed url=…` is written as before, at `error`.

An alert on `error` that counted 4xx calls should match `warn` with a `status` under 500. A parser that read the stack out of the message should read `attrs.stack` in ndjson; the text format still prints the stack on its own lines, now under the record's line instead of inside its message.
