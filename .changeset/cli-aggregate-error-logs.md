---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A failed command prints the errors inside an AggregateError, not just its message.

- A `Bun.build` failure thrown as `new AggregateError(result.logs, "…")` printed only that message. An app plugin's `syncAssets` hook is one place that throws it, and there `akan sync` printed only `[licenseNotices] server graph failed` and dropped the `Could not resolve` lines that named the cause. The CLI now prints up to 20 inner errors under the message, then `…and N more`, then the `cause` chain. Bun build and resolve logs keep their `file:line:col`, and everything prints last, where a tail of the output keeps it.
- Any failed command's error now prints its `cause` chain as `Caused by:` lines, an AggregateError or not. A cause or an inner error that loops back on itself prints `[circular]` and ends there.
- `--json` is unchanged: its `error` field stays the one-line message.
- `akan build`, `typecheck` and `verify` already printed inner errors. They now stop at the same 20.
