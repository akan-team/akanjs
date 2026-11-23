---
name: akan-err
description: "Throw errors the Akan way — a typed Err with a dictionary key, never a bare throw new Error. Lint-enforced."
---

<!-- akan:generated -->

# throw → Err

Domain code throws `new Err("<module>.error.<key>")` and registers the key as `[en, ko]` in that module's
dictionary `.error({})`. `throw new Error(...)` fails the build (`no-throw-raw-error.grit`).

## Getting the import side right

This is the common failure. Import `Err` from the source matching the **runtime side of the file**:

- server code: `import { Err } from "../dict"`
- UI: `from "@libs/<lib>/client"` or `from "@apps/<app>/client"`

Never `from "akanjs/common"` (`no-import-common-err.grit`): that `Err` takes any string, so a mistyped key compiles.

## Where the rule does not apply

The lint rule exempts tests, `*.constant.ts`, `common/**`, and `env/**`. The last two have **no legal `Err`
import path at all**, so keep throwing code out of them entirely rather than reaching for a workaround.

## Where each error belongs

Which file throws which error, and the sentinel best-effort code returns instead, are the `server` rule.
`try/catch` is rare and always converts an exception into a decision: a guard catches, warns, and returns `false`, or throws a keyed `Err.Forbidden` the caller must read; an adapter
catches, logs (`logger.error`), and returns `null`; a UI `try/finally` resets a spinner. A store action never
catches — let the framework toast the `Err`, or list it in the store's `static silent` when no screen waits on it
and its caller handles the rejection.
Client-side validation failure is `msg.error("<key>")` plus an early return, never a throw.

An `srvkit/` adapter belongs to no module: its keys go in the app's or lib's own service dictionary,
`lib/_<name>/<name>.dictionary.ts`, thrown as `new Err("<name>.error.<key>")` with `Err` from `"../lib/dict"`.

**An endpoint names the errors it throws on purpose** — `errors: { 409: ["ticket.error.locked"] }` in its signal
option, with keys its dictionary defines and never `base.error.*`. That is the status's OpenAPI response and a line
of the MCP tool's description; outside production a thrown key it leaves out warns once. A caller narrows with
`Err.is(error, "ticket.error.locked")`.

**A failure another process reported travels as itself.** A server-to-server `fetch.<endpoint>(…, { origin })`
restores the remote `Err` with its class, key and data. Rethrow it as-is — wrapping it in a `new Error`
discards what the endpoint chose to say, and a bare `Error` is generalized to "Internal Server Error" on the
way out.

Korean `.error()` messages end in `다.`.

**The framework's own failures carry a code.** A `NoDocumentError`, an `Exception` status class or another
`AkanError` names its kind in `code`; branch on that with `AkanError.is(error, "<code>")`, never on its message.

Every code, its status and whether the caller's JSON carries it: `get_guideline` with `errorCodes`.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-err/references/errorCodes.md` — Codes · Codes by status
